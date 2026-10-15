import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
import { pullPostmanCollection } from "../packages/feature-http/src/postman/pull"
import { pushPostmanRequest } from "../packages/feature-http/src/postman/sync"
import { saveHttpRequest } from "../packages/feature-http/src/storage/collections"
import type { HttpCredentialStore } from "../packages/feature-http/src/storage/environments"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function fixture() {
  const collection = {
    info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        id: "r1",
        name: "List",
        event: [{ listen: "test", script: { exec: ["pm.test('kept', () => {})"] } }],
        request: {
          method: "GET",
          url: "https://example.test/users",
          header: [] as Array<{ key: string; value: string }>,
        },
      },
    ],
  }
  const updates: Record<string, unknown>[] = []
  const api = {
    async collections() {
      return [{ id: "c1", uid: "owner-c1", name: "Users" }]
    },
    async collection() {
      return structuredClone(collection)
    },
    async environments() {
      return []
    },
    async environment() {
      return { name: "", values: [] }
    },
    async globals() {
      return []
    },
    async updateRequest(_collectionId: string, _requestId: string, value: Record<string, unknown>) {
      updates.push(value)
      const item = collection.item[0]!
      if (value.name) item.name = String(value.name)
      Object.assign(item.request, value)
      return {}
    },
  }
  const store: HttpCredentialStore = {
    async get() {
      return null
    },
    async set() {},
    async delete() {
      return true
    },
  }
  return { collection, updates, api, store }
}

async function setup(withSecretHeader = false) {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-push-"))
  roots.push(root)
  const state = fixture()
  if (withSecretHeader) {
    state.collection.item[0]!.request.header.push({
      key: "Authorization",
      value: "Bearer private-token",
    })
  }
  const result = await pullPostmanCollection(
    root,
    state.api,
    { workspaceId: "w1", collectionId: "c1" },
    state.store,
  )
  const content = await readFile(resolve(root, result.path), "utf8")
  const file = parseHttpFile(content, result.path)
  const request = requestFromHttpFile(file, file.requests[0]!)
  return { root, result, request, ...state }
}

describe("Postman request push", () => {
  test("sends only changed request fields, keeps remote scripts, and updates the baseline", async () => {
    const state = await setup()
    const provenance = resolve(state.root, `${state.result.path}.postman.json`)
    expect((await stat(provenance)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(provenance, "utf8")).entries[0].key).toBe("list")
    if (state.request.source.kind === "file") {
      expect(
        serializeHttpRequestBlock({
          ...state.request,
          name: "Renamed",
          source: { ...state.request.source, path: "postman\\users.http" },
        }),
      ).toContain("# @name list")
    }
    expect(await pushPostmanRequest(state.root, state.api, state.request)).toBe("unchanged")
    expect(state.updates).toHaveLength(0)

    const saved = await saveHttpRequest(state.root, {
      ...state.request,
      name: "Renamed",
      method: "POST",
      url: "https://example.test/users/new",
    })
    expect(saved.source.kind).toBe("file")
    if (saved.source.kind === "file" && state.request.source.kind === "file") {
      expect(saved.source.blockId).toBe(state.request.source.blockId)
    }
    expect(await pushPostmanRequest(state.root, state.api, saved)).toBe("pushed")
    expect(state.updates).toEqual([
      {
        name: "Renamed",
        method: "POST",
        url: "https://example.test/users/new",
      },
    ])
    expect(state.collection.item[0]?.event).toHaveLength(1)
    expect(await pushPostmanRequest(state.root, state.api, saved)).toBe("unchanged")
  })

  test("refuses a changed remote request before sending", async () => {
    const state = await setup()
    const saved = await saveHttpRequest(state.root, {
      ...state.request,
      method: "POST",
    })
    state.collection.item[0]!.request.url = "https://someone-else.test/users"
    await expect(pushPostmanRequest(state.root, state.api, saved)).rejects.toThrow(
      "mudou no Postman",
    )
    expect(state.updates).toHaveLength(0)
  })

  test("refuses unsaved file changes and requests without account provenance", async () => {
    const state = await setup()
    const saved = await saveHttpRequest(state.root, { ...state.request, method: "POST" })
    await expect(pushPostmanRequest(state.root, state.api, state.request)).rejects.toThrow(
      "arquivo HTTP mudou",
    )
    await rm(resolve(state.root, `${state.result.path}.postman.json`))
    await expect(pushPostmanRequest(state.root, state.api, saved)).rejects.toThrow(
      "Associação Postman indisponível",
    )
    expect(state.updates).toHaveLength(0)
  })

  test("does not replace remote literal secrets with local private placeholders", async () => {
    const state = await setup(true)
    const saved = await saveHttpRequest(state.root, {
      ...state.request,
      headers: [
        ...state.request.headers,
        { id: "extra", enabled: true, name: "X-Client", value: "tuiminal", sensitivity: "normal" },
      ],
    })
    await expect(pushPostmanRequest(state.root, state.api, saved)).rejects.toThrow(
      "segredos privados importados",
    )
    expect(state.updates).toHaveLength(0)
  })

  test("sends edited query, headers, auth, and JSON body without sending local options", async () => {
    const state = await setup()
    const saved = await saveHttpRequest(state.root, {
      ...state.request,
      query: [{ id: "query", enabled: true, name: "active", value: "true", sensitivity: "normal" }],
      headers: [
        {
          id: "content-type",
          enabled: true,
          name: "Content-Type",
          value: "application/json",
          sensitivity: "normal",
        },
      ],
      auth: { kind: "bearer", token: "{{token}}" },
      body: { kind: "json", text: '{"value":1}', form: [] },
      options: { ...state.request.options, timeoutMs: 9_000 },
    })
    expect(await pushPostmanRequest(state.root, state.api, saved)).toBe("pushed")
    expect(state.updates[0]).toMatchObject({
      url: "https://example.test/users?active=true",
      headerData: [{ key: "Content-Type", value: "application/json", enabled: true }],
      auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
      dataMode: "raw",
      rawModeData: '{"value":1}',
      dataOptions: { raw: { language: "json" } },
    })
    expect(state.updates[0]).not.toHaveProperty("timeoutMs")
  })
})
