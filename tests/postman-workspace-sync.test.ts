import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { syncPostmanWorkspace } from "../packages/feature-http/src/postman/workspace-sync"
import { loadLinkedPostmanCollections } from "../packages/feature-http/src/postman/collection-catalog"
import { parseHttpFile, requestFromHttpFile } from "../packages/feature-http/src/model/http-file"
import {
  pushPostmanRequest,
  readPostmanProvenance,
} from "../packages/feature-http/src/postman/sync"
import { saveHttpRequest } from "../packages/feature-http/src/storage/collections"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("loads every missing collection in a workspace without creating duplicate copies", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-workspace-"))
  roots.push(root)
  const fetched: string[] = []
  let globalsCalls = 0
  const collection = (name: string) => ({
    info: { name, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        id: `${name}-request`,
        name: "List",
        request: { method: "GET", url: "https://example.test" },
      },
    ],
  })
  const api = {
    async collections(workspaceId: string) {
      return workspaceId === "w1"
        ? [
            { id: "c1", name: "Users" },
            { id: "c2", name: "Orders" },
          ]
        : [{ id: "c3", name: "Other" }]
    },
    async collection(id: string) {
      fetched.push(id)
      return collection(id)
    },
    async globals() {
      globalsCalls += 1
      return []
    },
    async environments() {
      return []
    },
    async environment() {
      throw new Error("No environment")
    },
  } as Parameters<typeof syncPostmanWorkspace>[1]
  const progress: string[] = []
  const first = await syncPostmanWorkspace(root, api, "w1", (done, total) =>
    progress.push(`${done}/${total}`),
  )
  expect(first).toMatchObject({ collections: 2, imported: 2, requests: 2, errors: [] })
  expect(progress).toEqual(["1/2", "2/2"])
  expect(fetched).toEqual(["c1", "c2"])
  expect(globalsCalls).toBe(1)
  const paths = ["postman/users.http", "postman/orders.http"] as const
  expect(await loadLinkedPostmanCollections(root, paths)).toEqual([
    { filePath: paths[0], workspaceId: "w1", collectionId: "c1" },
    { filePath: paths[1], workspaceId: "w1", collectionId: "c2" },
  ])
  expect(await readFile(resolve(root, paths[0]), "utf8")).toContain("GET https://example.test")
  const second = await syncPostmanWorkspace(root, api, "w1")
  expect(second).toMatchObject({ collections: 2, imported: 0, requests: 0, errors: [] })
  expect(fetched).toEqual(["c1", "c2"])
  const other = await syncPostmanWorkspace(root, api, "w2")
  expect(other).toMatchObject({ collections: 1, imported: 1, requests: 1, errors: [] })
  expect(fetched).toEqual(["c1", "c2", "c3"])
  expect(globalsCalls).toBe(2)
})

test("repairs duplicate request IDs in an existing linked Postman collection", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-duplicate-"))
  roots.push(root)
  const remote = {
    info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: ["r1", "r2", "r3"].map((id) => ({
      id,
      name: "New Request",
      request: { method: "GET", url: `https://example.test/${id}` },
    })),
  }
  const api = {
    async collections() {
      return [{ id: "c1", name: "Repeated" }]
    },
    async collection() {
      return remote
    },
    async globals() {
      return []
    },
    async environments() {
      return []
    },
    async environment() {
      throw new Error("No environment")
    },
  } as Parameters<typeof syncPostmanWorkspace>[1]
  const first = await syncPostmanWorkspace(root, api, "w1")
  expect(first.errors).toEqual([])
  const filePath = "postman/repeated.http"
  const path = resolve(root, filePath)
  const sidecarPath = `${path}.postman.json`
  const initially = parseHttpFile(await readFile(path, "utf8"), filePath)
  expect(initially.requests.map((block) => block.blockId)).toEqual([
    `${filePath}#new-request`,
    `${filePath}#new-request-2`,
    `${filePath}#new-request-3`,
  ])
  const legacy = (await readFile(path, "utf8")).replaceAll(
    /# @name new-request-\d+/g,
    "# @name new-request",
  )
  await writeFile(path, legacy)
  const oldSidecar = await readPostmanProvenance(sidecarPath)
  oldSidecar.entries = oldSidecar.entries.map((entry) => ({ ...entry, key: "new-request" }))
  await writeFile(sidecarPath, JSON.stringify(oldSidecar))

  const repaired = await syncPostmanWorkspace(root, api, "w1")
  expect(repaired).toMatchObject({ imported: 0, errors: [] })
  const file = parseHttpFile(await readFile(path, "utf8"), filePath)
  expect(file.requests.map((block) => block.blockId)).toEqual(
    initially.requests.map((block) => block.blockId),
  )
  const sidecar = await readPostmanProvenance(sidecarPath)
  expect(sidecar.entries.map((entry) => [entry.key, entry.requestId])).toEqual([
    ["new-request", "r1"],
    ["new-request-2", "r2"],
    ["new-request-3", "r3"],
  ])
  const second = requestFromHttpFile(file, file.requests[1]!)
  const saved = await saveHttpRequest(root, { ...second, method: "POST" })
  expect(saved.id).toBe(second.id)
  let updatedId = ""
  expect(
    await pushPostmanRequest(
      root,
      {
        collection: api.collection,
        async updateRequest(_collectionId, requestId, changes) {
          updatedId = requestId
          Object.assign(remote.item[1]!.request, changes)
          return {}
        },
      },
      saved,
    ),
  ).toBe("pushed")
  expect(updatedId).toBe("r2")
  expect(remote.item[0]?.request.method).toBe("GET")
  expect((await syncPostmanWorkspace(root, api, "w1")).errors).toEqual([])
})
