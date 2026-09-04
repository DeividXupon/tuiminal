import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import { basename, relative, resolve, sep } from "node:path"
import YAML from "yaml"
import { importOpenApiDocument } from "../importing/openapi"
import { importPostmanCollection } from "../importing/postman"
import type { HttpImportReport } from "../importing/shared"
import {
  previewImportedHttpCollectionPath,
  writeImportedHttpCollectionAtPath,
} from "../storage/imports"

export type HttpCollectionImportFormat = "postman" | "openapi"

export type HttpCollectionImportPreview = {
  format: HttpCollectionImportFormat
  sourcePath: string
  sourceName: string
  outputDirectory: string
  plannedPath: string
  conflicts: number
  sourceDigest: string
  report: HttpImportReport
}

const MAX_IMPORT_BYTES = 8_000_000

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

async function safeProjectSource(root: string, sourcePath: string) {
  if (!sourcePath.trim()) throw new Error("Informe o arquivo a importar.")
  const projectRoot = await realpath(root)
  let source: string
  try {
    source = await realpath(resolve(projectRoot, sourcePath))
  } catch {
    throw new Error(`Arquivo de importação não encontrado: ${sourcePath}.`)
  }
  if (!isInside(projectRoot, source)) {
    throw new Error("O arquivo de importação precisa permanecer dentro do projeto.")
  }
  const info = await stat(source)
  if (!info.isFile()) throw new Error("O caminho de importação não aponta para um arquivo.")
  if (info.size > MAX_IMPORT_BYTES) throw new Error("O arquivo de importação excede 8 MB.")
  return { projectRoot, source }
}

async function closestExistingDirectory(path: string) {
  let current = path
  while (true) {
    try {
      const info = await stat(current)
      return info.isDirectory() ? realpath(current) : realpath(resolve(current, ".."))
    } catch {
      const parent = resolve(current, "..")
      if (parent === current) throw new Error("Diretório de importação inválido.")
      current = parent
    }
  }
}

async function safeOutputDirectory(projectRoot: string, outputDirectory: string) {
  const value = outputDirectory.trim() || ".tuiminal/http/imported"
  const output = resolve(projectRoot, value)
  if (!isInside(projectRoot, output)) {
    throw new Error("A pasta de destino precisa permanecer dentro do projeto.")
  }
  const existing = await closestExistingDirectory(output)
  if (!isInside(projectRoot, existing)) {
    throw new Error("A pasta de destino não pode atravessar um symlink externo.")
  }
  return output
}

function parseImportSource(format: HttpCollectionImportFormat, source: string) {
  const parsed = format === "postman" ? JSON.parse(source) : YAML.parse(source)
  return format === "postman" ? importPostmanCollection(parsed) : importOpenApiDocument(parsed)
}

export async function previewHttpCollectionImport(
  root: string,
  format: HttpCollectionImportFormat,
  sourcePath: string,
  outputDirectory: string,
): Promise<HttpCollectionImportPreview> {
  const safe = await safeProjectSource(root, sourcePath)
  const output = await safeOutputDirectory(safe.projectRoot, outputDirectory)
  const source = await readFile(safe.source, "utf8")
  const report = parseImportSource(format, source)
  const planned = await previewImportedHttpCollectionPath(output, basename(safe.source))
  return {
    format,
    sourcePath: relative(safe.projectRoot, safe.source),
    sourceName: basename(safe.source),
    outputDirectory: relative(safe.projectRoot, output),
    plannedPath: relative(safe.projectRoot, planned.path),
    conflicts: planned.conflicts,
    sourceDigest: createHash("sha256").update(source).digest("hex"),
    report,
  }
}

export async function applyHttpCollectionImport(
  root: string,
  preview: HttpCollectionImportPreview,
) {
  const refreshed = await previewHttpCollectionImport(
    root,
    preview.format,
    preview.sourcePath,
    preview.outputDirectory,
  )
  if (refreshed.sourceDigest !== preview.sourceDigest) {
    throw new Error("O arquivo de origem mudou depois da prévia; gere uma nova prévia.")
  }
  if (refreshed.plannedPath !== preview.plannedPath) {
    throw new Error("O destino mudou depois da prévia; gere uma nova prévia.")
  }
  const outputPath = await writeImportedHttpCollectionAtPath(
    resolve(root, refreshed.plannedPath),
    refreshed.report,
  )
  return { ...refreshed, outputPath: relative(resolve(root), outputPath) }
}
