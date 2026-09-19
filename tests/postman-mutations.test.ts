import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { projectFileHash } from "../packages/core/src/storage/project-files"
import { parseHttpFile, requestFromHttpFile } from "../packages/feature-http/src/model/http-file"
import {
  createPostmanCollection,
  createPostmanRequest,
  deletePostmanCollection,
  deletePostmanRequest,
  duplicatePostmanRequest,
  renamePostmanCollection,
  renamePostmanRequest,
} from "../packages/feature-http/src/postman/mutations"
import type { PostmanApi } from "../packages/feature-http/src/postman/api"
import { pullPostmanCollection } from "../packages/feature-http/src/postman/pull"
import { saveHttpRequest } from "../packages/feature-http/src/storage/collections"
import { pushPostmanRequest } from "../packages/feature-http/src/postman/sync"
import { savePostmanDraft } from "../packages/feature-http/src/postman/draft"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function fixture() {
  const remote = {
    info: {
      name: "Users",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [] as Array<{ id: string; name: string; request: { method: string; url: string } }>,
  }
  const calls: string[] = []
  const api = {
    async collection(id: string) {
      calls.push(`get:${id}`)
      return structuredClone(remote)
    },
    async createCollection(workspaceId: string, name: string) {
      calls.push(`create-collection:${workspaceId}:${name}`)
      remote.info.name = name
      return { id: "c1" }
    },
    async renameCollection(id: string, name: string) {
      calls.push(`rename-collection:${id}:${name}`)
      remote.info.name = name
      return {}
    },
    async deleteCollection(id: string) {
      calls.push(`delete-collection:${id}`)
      return {}
    },
    async createRequest(id: string, name: string) {
      calls.push(`create-request:${id}:${name}`)
      const requestId = `r${remote.item.length + 1}`
      remote.item.push({
        id: requestId,
        name,
        request: { method: "GET", url: "https://example.invalid" },
      })
      return { data: { id: requestId } }
    },
    async updateRequest(id: string, requestId: string, changes: Record<string, unknown>) {
      calls.push(`update-request:${id}:${requestId}`)
      const item = remote.item.find((candidate) => candidate.id === requestId)
      if (!item) throw new Error("Request fixture missing")
      if (typeof changes.name === "string") item.name = changes.name
      Object.assign(item.request, changes)
      return {}
    },
    async deleteRequest(id: string, requestId: string) {
      calls.push(`delete-request:${id}:${requestId}`)
      remote.item = remote.item.filter((item) => item.id !== requestId)
      return {}
    },
  } as unknown as PostmanApi
  return { api, calls, remote }
}

test("creates a collection in the selected Postman workspace and syncs its request lifecycle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const { api, calls, remote } = fixture()
  const path = await createPostmanCollection(root, api, "w2", "Users")
  expect(path).toBe("postman/Users.http")
  const provenancePath = resolve(root, `${path}.postman.json`)
  expect(JSON.parse(await readFile(provenancePath, "utf8")).workspaceId).toBe("w2")
  expect(calls).toContain("create-collection:w2:Users")

  const created = await createPostmanRequest(root, api, path, "List", projectFileHash(""))
  expect(calls).toContain("create-request:c1:List")
  expect(JSON.parse(await readFile(provenancePath, "utf8")).entries[0].requestId).toBe("r1")
  const renamed = await renamePostmanRequest(root, api, created, "Search")
  expect(remote.item[0]?.name).toBe("Search")
  expect(calls).toContain("update-request:c1:r1")

  await deletePostmanRequest(root, api, renamed)
  expect(calls).toContain("delete-request:c1:r1")
  expect(await readFile(resolve(root, path), "utf8")).toBe("")
  expect(JSON.parse(await readFile(provenancePath, "utf8")).entries).toEqual([])

  const renamedPath = await renamePostmanCollection(root, api, path, "People", projectFileHash(""))
  expect(renamedPath).toBe("postman/People.http")
  expect(calls).toContain("rename-collection:c1:People")
  expect(
    JSON.parse(await readFile(resolve(root, `${renamedPath}.postman.json`), "utf8")).collectionId,
  ).toBe("c1")
  await deletePostmanCollection(root, api, renamedPath, projectFileHash(""))
  expect(calls).toContain("delete-collection:c1")
  expect(await Bun.file(resolve(root, renamedPath)).exists()).toBe(false)
})

