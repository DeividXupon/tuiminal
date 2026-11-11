import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { parseHttpFile, requestFromHttpFile } from "../packages/feature-http/src/model/http-file"
import { readPostmanRequestDocumentation } from "../packages/feature-http/src/postman/documentation"
import { pullPostmanCollection } from "../packages/feature-http/src/postman/pull"
import { pushPostmanRequest } from "../packages/feature-http/src/postman/sync"
import { refreshPostmanCollection } from "../packages/feature-http/src/postman/refresh"
import { saveHttpRequest } from "../packages/feature-http/src/storage/collections"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(legacy = false) {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-docs-edit-"))
  roots.push(root)
  const item = {
    id: "r1",
    name: "Documentation",
    event: [{ listen: "test", script: { exec: ["pm.test('preserved', () => {})"] } }],
    request: {
      method: "GET",
      url: "https://example.invalid",
      description: { content: "# Original\n\nDescription." } as unknown,
    },
  }
  const collection = { item: [item] }
  const updates: Record<string, unknown>[] = []
  let ignore = false
  let fail = false
  const api = {
    async collections() {
      return [{ id: "c1", name: "Docs" }]
    },
    async collection() {
      return structuredClone(collection)
    },
    async environments() {
      return []
    },
    async environment() {
      return { name: "unused", values: [] }
    },
    async globals() {
      return []
    },
    async updateRequest(
      _collectionId: string,
      _requestId: string,
      update: Record<string, unknown>,
    ) {
      if (fail) throw new Error("fixture unavailable")
      updates.push(update)
      if (!ignore) Object.assign(item.request, update)
      return {}
    },
  }
  const { path } = await pullPostmanCollection(root, api, { workspaceId: "w1", collectionId: "c1" })
  const absolute = resolve(root, path)
  let source = await readFile(absolute, "utf8")
  if (legacy) {
    source = source.replace(/^# @description .*\n/gm, "")
    await writeFile(absolute, source)
    const metadata = JSON.parse(await readFile(`${absolute}.postman.json`, "utf8"))
    delete metadata.entries[0].baseline.description
    await writeFile(`${absolute}.postman.json`, JSON.stringify(metadata))
  }
  const file = parseHttpFile(source, path)
  const block = file.requests[0]
  if (!block) throw new Error("Missing request")
  return {
    root,
    path,
    absolute,
    api,
    item,
    updates,
    request: requestFromHttpFile(file, block),
    ignore: (value: boolean) => {
      ignore = value
    },
    fail: (value: boolean) => {
      fail = value
    },
  }
}

test.each([false, true])(
  "saves, pushes and clears documentation, including legacy copies: %s",
  async (legacy) => {
    const f = await fixture(legacy)
    expect(await readPostmanRequestDocumentation(f.root, f.api, f.request)).toContain("Original")
    const description = '# Edited é 日本語\n\n**Markdown**\n\n```json\n{"ok": true}\n```'
    const saved = await saveHttpRequest(f.root, { ...f.request, description })
    expect(await pushPostmanRequest(f.root, f.api, saved)).toBe("pushed")
    expect(f.updates).toEqual([{ description }])
    expect(f.item.request.description).toBe(description)
    expect(f.item.event[0]?.script.exec).toEqual(["pm.test('preserved', () => {})"])
    expect(
      JSON.parse(await readFile(`${f.absolute}.postman.json`, "utf8")).entries[0].baseline
        .description,
    ).toBe(description)
    expect(await pushPostmanRequest(f.root, f.api, saved)).toBe("unchanged")
    const cleared = await saveHttpRequest(f.root, { ...saved, description: "" })
    expect(await pushPostmanRequest(f.root, f.api, cleared)).toBe("pushed")
    expect(f.updates[1]).toEqual({ description: "" })
    expect(f.item.request.description).toBe("")
    const refreshed = await refreshPostmanCollection(f.root, f.api, f.path)
    expect(refreshed.file.requests[0]?.description).toBe("")
  },
)

test("an unrelated edit to a legacy request does not clear its remote documentation", async () => {
  const f = await fixture(true)
  const saved = await saveHttpRequest(f.root, { ...f.request, method: "POST" })
  expect(await pushPostmanRequest(f.root, f.api, saved)).toBe("pushed")
  expect(f.updates).toEqual([{ method: "POST" }])
  expect(f.item.request.description).toEqual({ content: "# Original\n\nDescription." })
})

test("remote conflicts and unconfirmed writes preserve the documentation draft and baseline", async () => {
  const f = await fixture()
  const saved = await saveHttpRequest(f.root, {
    ...f.request,
    description: "Pending documentation",
  })
  const sidecar = await readFile(`${f.absolute}.postman.json`, "utf8")
  f.item.request.description = "Changed by a collaborator"
  await expect(pushPostmanRequest(f.root, f.api, saved)).rejects.toThrow("mudou no Postman")
  expect(f.updates).toEqual([])
  f.item.request.description = { content: "# Original\n\nDescription." }
  f.fail(true)
  await expect(pushPostmanRequest(f.root, f.api, saved)).rejects.toThrow("fixture unavailable")
  f.fail(false)
  f.ignore(true)
  await expect(pushPostmanRequest(f.root, f.api, saved)).rejects.toThrow(
    "não confirmou a documentação",
  )
  expect(await readFile(`${f.absolute}.postman.json`, "utf8")).toBe(sidecar)
  expect(await readFile(f.absolute, "utf8")).toContain("Pending documentation")
  await expect(refreshPostmanCollection(f.root, f.api, f.path)).rejects.toThrow("alterações locais")
  f.ignore(false)
  expect(await pushPostmanRequest(f.root, f.api, saved)).toBe("pushed")
})
