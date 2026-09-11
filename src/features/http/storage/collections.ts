import { readFile, realpath, stat } from "node:fs/promises"
import { basename, extname, relative } from "node:path"
import {
  hashHttpSource,
  parseHttpFile,
  replaceHttpRequestBlock,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../model/http-file"
import type { HttpRequestDefinition } from "../model/types"
import { validateHttpRequestAutomation } from "../model/automation"
import { isValidHttpMethod } from "../model/request-validation"
import { isOpaqueHttpRequest } from "../model/request-capabilities"
import { httpProxyHasCredentials } from "../model/secrets"
import {
  atomicWriteProjectFile,
  moveSafeProjectFile,
  projectFileHash,
  removeSafeProjectFile,
  resolveSafeProjectFile,
} from "../../../shared/storage/project-files"

export {
  HTTP_PROJECT_MAX_DIRECTORIES,
  HTTP_PROJECT_MAX_FILES,
  HTTP_PROJECT_MAX_SOURCE_BYTES,
  HTTP_PROJECT_MAX_WATCHERS,
  scanHttpProject,
  watchHttpProject,
  type HttpCollectionFile,
  type HttpProjectCollection,
} from "./collection-scan"

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

async function projectPath(
  root: string,
  relativePath: string,
  options: { createParents?: boolean; allowMissing?: boolean } = {},
) {
  return (await resolveSafeProjectFile(root, relativePath, options)).path
}

async function writeAtomic(
  root: string,
  path: string,
  content: string,
  expectedHash?: string | null,
  exclusive = false,
) {
  const canonicalRoot = await realpath(root)
  await atomicWriteProjectFile(root, relative(canonicalRoot, path), content, {
    ...(expectedHash === undefined ? {} : { expectedHash }),
    exclusive,
  })
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
    ...request.headers,
    ...request.query,
    ...request.path,
    ...request.body.form,
    ...(request.body.multipart ?? []),
  ]
    .filter((entry) => entry.sensitivity === "literal-secret")
    .map((entry) => entry.value)
  if (request.auth.kind === "bearer") secretValues.push(request.auth.token)
  if (request.auth.kind === "basic") secretValues.push(request.auth.password)
  if (request.auth.kind === "api-key") secretValues.push(request.auth.value)
  if (request.options.proxy && httpProxyHasCredentials(request.options.proxy)) {
    secretValues.push(request.options.proxy)
  }
  if (secretValues.some((value) => !secretUsesOnlyReferences(value))) {
    throw new HttpCollectionConflictError(
      "Segredos literais não são salvos em .http; use uma variável do ambiente privado.",
    )
  }
}

async function availableRequestPath(root: string, name: string) {
  const stem = safeFileStem(name)
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const fileName = `${stem}${suffix ? `-${suffix + 1}` : ""}.http`
    const candidate = await projectPath(root, `.tuiminal/http/${fileName}`, {
      createParents: true,
      allowMissing: true,
    })
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
    await writeAtomic(root, absolutePath, serializeHttpRequestBlock(request), null, true)
    const relativePath = relative(await realpath(root), absolutePath)
    const source = await readFile(absolutePath, "utf8")
    const file = parseHttpFile(source, relativePath)
    const block = file.requests[0]
    if (!block) throw new HttpCollectionConflictError("O request salvo não pôde ser relido.")
    return requestFromHttpFile(file, block)
  }

  const requestSource = request.source
  const absolutePath = await projectPath(root, requestSource.path)
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
  await writeAtomic(root, absolutePath, nextSource, requestSource.sourceHash)
  const nextFile = parseHttpFile(nextSource, requestSource.path)
  const nextBlock = nextFile.requests.find((candidate) => candidate.name === request.name)
  if (!nextBlock) throw new HttpCollectionConflictError("O request salvo não pôde ser relido.")
  return requestFromHttpFile(nextFile, nextBlock)
}

