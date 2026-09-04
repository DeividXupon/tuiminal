import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import {
  budgetHttpHistory,
  createHttpSuccessHistoryEntry,
  groupHttpHistoryByRequest,
  HTTP_SESSION_BODY_BUDGET,
  redactHttpHistoryUrl,
} from "../src/features/http/model/history"
import type { HttpResponseSnapshot } from "../src/features/http/model/types"
import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../src/features/http/model/workspace"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "../src/features/http/storage/config"
import { loadHttpHistory, persistHttpHistoryEntry } from "../src/features/http/storage/history"

const directories: string[] = []

async function temporaryProject() {
  const directory = await mkdtemp(resolve(tmpdir(), "tuiminal-http-history-"))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

function response(id: string, body: Uint8Array): HttpResponseSnapshot {
  return {
    executionId: id,
    requestId: "request",
    requestRevision: 0,
    url: "https://example.test/users?token=secret&page=2",
    status: 200,
    statusText: "OK",
    headers: [["set-cookie", "session=secret"]],
    body,
    bodyKind: "json",
    contentType: "application/json",
    capturedBytes: body.length,
    truncated: false,
    downloadedBytes: body.length,
    encoding: "utf-8",
    redirects: [],
    timings: { headersMs: 1, downloadMs: 2, totalMs: 3 },
  }
}

function entry(id: string, body: Uint8Array) {
  const document = createHttpWorkspaceState(createScratchRequest("request")).documents[0]!
  return createHttpSuccessHistoryEntry(document, response(id, body), "local", 1)
}

describe("HTTP history budgeting", () => {
  test("keeps newest bodies inside the global budget and retains older metadata", () => {
    expect(HTTP_SESSION_BODY_BUDGET).toBe(12_000_000)
    const entries = budgetHttpHistory(
      [entry("new", new Uint8Array(4)), entry("old", new Uint8Array(4))],
      5,
    )
    expect(entries[0]?.response?.body).toHaveLength(4)
    expect(entries[1]?.response?.body).toBeUndefined()
    expect(entries[1]?.bodyDiscarded).toBe(true)
    expect(entries[1]?.status).toBe(200)
  })

  test("redacts credential-like query values without removing ordinary params", () => {
    expect(redactHttpHistoryUrl("https://x.test/?token=abc&page=2&apiKey=xyz")).toBe(
      "https://x.test/?token=%3Credacted%3E&page=2&apiKey=%3Credacted%3E",
    )
  })

  test("groups executions by stable request while preserving newest-first order", () => {
    const first = entry("first", new Uint8Array())
    const other = { ...entry("other", new Uint8Array()), requestId: "other", requestName: "Other" }
    const older = entry("older", new Uint8Array())

    expect(groupHttpHistoryByRequest([first, other, older])).toEqual([
      { requestId: "request", requestName: "Scratch", entries: [first, older] },
      { requestId: "other", requestName: "Other", entries: [other] },
    ])
  })
})

describe("persistent HTTP history", () => {
  test("is opt-in and stores protected metadata without response headers or body", async () => {
    const root = await temporaryProject()
    await persistHttpHistoryEntry(
      root,
      DEFAULT_HTTP_WORKSPACE_CONFIG,
      entry("off", new TextEncoder().encode('{"secret":"value"}')),
    )
    expect(await loadHttpHistory(root, DEFAULT_HTTP_WORKSPACE_CONFIG)).toEqual([])

    const config = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies: false },
    }
    await persistHttpHistoryEntry(
      root,
      config,
      entry("on", new TextEncoder().encode('{"secret":"value"}')),
    )
    const path = resolve(root, ".tuiminal/http/history.json")
    const source = await readFile(path, "utf8")
    expect(source).not.toContain("session=secret")
    expect(source).not.toContain('"secret":"value"')
    expect(source).not.toContain("token=secret")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const loaded = await loadHttpHistory(root, config)
    expect(loaded[0]).toMatchObject({ id: "on", persisted: true, bodyDiscarded: true })
    expect(loaded[0]?.response?.body).toBeUndefined()
  })

  test("restores an explicitly opted-in bounded body", async () => {
    const root = await temporaryProject()
    const config = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies: true },
    }
    const body = new TextEncoder().encode('{"ok":true}')
    await persistHttpHistoryEntry(root, config, entry("body", body))
    const loaded = await loadHttpHistory(root, config)
    expect(loaded[0]?.response?.body).toEqual(body)
    expect(loaded[0]?.bodyDiscarded).toBe(false)
  })

  test("drops malformed persisted entries and unsafe response payloads", async () => {
    const root = await temporaryProject()
    const directory = resolve(root, ".tuiminal/http")
    await mkdir(directory, { recursive: true })
    await writeFile(
      resolve(directory, "history.json"),
      JSON.stringify({
        version: 1,
        entries: [
          { id: 42, createdAt: "invalid" },
          {
            id: "metadata",
            createdAt: 1,
            requestId: "request",
            requestName: "Request",
            environmentName: null,
            method: "GET",
            url: "https://example.test/?token=secret",
            status: 200,
            durationMs: 3,
            error: "failed https://example.test/?token=secret",
            bodyDiscarded: false,
            response: { status: "not-a-number", bodyBase64: "not base64" },
          },
        ],
      }),
    )
    const config = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies: true },
    }
    const loaded = await loadHttpHistory(root, config)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ id: "metadata", bodyDiscarded: true })
    expect(loaded[0]?.url).not.toContain("secret")
    expect(loaded[0]?.error).not.toContain("secret")
    expect(loaded[0]?.response).toBeUndefined()
  })

  test("serializes concurrent history writes without dropping entries", async () => {
    const root = await temporaryProject()
    const config = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies: false },
    }
    await Promise.all([
      persistHttpHistoryEntry(root, config, entry("one", new Uint8Array())),
      persistHttpHistoryEntry(root, config, entry("two", new Uint8Array())),
    ])
    const loaded = await loadHttpHistory(root, config)
    expect(new Set(loaded.map(({ id }) => id))).toEqual(new Set(["one", "two"]))
  })
})
