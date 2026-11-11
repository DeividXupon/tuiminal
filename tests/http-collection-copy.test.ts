import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { projectFileHash } from "../packages/core/src/storage/project-files"
import { parseHttpFile, requestFromHttpFile } from "../packages/feature-http/src/model/http-file"
import {
  copyHttpBlocks,
  duplicateHttpRequestInCollection,
} from "../packages/feature-http/src/storage/collection-copy"
import {
  duplicateHttpCollection,
  duplicateHttpFolder,
} from "../packages/feature-http/src/storage/collection-management"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-copy-"))
  roots.push(root)
  await mkdir(join(root, "Team/nested/empty"), { recursive: true })
  const source = "### Original\n# @name original\nGET https://example.invalid\n"
  await writeFile(join(root, "Team/nested/api.http"), source)
  return {
    root,
    source,
    files: [{ path: "Team/nested/api.http", sourceHash: projectFileHash(source) }] as const,
  }
}

test("copies collections and nested folders exclusively, preserving original bytes", async () => {
  const { root, source, files } = await fixture()
  const path = await duplicateHttpCollection(root, files[0].path, "Copy", files[0].sourceHash)
  expect(await readFile(join(root, path), "utf8")).toBe(source)
  await rm(join(root, path))
  await duplicateHttpFolder(root, "Team", "Team copy", files)
  expect(await readFile(join(root, "Team copy/nested/api.http"), "utf8")).toBe(source)
  expect(await Bun.file(join(root, "Team/nested/api.http")).text()).toBe(source)
  await expect(duplicateHttpFolder(root, "Team", "Team copy", files)).rejects.toThrow()
  await expect(
    duplicateHttpCollection(root, files[0].path, "api", files[0].sourceHash),
  ).rejects.toThrow()
  await writeFile(join(root, "Team/nested/api.http"), `${source}\n# changed`)
  await expect(duplicateHttpFolder(root, "Team", "Another", files)).rejects.toThrow("mudou")
  await expect(
    duplicateHttpCollection(root, files[0].path, "Another", files[0].sourceHash),
  ).rejects.toThrow("mudou")
})

test("rejects folders with symlinks or non-HTTP contents before publishing a copy", async () => {
  const { root, files } = await fixture()
  await writeFile(join(root, "Team/notes.txt"), "keep")
  await expect(duplicateHttpFolder(root, "Team", "Copy", files)).rejects.toThrow("não são coleções")
  expect(await Bun.file(join(root, "Team/notes.txt")).text()).toBe("keep")
  await rm(join(root, "Team/notes.txt"))
  await symlink(join(root, "Team/nested/api.http"), join(root, "Team/link.http"))
  await expect(duplicateHttpFolder(root, "Team", "Copy", files)).rejects.toThrow()
  expect(await Bun.file(join(root, "Copy/nested/api.http")).exists()).toBe(false)
})

test("duplicates raw request blocks with distinct IDs and remaps copied dependency links", async () => {
  const { root } = await fixture()
  const source =
    "### Login\r\n# @name login\r\nPOST https://example.invalid/login\r\n\r\n{\"fixture\":true}\r\n\r\n### Users\r\n# @name users\r\n# @depends login\r\nGET https://example.invalid/users\r\n> {% client.log('inert fixture'); %}\r\n"
  const file = parseHttpFile(source, "raw.http")
  await writeFile(join(root, "raw.http"), source)
  const copy = parseHttpFile(
    copyHttpBlocks(file.requests, (block) => `${block.name} copy`),
    "raw.http",
  )
  expect(copy.requests).toHaveLength(2)
  expect(copy.requests[0]?.blockId).not.toBe(file.requests[0]?.blockId)
  const firstKey = copy.requests[0]?.blockId.split("#").at(-1)
  expect(copy.requests[1]?.rawText).toContain(`# @depends ${firstKey}`)
  expect(copy.requests[1]?.rawText).toContain("> {% client.log('inert fixture'); %}\r\n")
  const block = file.requests[1]
  if (!block) throw new Error("Missing fixture request")
  const original = requestFromHttpFile(file, block)
  const duplicated = await duplicateHttpRequestInCollection(root, original, "Copy")
  expect(duplicated.id).not.toBe(original.id)
  const content = await readFile(join(root, "raw.http"), "utf8")
  expect(content.startsWith(source)).toBe(true)
  expect(content.match(/client.log/g)).toHaveLength(2)
  await expect(duplicateHttpRequestInCollection(root, original, "Stale")).rejects.toThrow("mudou")
  await expect(duplicateHttpRequestInCollection(root, duplicated, "Copy")).rejects.toThrow(
    "Já existe",
  )
})
