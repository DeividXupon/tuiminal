import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { projectFileHash } from "../packages/core/src/storage/project-files"
import { parseHttpFile } from "../packages/feature-http/src/model/http-file"
import { PostmanApi } from "../packages/feature-http/src/postman/api"
import {
  duplicatePostmanCollection,
  duplicatePostmanFolder,
} from "../packages/feature-http/src/postman/duplicate"
import {
  postmanRemoteHash,
  readPostmanProvenance,
  writePostmanProvenance,
} from "../packages/feature-http/src/postman/sync"

type Item = {
  id: string
  name: string
  item?: Item[]
  request?: { method: string; url: string }
  event?: unknown[]
}
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-postman-copy-"))
  roots.push(root)
  await mkdir(join(root, "postman"))
  const remote = {
    info: { name: "API" },
    item: [
      {
        id: "f1",
        name: "People",
        item: [
          {
            id: "r1",
            name: "List",
            request: { method: "GET", url: "https://example.invalid/users" },
            event: [{ listen: "test", script: { exec: ["// inert fixture"] } }],
          },
          { id: "f2", name: "Empty", item: [] },
        ],
      },
      { id: "r2", name: "Root", request: { method: "GET", url: "https://example.invalid" } },
    ] as Item[],
  }
  const blocks = [
    "### People / List\n# @name list\nGET https://example.invalid/users\n",
    "### Root\n# @name root\nGET https://example.invalid\n",
  ]
  const path = "postman/api.http"
  await writeFile(join(root, path), blocks.join("\n"))
  await writePostmanProvenance(root, path, "c1", remote, "w1")
  // Local order can diverge from remote order while stable IDs keep their associations.
  const source = blocks.reverse().join("\n")
  await writeFile(join(root, path), source)
  const calls: string[] = []
  let collectionCopy: typeof remote | undefined
  const assignIds = (items: Item[]): Item[] =>
    items.map((item, index) => ({
      ...item,
      id: `copy-${index}-${item.name.replaceAll(" ", "-")}`,
      ...(item.item ? { item: assignIds(item.item) } : {}),
    }))
  const api = {
    async collection(id: string) {
      return structuredClone(id === "c2" && collectionCopy ? collectionCopy : remote)
    },
    async createCollection(workspace: string, name: string, contents?: Record<string, unknown>) {
      calls.push(`collection:${workspace}:${name}`)
      collectionCopy = {
        info: { name },
        item: assignIds(structuredClone(contents?.item as Item[])),
      }
      return { id: "c2" }
    },
    async copyFolder(collectionId: string, folderId: string, parent?: string) {
      calls.push(`folder:${collectionId}:${folderId}:${parent ?? "root"}`)
      remote.item.push(
        ...assignIds(structuredClone(remote.item.filter((item) => item.id === folderId))),
      )
      return {}
    },
    async renameFolder(_collection: string, id: string, name: string) {
      const folder = remote.item.find((item) => item.id === id)
      if (folder) folder.name = name
      return {}
    },
  }
  return { root, path, source, hash: projectFileHash(source), remote, api, calls }
}

test("copies Postman collections without losing scripts or mixing reordered local IDs", async () => {
  const { root, path, source, hash, remote, api, calls } = await fixture()
  const copy = await duplicatePostmanCollection(root, api, path, "Copy", hash)
  expect(await readFile(join(root, copy), "utf8")).toBe(source)
  expect(await readFile(join(root, path), "utf8")).toBe(source)
  expect(calls).toEqual(["collection:w1:Copy"])
  const metadata = await readPostmanProvenance(join(root, `${copy}.postman.json`))
  expect(metadata.collectionId).toBe("c2")
  expect(metadata.entries.find((entry) => entry.key === "list")?.requestId).toBe("copy-0-List")
  expect(metadata.entries.find((entry) => entry.key === "root")?.requestId).toBe("copy-1-Root")
  const copied = await api.collection("c2")
  expect(copied.item[0]?.item?.[0]?.event).toEqual(remote.item[0]?.item?.[0]?.event)
  await expect(duplicatePostmanCollection(root, api, path, "Copy", hash)).rejects.toThrow()
  expect(calls).toHaveLength(1)
})

