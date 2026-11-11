import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PostmanApi } from "../packages/feature-http/src/postman/api"
import { syncPostmanWorkspace } from "../packages/feature-http/src/postman/workspace-sync"
import {
  readPostmanProvenance,
  pushPostmanRequest,
} from "../packages/feature-http/src/postman/sync"
import { deletePostmanRequest } from "../packages/feature-http/src/postman/mutations"
import { parseHttpFile, requestFromHttpFile } from "../packages/feature-http/src/model/http-file"
import { saveHttpRequest } from "../packages/feature-http/src/storage/collections"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-postman-drafts-"))
  roots.push(root)
  const urls: unknown[] = ["", { raw: "" }, "https://example.invalid/third", {}, undefined]
  const remote = {
    info: {
      name: "Lps",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: urls.map((url, index) => ({
      id: `r${index + 1}`,
      name: "New Request",
      request: { method: "GET", url },
    })),
  }
  const updates: string[] = []
  const deletions: string[] = []
  let reads = 0
  let beforeRead: (() => Promise<void>) | undefined
  const api = {
    async collections() {
      return [{ id: "c1", name: "Lps" }]
    },
    async collection() {
      reads++
      await beforeRead?.()
      return structuredClone(remote)
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
    async updateRequest(_collection: string, id: string, changes: Record<string, unknown>) {
      updates.push(id)
      const item = remote.item.find((item) => item.id === id)
      if (!item) throw new Error("Missing fixture request")
      Object.assign(item.request, changes)
      return {}
    },
    async deleteRequest(_collection: string, id: string) {
      deletions.push(id)
      return {}
    },
  } as unknown as PostmanApi
  expect((await syncPostmanWorkspace(root, api, "w1")).errors).toEqual([])
  const path = "postman/lps.http"
  const sourcePath = join(root, path)
  const sidecarPath = `${sourcePath}.postman.json`
  const file = () => readFile(sourcePath, "utf8").then((source) => parseHttpFile(source, path))
  const legacy = async () => {
    const metadata = await readPostmanProvenance(sidecarPath)
    const first = metadata.entries[0]
    const third = metadata.entries[2]
    if (!first || !third) throw new Error("Missing imported associations")
    metadata.entries = [{ ...third, requestId: first.requestId, remoteHash: first.remoteHash }]
    delete metadata.requestMappingVersion
    await writeFile(sidecarPath, JSON.stringify(metadata))
    return metadata
  }
  return {
    root,
    path,
    sourcePath,
    sidecarPath,
    remote,
    api,
    file,
    legacy,
    updates,
    deletions,
    get reads() {
      return reads
    },
    beforeRead(callback: () => Promise<void>) {
      beforeRead = callback
    },
  }
}

test("imports five same-name requests, including empty URL variants, with distinct remote IDs", async () => {
  const h = await fixture()
  const file = await h.file()
  expect(file.requests.map((block) => block.name)).toEqual(Array(5).fill("New Request"))
  expect(file.requests.map((block) => block.url)).toEqual([
    "",
    "",
    "https://example.invalid/third",
    "",
    "",
  ])
  expect(new Set(file.requests.map((block) => block.blockId)).size).toBe(5)
  const metadata = await readPostmanProvenance(h.sidecarPath)
  expect(metadata.entries.map((entry) => entry.requestId)).toEqual(["r1", "r2", "r3", "r4", "r5"])
  expect((await syncPostmanWorkspace(h.root, h.api, "w1")).errors).toEqual([])
  expect(h.reads).toBe(1)
})

test("repairs legacy draft links without replacing local edits and pushes the correct remote request", async () => {
  const h = await fixture()
  await h.legacy()
  const file = await h.file()
  const block = file.requests[2]
  if (!block) throw new Error("Missing third request")
  const edited = await saveHttpRequest(h.root, {
    ...requestFromHttpFile(file, block),
    url: "https://example.invalid/edited",
  })
  const source = await readFile(h.sourcePath, "utf8")
  expect((await syncPostmanWorkspace(h.root, h.api, "w1")).errors).toEqual([])
  expect(await readFile(h.sourcePath, "utf8")).toBe(source)
  const metadata = await readPostmanProvenance(h.sidecarPath)
  expect(metadata.entries.map((entry) => entry.requestId)).toEqual(["r1", "r2", "r3", "r4", "r5"])
  expect(metadata.requestMappingVersion).toBe(2)
  expect(await pushPostmanRequest(h.root, h.api, edited)).toBe("pushed")
  expect(h.updates).toEqual(["r3"])
  expect(h.remote.item[0]?.request.url).toBe("")
  expect(h.remote.item[2]?.request.url).toBe("https://example.invalid/edited")
})

test("does not guess legacy links after remote changes or mutate a wrongly linked request", async () => {
  const h = await fixture()
  const metadata = await h.legacy()
  const file = await h.file()
  const block = file.requests[2]
  if (!block) throw new Error("Missing third request")
  const edited = await saveHttpRequest(h.root, {
    ...requestFromHttpFile(file, block),
    method: "POST",
  })
  const source = await readFile(h.sourcePath, "utf8")
  h.remote.info.name = "Changed remotely"
  expect((await syncPostmanWorkspace(h.root, h.api, "w1")).errors).toHaveLength(1)
  expect(await readFile(h.sourcePath, "utf8")).toBe(source)
  expect(await readPostmanProvenance(h.sidecarPath)).toEqual(metadata)
  await expect(pushPostmanRequest(h.root, h.api, edited)).rejects.toThrow(
    "Associação Postman inválida",
  )
  await expect(deletePostmanRequest(h.root, h.api, edited)).rejects.toThrow(
    "Associação Postman inválida",
  )
  expect(h.updates).toEqual([])
  expect(h.deletions).toEqual([])
})

for (const target of ["source", "sidecar"] as const)
  test(`preserves concurrent ${target} changes while repairing legacy draft links`, async () => {
    const h = await fixture()
    const metadata = await h.legacy()
    const path = target === "source" ? h.sourcePath : h.sidecarPath
    const content =
      target === "source"
        ? `${await readFile(path, "utf8")}\n# Concurrent edit\n`
        : JSON.stringify({ ...metadata, collectionName: "Concurrent name" })
    h.beforeRead(() => writeFile(path, content))
    expect((await syncPostmanWorkspace(h.root, h.api, "w1")).errors).toHaveLength(1)
    expect(await readFile(path, "utf8")).toBe(content)
  })
