import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { pullPostmanCollection } from "../packages/feature-http/src/postman/pull"
import { refreshPostmanCollection } from "../packages/feature-http/src/postman/refresh"
import { postmanRemoteHash } from "../packages/feature-http/src/postman/sync"
import {
  loadHttpEnvironments,
  type HttpCredentialStore,
} from "../packages/feature-http/src/storage/environments"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(requestExtras: Record<string, unknown> = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-refresh-"))
  roots.push(root)
  const remote = {
    info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        id: "r1",
        name: "List",
        request: { method: "GET", url: "https://example.invalid/users", ...requestExtras },
      },
      { id: "r2", name: "List", request: { method: "GET", url: "" } },
    ],
  }
  const api = {
    async collections() {
      return [{ id: "c1", name: "Refresh" }]
    },
    async collection() {
      return structuredClone(remote)
    },
    async globals() {
      return []
    },
    async environments() {
      return []
    },
    async environment() {
      return { name: "Unused", values: [] }
    },
  }
  const values = new Map<string, string>()
  const credentials: HttpCredentialStore = {
    async get({ service, name }) {
      return values.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value }) {
      values.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      return values.delete(`${service}:${name}`)
    },
  }
  const { path } = await pullPostmanCollection(
    root,
    api,
    { workspaceId: "w1", collectionId: "c1" },
    credentials,
  )
  const absolute = resolve(root, path)
  const source = await readFile(absolute, "utf8")
  const sidecar = await readFile(`${absolute}.postman.json`, "utf8")
  return { root, api, remote, path, absolute, source, sidecar, credentials }
}

test("refreshes the same collection and preserves identities across renamed, added and removed requests", async () => {
  const f = await fixture()
  const previous = JSON.parse(f.sidecar)
  f.remote.item = [
    { id: "r2", name: "Renamed", request: { method: "POST", url: "https://example.invalid/new" } },
    { id: "r3", name: "Renamed", request: { method: "GET", url: "" } },
  ]
  const result = await refreshPostmanCollection(f.root, f.api, f.path)
  const sidecar = JSON.parse(await readFile(`${f.absolute}.postman.json`, "utf8"))
  expect((await readdir(resolve(f.root, "postman"))).sort()).toEqual([
    "refresh.http",
    "refresh.http.postman.json",
  ])
  expect(result.file.requests.map((block) => block.name)).toEqual(["Renamed", "Renamed"])
  expect(sidecar.entries[0].key).toBe(previous.entries[1].key)
  expect(new Set(sidecar.entries.map((entry: { key: string }) => entry.key)).size).toBe(2)
  expect(sidecar.entries.map((entry: { requestId: string }) => entry.requestId)).toEqual([
    "r2",
    "r3",
  ])
  expect(sidecar.collectionHash).toBe(postmanRemoteHash(f.remote))
  // A second refresh also recognizes the refreshed representation as clean.
  await refreshPostmanCollection(f.root, f.api, f.path)
})

test.each(["pending push", "deleted request", "comment", "options", "assertion"])(
  "preserves saved local changes: %s",
  async (kind) => {
    const f = await fixture()
    const changes: Record<string, string> = {
      "pending push": f.source.replace("/users", "/local"),
      "deleted request": "",
      comment: `# Local note\n${f.source}`,
      options: f.source.replace("GET https:", "# @timeout 5 s\nGET https:"),
      assertion: f.source.replace("GET https:", "# @assert status == 200\nGET https:"),
    }
    const source = changes[kind] ?? ""
    await writeFile(f.absolute, source)
    await expect(refreshPostmanCollection(f.root, f.api, f.path)).rejects.toThrow(
      "alterações locais",
    )
    expect(await readFile(f.absolute, "utf8")).toBe(source)
    expect(await readFile(`${f.absolute}.postman.json`, "utf8")).toBe(f.sidecar)
  },
)

test.each(["file", "sidecar", "open document", "remote failure"])(
  "refuses a stale refresh after %s changes",
  async (kind) => {
    const f = await fixture()
    let ready = true
    f.api.collection = async () => {
      if (kind === "file") await writeFile(f.absolute, `${f.source}# concurrent edit\n`)
      if (kind === "sidecar") await writeFile(`${f.absolute}.postman.json`, `${f.sidecar}\n`)
      if (kind === "open document") ready = false
      if (kind === "remote failure") throw new Error("fixture offline")
      return structuredClone(f.remote)
    }
    await expect(
      refreshPostmanCollection(f.root, f.api, f.path, () => {
        if (!ready) throw new Error("fixture dirty document")
      }),
    ).rejects.toThrow()
    expect(await readFile(f.absolute, "utf8")).toBe(
      kind === "file" ? `${f.source}# concurrent edit\n` : f.source,
    )
    expect(await readFile(`${f.absolute}.postman.json`, "utf8")).toBe(
      kind === "sidecar" ? `${f.sidecar}\n` : f.sidecar,
    )
  },
)

test("refresh protects imported credentials and retains query and body data", async () => {
  const f = await fixture({
    url: "https://example.invalid/users?page=1",
    auth: { type: "bearer", bearer: [{ key: "token", value: "fixture-secret" }] },
    body: { mode: "raw", raw: '{"value":1}' },
  })
  const result = await refreshPostmanCollection(f.root, f.api, f.path, undefined, f.credentials)
  const source = await readFile(f.absolute, "utf8")
  expect(source).toContain("?page=1")
  expect(source).toContain('{"value":1}')
  expect(source).not.toContain("fixture-secret")
  expect(await readFile(`${f.absolute}.postman.json`, "utf8")).not.toContain("fixture-secret")
  expect(await readFile(resolve(f.root, "http-client.private.env.json"), "utf8")).not.toContain(
    "fixture-secret",
  )
  const environments = await loadHttpEnvironments(f.root, f.credentials)
  expect(environments.find((item) => item.name === result.environmentName)?.values).toMatchObject({
    postman_1_list_bearer_token: "fixture-secret",
  })
})