test("copies Postman folders, including empty descendants, and binds fresh request IDs", async () => {
  const { root, path, source, hash, remote, api, calls } = await fixture()
  const original = structuredClone(remote.item[0])
  await duplicatePostmanFolder(root, api, path, "f1", "People copy", hash)
  expect(calls).toEqual(["folder:c1:f1:root"])
  expect(remote.item[0]).toEqual(original)
  const content = await readFile(join(root, path), "utf8")
  expect(content.startsWith(source)).toBe(true)
  const parsed = parseHttpFile(content, path)
  expect(parsed.requests).toHaveLength(3)
  expect(parsed.requests.at(-1)?.name).toBe("People copy / List")
  const metadata = await readPostmanProvenance(join(root, `${path}.postman.json`))
  expect(metadata.entries.at(-1)?.requestId).toBe("copy-0-List")
  expect(metadata.entries.at(-1)?.key).not.toBe("list")
  expect(metadata.folders?.map((folder) => folder.path)).toContain("People copy / Empty")
  expect(metadata.collectionHash).toBe(postmanRemoteHash(remote))
})

test("rejects stale local/remote states and reports remote success followed by local failure", async () => {
  const { root, path, source, hash, remote, api, calls } = await fixture()
  await expect(duplicatePostmanFolder(root, api, path, "f1", "Copy", "stale")).rejects.toThrow(
    "local mudou",
  )
  await expect(duplicatePostmanFolder(root, api, path, "f1", "People", hash)).rejects.toThrow(
    "Já existe",
  )
  remote.info.name = "Edited elsewhere"
  await expect(duplicatePostmanCollection(root, api, path, "Copy", hash)).rejects.toThrow(
    "mudou no Postman",
  )
  expect(calls).toHaveLength(0)
  remote.info.name = "API"
  api.renameFolder = async () => {
    throw new Error("simulated write failure")
  }
  await expect(duplicatePostmanFolder(root, api, path, "f1", "Copy", hash)).rejects.toThrow(
    "cópia foi criada",
  )
  expect(await readFile(join(root, path), "utf8")).toBe(source)
  expect(remote.item).toHaveLength(3)
})

test("does not accept concurrent changes to original Postman items when copying a folder", async () => {
  const { root, path, source, hash, remote, api } = await fixture()
  const copy = api.copyFolder
  api.copyFolder = async (...args) => {
    const response = await copy(...args)
    const item = remote.item[1]
    if (item) item.name = "Collaborator edit"
    return response
  }
  await expect(duplicatePostmanFolder(root, api, path, "f1", "Copy", hash)).rejects.toThrow(
    "cópia foi criada",
  )
  expect(await readFile(join(root, path), "utf8")).toBe(source)
})

test("uses the regional folder transfer API with owner-qualified UIDs and a copy payload", async () => {
  const collection = "87654321-1234-1234-1234-123456789abc"
  const folder = "12345678-4321-4321-4321-123456789abc"
  const calls: { url: string; method: string | undefined; body: unknown }[] = []
  const api = new PostmanApi({ apiKey: "PMAK-fixture", region: "eu" }, async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    return Response.json(init?.method === "GET" ? { data: { owner: "12345678" } } : { ids: [] })
  })
  await api.copyFolder(`12345678-${collection}`, folder)
  expect(calls[1]).toEqual({
    url: "https://api.eu.postman.com/collection-folders-transfers",
    method: "POST",
    body: {
      ids: [`12345678-${folder}`],
      mode: "copy",
      target: { id: `12345678-${collection}`, model: "collection" },
      location: { position: "end" },
    },
  })
})
