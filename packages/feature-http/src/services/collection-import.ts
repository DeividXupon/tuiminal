import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import { basename, relative, resolve, sep } from "node:path"
import YAML from "yaml"
import { importOpenApiDocument } from "../importing/openapi"
import { importPostmanCollection } from "../importing/postman"
import { record, type HttpImportReport } from "../importing/shared"
import {
  previewImportedHttpCollectionPath,
  writeImportedHttpCollectionAtPath,
} from "../storage/imports"
import { resolveHttpImportSourcePath } from "./import-source-path"

export type HttpCollectionImportFormat = HttpImportReport["format"]

export type HttpCollectionImportPreview = {
  format: HttpCollectionImportFormat
  sourcePath: string
  sourceName: string
  plannedPath: string
  conflicts: number
  sourceDigest: string
  report: HttpImportReport
}

const MAX_IMPORT_BYTES = 8_000_000
const IMPORT_DIRECTORY = "imported"

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

async function importSource(sourcePath: string) {
  const resolved = resolveHttpImportSourcePath(sourcePath)
  let source: string
  try {
    source = await realpath(resolved)
  } catch {
    throw new Error(`Arquivo de importação não encontrado: ${sourcePath}.`)
  }
  const info = await stat(source)
  if (!info.isFile()) throw new Error("O caminho de importação não aponta para um arquivo.")
  if (info.size > MAX_IMPORT_BYTES) throw new Error("O arquivo de importação excede 8 MB.")
  return source
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

async function safeOutputDirectory(root: string) {
  const output = resolve(root, IMPORT_DIRECTORY)
  const existing = await closestExistingDirectory(output)
  if (!isInside(root, existing)) {
    throw new Error("A pasta global de importação não pode atravessar um symlink externo.")
  }
  return output
}

function parseImportSource(source: string): HttpImportReport {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    try {
      parsed = YAML.parse(source)
    } catch {
      throw new Error("Arquivo de importação inválido: JSON ou YAML malformado.")
    }
  }
  const document = record(parsed)
  if (
    typeof document?.openapi === "string" ||
    typeof document?.swagger === "string" ||
    record(document?.paths)
  ) {
    return importOpenApiDocument(parsed)
  }
  if (Array.isArray(document?.item)) return importPostmanCollection(parsed)
  throw new Error("Formato não reconhecido. Use uma coleção Postman v2.0/v2.1 ou OpenAPI 3.x.")
}

export async function previewHttpCollectionImport(
  root: string,
  sourcePath: string,
): Promise<HttpCollectionImportPreview> {
  const homeRoot = await realpath(root)
  const source = await importSource(sourcePath)
  const output = await safeOutputDirectory(homeRoot)
  const content = await readFile(source, "utf8")
  const report = parseImportSource(content)
  const planned = await previewImportedHttpCollectionPath(output, basename(source))
  return {
    format: report.format,
    sourcePath: source,
    sourceName: basename(source),
    plannedPath: relative(homeRoot, planned.path),
    conflicts: planned.conflicts,
    sourceDigest: createHash("sha256").update(content).digest("hex"),
    report,
  }
}

export async function applyHttpCollectionImport(
  root: string,
  preview: HttpCollectionImportPreview,
) {
  const refreshed = await previewHttpCollectionImport(root, preview.sourcePath)
  if (refreshed.sourcePath !== preview.sourcePath) {
    throw new Error("O arquivo de origem mudou depois da prévia; gere uma nova prévia.")
  }
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
