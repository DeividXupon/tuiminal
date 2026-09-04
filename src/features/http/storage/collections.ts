import { watch as watchFs, type Dirent, type FSWatcher } from "node:fs"
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises"
import { basename, dirname, extname, relative, resolve, sep } from "node:path"
import {
  hashHttpSource,
  parseHttpFile,
  replaceHttpRequestBlock,
  requestFromHttpFile,
  serializeHttpRequestBlock,
  type ParsedHttpFile,
} from "../model/http-file"
import type { HttpRequestDefinition } from "../model/types"
import { validateHttpRequestAutomation } from "../model/automation"
import { isValidHttpMethod } from "../model/request-validation"

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
])
const MAX_HTTP_FILE_BYTES = 1_000_000

export type HttpCollectionFile = ParsedHttpFile & { absolutePath: string }
export type HttpProjectCollection = {
  root: string
  files: HttpCollectionFile[]
  errors: Array<{ path: string; message: string }>
}

export class HttpCollectionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpCollectionConflictError"
  }
}

export class HttpExternalChangeError extends HttpCollectionConflictError {
  constructor(message: string) {
    super(message)
    this.name = "HttpExternalChangeError"
  }
}

function insideRoot(root: string, candidate: string) {
  const normalizedRoot = resolve(root)
  const normalizedCandidate = resolve(candidate)
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  )
}

function projectPath(root: string, relativePath: string) {
  const candidate = resolve(root, relativePath)
  if (!insideRoot(root, candidate)) {
    throw new HttpCollectionConflictError("O arquivo HTTP precisa permanecer dentro do projeto.")
  }
  return candidate
}

async function scanDirectory(root: string, directory: string, result: HttpProjectCollection) {
  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    result.errors.push({ path: relative(root, directory), message: String(error) })
    return
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const absolutePath = resolve(directory, entry.name)
    if (!insideRoot(root, absolutePath)) continue
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) await scanDirectory(root, absolutePath, result)
      continue
    }
    if (!entry.isFile() || ![".http", ".rest"].includes(extname(entry.name).toLowerCase())) continue
    try {
      const fileStat = await stat(absolutePath)
      if (fileStat.size > MAX_HTTP_FILE_BYTES) {
        result.errors.push({
          path: relative(root, absolutePath),
          message: "Arquivo maior que 1 MB; leitura ignorada.",
        })
        continue
      }
      const source = await readFile(absolutePath, "utf8")
      result.files.push({
        ...parseHttpFile(source, relative(root, absolutePath)),
        absolutePath,
      })
    } catch (error) {
      result.errors.push({ path: relative(root, absolutePath), message: String(error) })
    }
  }
}

export async function scanHttpProject(root: string): Promise<HttpProjectCollection> {
  const resolvedRoot = resolve(root)
  const result: HttpProjectCollection = { root: resolvedRoot, files: [], errors: [] }
  await scanDirectory(resolvedRoot, resolvedRoot, result)
  result.files.sort((left, right) => left.path.localeCompare(right.path))
  return result
}

async function projectDirectories(root: string) {
  const directories = [resolve(root)]
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index]
    if (!directory) continue
    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRECTORIES.has(entry.name)) {
        directories.push(resolve(directory, entry.name))
      }
    }
  }
  return directories
}

export async function watchHttpProject(root: string, onChange: () => void) {
  let closed = false
  let recursiveMode = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const watchers = new Map<string, FSWatcher>()
  const schedule = () => {
    if (closed || timer) return
    timer = setTimeout(() => {
      timer = null
      if (closed) return
      onChange()
      if (!recursiveMode) void reconcile()
    }, 80)
  }
  const reconcile = async () => {
    const directories = new Set(await projectDirectories(root))
    for (const [directory, watcher] of watchers) {
      if (directories.has(directory)) continue
      watcher.close()
      watchers.delete(directory)
    }
    for (const directory of directories) {
      if (closed || watchers.has(directory)) continue
      try {
        const watcher = watchFs(directory, schedule)
        if (closed) watcher.close()
        else watchers.set(directory, watcher)
      } catch {
        // A directory can disappear between discovery and watch installation.
      }
    }
  }

  try {
    const recursive = watchFs(resolve(root), { recursive: true }, (_event, fileName) => {
      const parts = String(fileName ?? "").split(/[\\/]/)
      if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return
      schedule()
    })
    recursiveMode = true
    watchers.set(resolve(root), recursive)
  } catch {
    // Recursive watching is unavailable on some runtimes; reconcile per-directory watchers.
    await reconcile()
  }
  return () => {
    closed = true
    if (timer) clearTimeout(timer)
    for (const watcher of watchers.values()) watcher.close()
    watchers.clear()
  }
}

