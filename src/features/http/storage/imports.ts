import { chmod, mkdir, open } from "node:fs/promises"
import { resolve } from "node:path"
import type { HttpImportReport } from "../importing/shared"
import { serializeHttpRequestBlock } from "../model/http-file"

function safeStem(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "imported"
  )
}

async function availableImportPath(outputDirectory: string, sourceName: string) {
  const directory = resolve(outputDirectory)
  const stem = safeStem(sourceName.replace(/\.(json|ya?ml)$/i, ""))
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const path = resolve(directory, `${stem}${suffix ? `-${suffix + 1}` : ""}.http`)
    try {
      const handle = await open(path, "wx", 0o600)
      return { path, handle, conflicts: suffix }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
  }
  throw new Error("Não foi possível escolher um nome livre para a importação.")
}

async function writeImportHandle(
  handle: Awaited<ReturnType<typeof open>>,
  report: HttpImportReport,
) {
  const content = report.requests.map((request) => serializeHttpRequestBlock(request)).join("\n")
  try {
    await handle.writeFile(content, "utf8")
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export async function previewImportedHttpCollectionPath(
  outputDirectory: string,
  sourceName: string,
) {
  const directory = resolve(outputDirectory)
  const stem = safeStem(sourceName.replace(/\.(json|ya?ml)$/i, ""))
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const path = resolve(directory, `${stem}${suffix ? `-${suffix + 1}` : ""}.http`)
    if (!(await Bun.file(path).exists())) return { path, conflicts: suffix }
  }
  throw new Error("Não foi possível escolher um nome livre para a importação.")
}

export async function writeImportedHttpCollection(
  outputDirectory: string,
  sourceName: string,
  report: HttpImportReport,
) {
  const directory = resolve(outputDirectory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const { path, handle } = await availableImportPath(directory, sourceName)
  await writeImportHandle(handle, report)
  return path
}

export async function writeImportedHttpCollectionAtPath(
  outputPath: string,
  report: HttpImportReport,
) {
  const path = resolve(outputPath)
  const directory = resolve(path, "..")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(path, "wx", 0o600)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("O destino mudou depois da prévia; gere uma nova prévia.")
    }
    throw error
  }
  await writeImportHandle(handle, report)
  return path
}