test("rejects remote changes before deleting a request or collection", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const { api, calls, remote } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  const created = await createPostmanRequest(root, api, path, "List", projectFileHash(""))
  const remoteRequest = remote.item[0]
  if (!remoteRequest) throw new Error("Request fixture missing")
  remoteRequest.request.url = "https://changed.example.test"
  await expect(deletePostmanRequest(root, api, created)).rejects.toThrow("mudou no Postman")
  await expect(
    deletePostmanCollection(
      root,
      api,
      path,
      projectFileHash(await readFile(resolve(root, path), "utf8")),
    ),
  ).rejects.toThrow("mudou no Postman")
  expect(calls).not.toContain("delete-request:c1:r1")
  expect(calls).not.toContain("delete-collection:c1")
})

test("rolls back a local request when Postman rejects creation", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const { api } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  api.createRequest = async () => {
    throw new Error("Postman indisponível")
  }
  await expect(createPostmanRequest(root, api, path, "List", projectFileHash(""))).rejects.toThrow(
    "Postman indisponível",
  )
  expect(await readFile(resolve(root, path), "utf8")).toBe("")
  expect(JSON.parse(await readFile(resolve(root, `${path}.postman.json`), "utf8")).entries).toEqual(
    [],
  )
})

test("renames a request inside a Postman folder without moving it", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const remote = {
    info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        id: "f1",
        name: "Folder",
        item: [{ id: "r1", name: "List", request: { method: "GET", url: "https://example.test" } }],
      },
    ],
  }
  const api = {
    async collections() {
      return [{ id: "c1", name: "Users" }]
    },
    async collection() {
      return structuredClone(remote)
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
    async updateRequest(
      _collectionId: string,
      _requestId: string,
      changes: Record<string, unknown>,
    ) {
      const item = remote.item[0]?.item[0]
      if (!item) throw new Error("Nested request fixture missing")
      item.name = String(changes.name)
      return {}
    },
  } as unknown as PostmanApi
  const pulled = await pullPostmanCollection(root, api, { workspaceId: "w1", collectionId: "c1" })
  const file = parseHttpFile(await readFile(resolve(root, pulled.path), "utf8"), pulled.path)
  const block = file.requests[0]
  if (!block) throw new Error("Imported request fixture missing")
  const request = requestFromHttpFile(file, block)
  const renamed = await renamePostmanRequest(root, api, request, "Search")
  expect(renamed.name).toBe("Folder / Search")
  expect(remote.item[0]?.item[0]?.name).toBe("Search")
})

test("a request push does not hide unrelated remote collection changes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const { api, remote, calls } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  const created = await createPostmanRequest(root, api, path, "List", projectFileHash(""))
  remote.item.push({
    id: "r2",
    name: "External",
    request: { method: "GET", url: "https://external.test" },
  })
  await renamePostmanRequest(root, api, created, "Search")
  const localHash = projectFileHash(await readFile(resolve(root, path), "utf8"))
  await expect(deletePostmanCollection(root, api, path, localHash)).rejects.toThrow(
    "mudou no Postman",
  )
  expect(calls).not.toContain("delete-collection:c1")
})

test("duplicates a linked request in Postman and keeps the new request editable", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const { api, remote, calls } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  const original = await createPostmanRequest(root, api, path, "List", projectFileHash(""))
  const changed = await saveHttpRequest(root, {
    ...original,
    method: "POST",
    url: "https://example.test/users",
  })
  await pushPostmanRequest(root, api, changed)
  const duplicate = await duplicatePostmanRequest(root, api, changed)
  expect(duplicate.name).toBe("List copy")
  expect(remote.item.map((item) => item.name)).toEqual(["List", "List copy"])
  expect(remote.item[1]?.request).toMatchObject({
    method: "POST",
    url: "https://example.test/users",
  })
  expect(calls).toContain("create-request:c1:List copy")
  const provenance = JSON.parse(await readFile(resolve(root, `${path}.postman.json`), "utf8"))
  expect(provenance.entries.map((entry: { requestId: string }) => entry.requestId)).toEqual([
    "r1",
    "r2",
  ])
})

test("saves a scratch request into a selected Postman collection", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-mutations-"))
  roots.push(root)
  const { api, remote } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  const draft = {
    ...createScratchRequest("draft", "https://example.test/new"),
    name: "Create user",
    method: "POST",
  }
  const saved = await savePostmanDraft(root, api, draft, path, projectFileHash(""))
  expect(saved.source).toMatchObject({ kind: "file", path })
  expect(remote.item[0]).toMatchObject({
    name: "Create user",
    request: { method: "POST", url: "https://example.test/new" },
  })
  expect(await readFile(resolve(root, path), "utf8")).toContain("POST https://example.test/new")
})
