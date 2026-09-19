import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { projectFileHash } from "../packages/core/src/storage/project-files"
import type { PostmanApi } from "../packages/feature-http/src/postman/api"
import {
  createPostmanCollection,
  createPostmanRequest,
} from "../packages/feature-http/src/postman/mutations"
import {
  createPostmanFolder,
  deletePostmanFolder,
  renamePostmanFolder,
} from "../packages/feature-http/src/postman/folder-mutations"
import { loadPostmanFolderCatalog } from "../packages/feature-http/src/postman/folder-catalog"
import { buildHttpCollectionTree } from "../packages/feature-http/src/model/collection-tree"
import { parseHttpFile, requestFromHttpFile } from "../packages/feature-http/src/model/http-file"

type Item = {
  id: string
  name: string
  item?: Item[]
  request?: { method: string; url: string }
}

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
    item: [] as Item[],
  }
  const calls: string[] = []
  let folderIndex = 0
  let requestIndex = 0
  const findFolder = (id: string, items = remote.item): Item | undefined => {
    for (const item of items) {
      if (item.id === id && item.item) return item
      const nested = findFolder(id, item.item ?? [])
      if (nested) return nested
    }
    return undefined
  }
  const deleteFolder = (id: string, items = remote.item): boolean => {
    const index = items.findIndex((item) => item.id === id && item.item)
    if (index >= 0) {
      items.splice(index, 1)
      return true
    }
    return items.some((item) => deleteFolder(id, item.item ?? []))
  }
  const api = {
    async collection() {
      return structuredClone(remote)
    },
    async createCollection() {
      return { id: "c1" }
    },
    async createFolder(_collectionId: string, name: string, parentId?: string) {
      const id = `f${++folderIndex}`
      calls.push(`create-folder:${name}:${parentId ?? "root"}`)
      ;(parentId ? findFolder(parentId)?.item : remote.item)?.push({ id, name, item: [] })
      return { data: { id } }
    },
    async renameFolder(_collectionId: string, id: string, name: string) {
      calls.push(`rename-folder:${id}:${name}`)
      const item = findFolder(id)
      if (item) item.name = name
      return { data: { id } }
    },
    async deleteFolder(_collectionId: string, id: string) {
      calls.push(`delete-folder:${id}`)
      deleteFolder(id)
      return { data: { id } }
    },
    async createRequest(_collectionId: string, name: string, folderId?: string) {
      const id = `r${++requestIndex}`
      calls.push(`create-request:${name}:${folderId ?? "root"}`)
      ;(folderId ? findFolder(folderId)?.item : remote.item)?.push({
        id,
        name,
        request: { method: "GET", url: "https://example.invalid" },
      })
      return { data: { id } }
    },
  } as unknown as PostmanApi
  return { api, calls, remote }
}

test("creates, nests, renames and deletes Postman folders with linked requests", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-folders-"))
  roots.push(root)
  const { api, calls, remote } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  await createPostmanFolder(root, api, path, "People")
  await createPostmanFolder(root, api, path, "Nested", "f1")
  const created = await createPostmanRequest(
    root,
    api,
    path,
    "People / Nested / List",
    projectFileHash(""),
    "f2",
  )
  expect(created.name).toBe("People / Nested / List")
  expect(calls).toContain("create-request:List:f2")

  const folders = await loadPostmanFolderCatalog(root, [path])
  expect(folders.map((folder) => folder.path)).toEqual(["People", "People / Nested"])
  const file = parseHttpFile(await readFile(resolve(root, path), "utf8"), path)
  const rows = buildHttpCollectionTree(
    file.requests.map((block) => ({ filePath: path, request: requestFromHttpFile(file, block) })),
    new Set(),
    "",
    ["postman"],
    [path],
    folders,
  )
  expect(rows.filter((row) => row.kind === "folder").map((row) => row.name)).toEqual([
    "People",
    "Nested",
  ])
  expect(rows.find((row) => row.kind === "request")?.depth).toBe(4)

  await renamePostmanFolder(
    root,
    api,
    path,
    "f1",
    "Customers",
    projectFileHash(await readFile(resolve(root, path), "utf8")),
  )
  expect(await readFile(resolve(root, path), "utf8")).toContain("Customers / Nested / List")
  expect((await loadPostmanFolderCatalog(root, [path])).map((folder) => folder.path)).toEqual([
    "Customers",
    "Customers / Nested",
  ])
  await deletePostmanFolder(
    root,
    api,
    path,
    "f1",
    projectFileHash(await readFile(resolve(root, path), "utf8")),
  )
  expect(await readFile(resolve(root, path), "utf8")).toBe("")
  expect(remote.item).toEqual([])
  expect((await loadPostmanFolderCatalog(root, [path])).length).toBe(0)
  expect(calls).toContain("delete-folder:f1")
})

test("rejects folder deletion after an unrelated remote collection edit", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-folders-"))
  roots.push(root)
  const { api, remote, calls } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  await createPostmanFolder(root, api, path, "People")
  remote.item.push({
    id: "r9",
    name: "External",
    request: { method: "GET", url: "https://x.test" },
  })
  await expect(deletePostmanFolder(root, api, path, "f1", projectFileHash(""))).rejects.toThrow(
    "mudou no Postman",
  )
  await expect(
    renamePostmanFolder(root, api, path, "f1", "Clients", projectFileHash("")),
  ).rejects.toThrow("mudou no Postman")
  await expect(createPostmanFolder(root, api, path, "Other")).rejects.toThrow("mudou no Postman")
  expect(calls).not.toContain("delete-folder:f1")
  expect(calls).not.toContain("rename-folder:f1:Clients")
  expect(calls).not.toContain("create-folder:Other:root")
})

test("folder rename preserves an unrelated request pending local changes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-postman-folders-"))
  roots.push(root)
  const { api } = fixture()
  const path = await createPostmanCollection(root, api, "w1", "Users")
  await createPostmanRequest(root, api, path, "Root", projectFileHash(""))
  await createPostmanFolder(root, api, path, "People")
  const localPath = resolve(root, path)
  const changed = (await readFile(localPath, "utf8")).replace(
    "https://example.invalid",
    "https://local.invalid",
  )
  await writeFile(localPath, changed)
  await renamePostmanFolder(root, api, path, "f1", "Customers", projectFileHash(changed))
  const sidecar = JSON.parse(await readFile(`${localPath}.postman.json`, "utf8")) as {
    entries: Array<{ baseline: { url: string } }>
  }
  expect(sidecar.entries[0]?.baseline.url).toBe("https://example.invalid")
  expect(await readFile(localPath, "utf8")).toContain("https://local.invalid")
})