export async function duplicateHttpRequest(root: string, request: HttpRequestDefinition) {
  if (isOpaqueHttpRequest(request)) {
    throw new HttpCollectionConflictError("O bloco HTTP não pode ser editado com segurança.")
  }
  return saveHttpRequest(root, {
    ...request,
    id: `${request.id}-copy-${Date.now()}`,
    source: { kind: "scratch" },
    name: `${request.name} copy`,
  })
}

export async function moveHttpCollectionFile(root: string, from: string, to: string) {
  return moveSafeProjectFile(root, from, to)
}

export async function deleteHttpCollectionFile(root: string, path: string) {
  const target = await projectPath(root, path)
  const info = await stat(target)
  if (!info.isFile() || ![".http", ".rest"].includes(extname(basename(target)).toLowerCase())) {
    throw new HttpCollectionConflictError("Somente arquivos .http ou .rest podem ser excluídos.")
  }
  await removeSafeProjectFile(root, path)
}

async function currentRequestBlock(root: string, request: HttpRequestDefinition) {
  if (request.source.kind !== "file") {
    throw new HttpCollectionConflictError("Salve o request antes de movê-lo ou excluí-lo.")
  }
  const requestSource = request.source
  const absolutePath = await projectPath(root, requestSource.path)
  const source = await readFile(absolutePath, "utf8")
  if (hashHttpSource(source) !== requestSource.sourceHash) {
    throw new HttpExternalChangeError(
      `O arquivo ${requestSource.path} mudou fora do Tuiminal; revise antes de continuar.`,
    )
  }
  const file = parseHttpFile(source, requestSource.path)
  const block = file.requests.find((candidate) => candidate.blockId === requestSource.blockId)
  if (!block) throw new HttpCollectionConflictError("O bloco HTTP original não existe mais.")
  return { absolutePath, source, sourceHash: requestSource.sourceHash, file, block }
}

function sourceWithoutBlock(source: string, block: { start: number; end: number }) {
  return `${source.slice(0, block.start)}${source.slice(block.end)}`.replace(/^\s+$/g, "")
}

export async function deleteHttpRequest(root: string, request: HttpRequestDefinition) {
  const current = await currentRequestBlock(root, request)
  const nextSource = sourceWithoutBlock(current.source, current.block)
  if (nextSource.trim()) {
    await writeAtomic(root, current.absolutePath, nextSource, current.sourceHash)
  } else {
    await removeSafeProjectFile(
      root,
      request.source.kind === "file" ? request.source.path : "",
      current.sourceHash,
    )
  }
}

export async function moveHttpRequest(
  root: string,
  request: HttpRequestDefinition,
  targetPath: string,
) {
  if (isOpaqueHttpRequest(request)) {
    throw new HttpCollectionConflictError("O bloco HTTP não pode ser editado com segurança.")
  }
  const current = await currentRequestBlock(root, request)
  if (!/\.(?:http|rest)$/i.test(targetPath)) {
    throw new HttpCollectionConflictError("O destino precisa terminar em .http ou .rest.")
  }
  if (request.source.kind !== "file") throw new HttpCollectionConflictError("Request sem arquivo.")
  const target = await projectPath(root, targetPath, { createParents: true, allowMissing: true })
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
  const targetHash = targetExisted ? projectFileHash(targetSource) : null
  await writeAtomic(root, target, nextTarget, targetHash, !targetExisted)
  try {
    const nextSource = sourceWithoutBlock(current.source, current.block)
    if (nextSource.trim()) {
      await writeAtomic(root, current.absolutePath, nextSource, current.sourceHash)
    } else {
      await removeSafeProjectFile(root, request.source.path, current.sourceHash)
    }
  } catch (error) {
    if (targetExisted) {
      await writeAtomic(root, target, targetSource, projectFileHash(nextTarget))
    } else {
      await removeSafeProjectFile(root, targetPath, projectFileHash(nextTarget)).catch(
        () => undefined,
      )
    }
    throw error
  }
  const relativePath = relative(await realpath(root), target)
  const file = parseHttpFile(nextTarget, relativePath)
  const block = file.requests.at(-1)
  if (!block) throw new HttpCollectionConflictError("O request movido não pôde ser relido.")
  return requestFromHttpFile(file, block)
}
