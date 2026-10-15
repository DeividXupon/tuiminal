import { link, lstat, readFile, readdir, realpath, rename, rmdir, unlink } from "node:fs/promises"
import { basename, dirname, extname, join, relative } from "node:path"
import {
  atomicWriteProjectFile,
  projectFileHash,
  removeSafeProjectFile,
  resolveSafeProjectFile,
} from "@xupon/tuiminal-core/storage/project-files"
import { parseHttpFile, requestFromHttpFile, serializeHttpRequestBlock } from "../model/http-file"
import type { HttpRequestDefinition } from "../model/types"
import { createScratchRequest } from "../model/workspace"
import { HttpCollectionConflictError, saveHttpRequest } from "./collections"

function checkedName(name: string) {
  const value = name.trim()
  if (
    !value ||
    value === "." ||
    value === ".." ||
    value === ".tuiminal" ||
    /[\\/\0\r\n]/.test(value)
  ) {
    throw new HttpCollectionConflictError("Use um nome sem barras ou caracteres de controle.")
  }
  return value
}

function collectionName(name: string) {
  const value = checkedName(name)
  return /\.(?:http|rest)$/i.test(value) ? value : `${value}.http`
}

function managedFile(path: string) {
  if (!/\.(?:http|rest)$/i.test(path)) {
    throw new HttpCollectionConflictError("Somente arquivos .http ou .rest podem ser excluídos.")
  }
}

function checkedFolderPath(path: string) {
  if (!path || path === ".tuiminal" || path === join(".tuiminal", "http")) {
    throw new HttpCollectionConflictError("Esta pasta é reservada pelo Tuiminal.")
  }
  return path
}

async function safeFolder(root: string, path: string) {
  const probe = await resolveSafeProjectFile(root, join(path, ".tuiminal-folder-probe"), {
    allowMissing: true,
  })
  return dirname(probe.path)
}

async function checkedCollection(root: string, path: string, expectedHash?: string) {
  managedFile(path)
  const resolved = await resolveSafeProjectFile(root, path)
  const source = await readFile(resolved.path, "utf8")
  if (expectedHash !== undefined && projectFileHash(source) !== expectedHash) {
    throw new HttpCollectionConflictError(
      "A coleção mudou fora do Tuiminal; atualize antes de continuar.",
    )
  }
  return { path: resolved.path, source, hash: projectFileHash(source) }
}

export async function createHttpCollection(root: string, parent: string, name: string) {
  const path = join(parent, collectionName(name))
  await atomicWriteProjectFile(root, path, "", { expectedHash: null, exclusive: true })
  return path
}

export async function renameHttpCollection(
  root: string,
  path: string,
  name: string,
  expectedHash: string,
) {
  const source = await checkedCollection(root, path, expectedHash)
  const destinationPath = join(dirname(path), collectionName(name))
  if (destinationPath === path) return path
  const destination = await resolveSafeProjectFile(root, destinationPath, { allowMissing: true })
  await link(source.path, destination.path)
  try {
    await unlink(source.path)
  } catch (error) {
    await unlink(destination.path).catch(() => undefined)
    throw error
  }
  return destinationPath
}

export async function deleteHttpCollection(root: string, path: string, expectedHash: string) {
  await checkedCollection(root, path, expectedHash)
  await removeSafeProjectFile(root, path, expectedHash)
}

export async function createHttpFolder(root: string, parent: string, name: string) {
  const path = join(parent, checkedName(name))
  const parentPath = await safeFolder(root, parent)
  try {
    await lstat(join(parentPath, basename(path)))
    throw new HttpCollectionConflictError("Já existe uma pasta com esse nome.")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const target = await resolveSafeProjectFile(root, join(path, ".tuiminal-folder-probe"), {
    allowMissing: true,
    createParents: true,
  })
  return relative(await safeFolder(root, ""), dirname(target.path))
}

async function folderContents(
  root: string,
  path: string,
): Promise<{ files: Array<{ path: string; hash: string }>; directories: string[] }> {
  const absolute = await safeFolder(root, checkedFolderPath(path))
  const canonicalRoot = await realpath(root)
  const files: Array<{ path: string; hash: string }> = []
  const directories: string[] = []
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name)
      if (entry.isSymbolicLink())
        throw new HttpCollectionConflictError("A pasta contém um symlink.")
      if (entry.isDirectory()) {
        await walk(child)
        directories.push(child)
      } else if (entry.isFile() && [".http", ".rest"].includes(extname(entry.name).toLowerCase())) {
        const relativePath = relative(canonicalRoot, child)
        const source = await checkedCollection(root, relativePath)
        files.push({ path: relativePath, hash: source.hash })
      } else {
        throw new HttpCollectionConflictError("A pasta contém arquivos que não são coleções HTTP.")
      }
    }
  }
  await walk(absolute)
  return { files, directories }
}

export async function renameHttpFolder(root: string, path: string, name: string) {
  const source = await safeFolder(root, checkedFolderPath(path))
  await folderContents(root, path)
  const destinationPath = join(dirname(path), checkedName(name))
  if (destinationPath === path) return path
  const destinationParent = await safeFolder(
    root,
    dirname(destinationPath) === "." ? "" : dirname(destinationPath),
  )
  const destination = join(destinationParent, basename(destinationPath))
  try {
    await lstat(destination)
    throw new HttpCollectionConflictError("Já existe uma pasta com esse nome.")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  await rename(source, destination)
  return destinationPath
}

export async function deleteHttpFolder(root: string, path: string) {
  const source = await safeFolder(root, checkedFolderPath(path))
  const contents = await folderContents(root, path)
  for (const file of contents.files) await removeSafeProjectFile(root, file.path, file.hash)
  for (const directory of contents.directories) await rmdir(directory)
  await rmdir(source)
}

function stableName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "request"
}

export async function createHttpRequestInCollection(
  root: string,
  path: string,
  name: string,
  expectedHash: string,
) {
  const current = await checkedCollection(root, path, expectedHash)
  const requestName = checkedName(name)
  const file = parseHttpFile(current.source, path)
  if (file.requests.some((block) => block.blockId === `${path}#${stableName(requestName)}`)) {
    throw new HttpCollectionConflictError("Já existe um request com esse nome na coleção.")
  }
  const request = {
    ...createScratchRequest(`http-new-${Date.now()}`, "https://example.invalid"),
    name: requestName,
  }
  const separator =
    current.source && !current.source.endsWith("\n") ? "\n\n" : current.source ? "\n" : ""
  const nextSource = `${current.source}${separator}${serializeHttpRequestBlock(request)}`
  await atomicWriteProjectFile(root, path, nextSource, { expectedHash: current.hash })
  const next = parseHttpFile(nextSource, path)
  const block = next.requests.at(-1)
  if (!block) throw new HttpCollectionConflictError("O request criado não pôde ser relido.")
  return requestFromHttpFile(next, block)
}

export async function renameHttpRequest(
  root: string,
  request: HttpRequestDefinition,
  name: string,
) {
  if (request.source.kind !== "file") throw new HttpCollectionConflictError("Request sem arquivo.")
  const source = request.source
  const current = await checkedCollection(root, source.path, source.sourceHash)
  const file = parseHttpFile(current.source, source.path)
  const nextName = checkedName(name)
  if (
    file.requests.some(
      (block) =>
        block.blockId === `${source.path}#${stableName(nextName)}` &&
        block.blockId !== source.blockId,
    )
  ) {
    throw new HttpCollectionConflictError("Já existe um request com esse nome na coleção.")
  }
  return saveHttpRequest(root, { ...request, name: nextName })
}
