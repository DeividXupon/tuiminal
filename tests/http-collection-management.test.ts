import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildHttpCollectionTree } from "../packages/feature-http/src/model/collection-tree"
import {
  createHttpCollection,
  createHttpFolder,
  createHttpRequestInCollection,
  deleteHttpCollection,
  deleteHttpFolder,
  renameHttpCollection,
  renameHttpFolder,
  renameHttpRequest,
} from "../packages/feature-http/src/storage/collection-management"
import {
  deleteHttpRequest,
  scanHttpProject,
} from "../packages/feature-http/src/storage/collections"
import { requestFromHttpFile } from "../packages/feature-http/src/model/http-file"
import type {
  HttpCollectionFile,
  HttpProjectCollection,
} from "../packages/feature-http/src/storage/collections"

function firstFile(project: HttpProjectCollection): HttpCollectionFile {
  const file = project.files[0]
  if (!file) throw new Error("Expected a collection file")
  return file
}

function requestAt(file: HttpCollectionFile, index: number) {
  const block = file.requests[index]
  if (!block) throw new Error("Expected a request block")
  return requestFromHttpFile(file, block)
}

const roots: string[] = []
async function root() {
  const path = await mkdtemp(join(tmpdir(), "tuiminal-http-tree-"))
  roots.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("HTTP collection management", () => {
  test("creates, lists, renames and removes folders, collections and individual requests", async () => {
    const home = await root()
    const folder = await createHttpFolder(home, "", "Equipe")
    const collection = await createHttpCollection(home, folder, "API")
    let project = await scanHttpProject(home)
    expect(project.directories).toContain("Equipe")
    expect(project.files.map((file) => file.path)).toContain("Equipe/API.http")
    expect(
      buildHttpCollectionTree(
        [],
        new Set(),
        "",
        project.directories,
        project.files.map((file) => file.path),
      ).map((row) => row.id),
    ).toContain("file:Equipe/API.http")

    const first = await createHttpRequestInCollection(
      home,
      collection,
      "Listar",
      firstFile(project).sourceHash,
    )
    project = await scanHttpProject(home)
    const second = await createHttpRequestInCollection(
      home,
      collection,
      "Criar",
      firstFile(project).sourceHash,
    )
    expect(second.name).toBe("Criar")
    await expect(
      createHttpRequestInCollection(
        home,
        collection,
        "Listar",
        firstFile(await scanHttpProject(home)).sourceHash,
      ),
    ).rejects.toThrow("Já existe")

    project = await scanHttpProject(home)
    const currentFirst = requestAt(firstFile(project), 0)
    const renamed = await renameHttpRequest(home, currentFirst, "Consultar")
    expect(renamed.name).toBe("Consultar")
    project = await scanHttpProject(home)
    await deleteHttpRequest(home, requestAt(firstFile(project), 1))
    expect(await readFile(join(home, collection), "utf8")).toContain("Consultar")
    expect(await readFile(join(home, collection), "utf8")).not.toContain("Criar")

    project = await scanHttpProject(home)
    const renamedCollection = await renameHttpCollection(
      home,
      collection,
      "Service",
      firstFile(project).sourceHash,
    )
    const renamedFolder = await renameHttpFolder(home, folder, "Backend")
    expect(await readFile(join(home, renamedFolder, "Service.http"), "utf8")).toContain("Consultar")
    project = await scanHttpProject(home)
    await deleteHttpCollection(
      home,
      join(renamedFolder, "Service.http"),
      firstFile(project).sourceHash,
    )
    await deleteHttpFolder(home, renamedFolder)
    expect((await scanHttpProject(home)).directories).toEqual([])
    expect(first.url).toBe("https://example.invalid")
    expect(renamedCollection).toBe("Equipe/Service.http")
  })

  test("rejects stale files and leaves unrelated folder contents untouched", async () => {
    const home = await root()
    const folder = await createHttpFolder(home, "", "Equipe")
    const collection = await createHttpCollection(home, folder, "API")
    const staleHash = firstFile(await scanHttpProject(home)).sourceHash
    await writeFile(join(home, collection), "GET https://example.invalid\n")
    await expect(deleteHttpCollection(home, collection, staleHash)).rejects.toThrow("mudou")
    await expect(renameHttpCollection(home, collection, "Outra", staleHash)).rejects.toThrow(
      "mudou",
    )
    await writeFile(join(home, folder, "notes.txt"), "keep")
    await expect(deleteHttpFolder(home, folder)).rejects.toThrow("não são coleções")
    expect(await readFile(join(home, folder, "notes.txt"), "utf8")).toBe("keep")
  })
})