async function writeAtomic(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.tuiminal-${process.pid}-${Date.now()}.tmp`
  const handle = await open(temporary, "wx", 0o600)
  try {
    await handle.writeFile(content, "utf8")
    await handle.sync()
    await handle.close()
    await rename(temporary, path)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

function safeFileStem(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "request"
  )
}

function secretUsesOnlyReferences(value: string) {
  return !value.trim() || /^(?:\s*\{\{[^{}]+\}\}\s*)+$/.test(value)
}

function assertNoLiteralProjectSecrets(request: HttpRequestDefinition) {
  const secretValues = [
    ...request.headers
      .filter((entry) => entry.sensitivity === "literal-secret")
      .map((entry) => entry.value),
    ...request.query
      .filter((entry) => entry.sensitivity === "literal-secret")
      .map((entry) => entry.value),
    ...request.body.form
      .filter((entry) => entry.sensitivity === "literal-secret")
      .map((entry) => entry.value),
    ...(request.body.multipart ?? [])
      .filter((entry) => entry.sensitivity === "literal-secret")
      .map((entry) => entry.value),
  ]
  if (request.auth.kind === "bearer") secretValues.push(request.auth.token)
  if (request.auth.kind === "basic") secretValues.push(request.auth.password)
  if (request.auth.kind === "api-key") secretValues.push(request.auth.value)
  if (secretValues.some((value) => !secretUsesOnlyReferences(value))) {
    throw new HttpCollectionConflictError(
      "Segredos literais não são salvos em .http; use uma variável do ambiente privado.",
    )
  }
}

async function availableRequestPath(root: string, name: string) {
  const directory = resolve(root, ".tuiminal/http")
  const stem = safeFileStem(name)
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const fileName = `${stem}${suffix ? `-${suffix + 1}` : ""}.http`
    const candidate = resolve(directory, fileName)
    try {
      await stat(candidate)
    } catch {
      return candidate
    }
  }
  throw new HttpCollectionConflictError("Não foi possível escolher um nome de arquivo livre.")
}

export async function saveHttpRequest(root: string, request: HttpRequestDefinition) {
  if (!isValidHttpMethod(request.method)) {
    throw new HttpCollectionConflictError("O método HTTP contém caracteres inválidos.")
  }
  const automationError = validateHttpRequestAutomation(request)
  if (automationError) throw new HttpCollectionConflictError(automationError)
  assertNoLiteralProjectSecrets(request)
  if (request.source.kind === "scratch") {
    const absolutePath = await availableRequestPath(root, request.name)
    await writeAtomic(absolutePath, serializeHttpRequestBlock(request))
    const relativePath = relative(resolve(root), absolutePath)
    const source = await readFile(absolutePath, "utf8")
    const file = parseHttpFile(source, relativePath)
    const block = file.requests[0]
    if (!block) throw new HttpCollectionConflictError("O request salvo não pôde ser relido.")
    return requestFromHttpFile(file, block)
  }

  const requestSource = request.source
  const absolutePath = projectPath(root, requestSource.path)
  const source = await readFile(absolutePath, "utf8")
  if (hashHttpSource(source) !== requestSource.sourceHash) {
    throw new HttpExternalChangeError(
      `O arquivo ${requestSource.path} mudou fora do Tuiminal; revise antes de salvar.`,
    )
  }
  const file = parseHttpFile(source, requestSource.path)
  const block = file.requests.find((candidate) => candidate.blockId === requestSource.blockId)
  if (!block || !block.editable) {
    throw new HttpCollectionConflictError("O bloco HTTP não pode ser editado com segurança.")
  }
  const nextSource = replaceHttpRequestBlock(file, block, request)
  await writeAtomic(absolutePath, nextSource)
  const nextFile = parseHttpFile(nextSource, requestSource.path)
  const nextBlock = nextFile.requests.find((candidate) => candidate.name === request.name)
  if (!nextBlock) throw new HttpCollectionConflictError("O request salvo não pôde ser relido.")
  return requestFromHttpFile(nextFile, nextBlock)
}

export async function duplicateHttpRequest(root: string, request: HttpRequestDefinition) {
  return saveHttpRequest(root, {
    ...request,
    id: `${request.id}-copy-${Date.now()}`,
    source: { kind: "scratch" },
    name: `${request.name} copy`,
  })
}

export async function moveHttpCollectionFile(root: string, from: string, to: string) {
  const source = projectPath(root, from)
  const target = projectPath(root, to)
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  await rename(source, target)
  return relative(resolve(root), target)
}

export async function deleteHttpCollectionFile(root: string, path: string) {
  const target = projectPath(root, path)
  const info = await stat(target)
  if (!info.isFile() || ![".http", ".rest"].includes(extname(basename(target)).toLowerCase())) {
    throw new HttpCollectionConflictError("Somente arquivos .http ou .rest podem ser excluídos.")
  }
  await unlink(target)
}

async function currentRequestBlock(root: string, request: HttpRequestDefinition) {
  if (request.source.kind !== "file") {
    throw new HttpCollectionConflictError("Salve o request antes de movê-lo ou excluí-lo.")
  }
  const requestSource = request.source
  const absolutePath = projectPath(root, requestSource.path)
  const source = await readFile(absolutePath, "utf8")
  if (hashHttpSource(source) !== requestSource.sourceHash) {
    throw new HttpExternalChangeError(
      `O arquivo ${requestSource.path} mudou fora do Tuiminal; revise antes de continuar.`,
    )
  }
  const file = parseHttpFile(source, requestSource.path)
  const block = file.requests.find((candidate) => candidate.blockId === requestSource.blockId)
  if (!block) throw new HttpCollectionConflictError("O bloco HTTP original não existe mais.")
  return { absolutePath, source, file, block }
}

function sourceWithoutBlock(source: string, block: { start: number; end: number }) {
  return `${source.slice(0, block.start)}${source.slice(block.end)}`.replace(/^\s+$/g, "")
}

export async function deleteHttpRequest(root: string, request: HttpRequestDefinition) {
  const current = await currentRequestBlock(root, request)
  const nextSource = sourceWithoutBlock(current.source, current.block)
  if (nextSource.trim()) await writeAtomic(current.absolutePath, nextSource)
  else await unlink(current.absolutePath)
}

export async function moveHttpRequest(
  root: string,
  request: HttpRequestDefinition,
  targetPath: string,
) {
  const current = await currentRequestBlock(root, request)
  if (!/\.(?:http|rest)$/i.test(targetPath)) {
    throw new HttpCollectionConflictError("O destino precisa terminar em .http ou .rest.")
  }
  if (request.source.kind !== "file") throw new HttpCollectionConflictError("Request sem arquivo.")
  const target = projectPath(root, targetPath)
  if (target === current.absolutePath) return request
  let targetSource = ""
  let targetExisted = false
  try {
    targetSource = await readFile(target, "utf8")
    targetExisted = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const separator = targetSource && !targetSource.endsWith("\n") ? "\n\n" : targetSource ? "\n" : ""
  const movedBlock = serializeHttpRequestBlock({ ...request, source: { kind: "scratch" } })
  const nextTarget = `${targetSource}${separator}${movedBlock}`
  await writeAtomic(target, nextTarget)
  try {
    const nextSource = sourceWithoutBlock(current.source, current.block)
    if (nextSource.trim()) await writeAtomic(current.absolutePath, nextSource)
    else await unlink(current.absolutePath)
  } catch (error) {
    if (targetExisted) await writeAtomic(target, targetSource)
    else await unlink(target).catch(() => undefined)
    throw error
  }
  const relativePath = relative(resolve(root), target)
  const file = parseHttpFile(nextTarget, relativePath)
  const block = file.requests.at(-1)
  if (!block) throw new HttpCollectionConflictError("O request movido não pôde ser relido.")
  return requestFromHttpFile(file, block)
}
