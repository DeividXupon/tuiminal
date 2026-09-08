import { readFile, realpath } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { diffHttpText, sanitizeTerminalText, type HttpDiffLine } from "../model/response"
import { httpHeaderSensitivity } from "../model/key-value"
import {
  httpRequestSecretValues,
  redactHttpUrlSecrets,
  redactKnownHttpSecrets,
} from "../model/secrets"
import type {
  HttpKeyValue,
  HttpMultipartPart,
  HttpRequestDefinition,
  HttpVariableContext,
} from "../model/types"
import { parseHttpFile, requestFromHttpFile, serializeHttpRequestBlock } from "../model/http-file"
import { HttpCollectionConflictError, saveHttpRequest } from "./collections"

export type HttpExternalConflictPreview = {
  documentId: string
  requestName: string
  path: string
  canUseExternal: boolean
  diff: HttpDiffLine[]
}

export type HttpExternalConflictResolution = "reload" | "apply-local" | "save-copy"

function inside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

async function currentFile(root: string, request: HttpRequestDefinition) {
  if (request.source.kind !== "file") {
    throw new HttpCollectionConflictError("O request não pertence a um arquivo do projeto.")
  }
  const requestSource = request.source
  const projectRoot = await realpath(root)
  const path = await realpath(resolve(projectRoot, requestSource.path))
  if (!inside(projectRoot, path)) {
    throw new HttpCollectionConflictError("O arquivo HTTP precisa permanecer dentro do projeto.")
  }
  const source = await readFile(path, "utf8")
  const file = parseHttpFile(source, requestSource.path)
  const block = file.requests.find((candidate) => candidate.blockId === requestSource.blockId)
  return { file, block }
}

function redactEntry<T extends HttpKeyValue | HttpMultipartPart>(
  entry: T,
  secrets: readonly string[],
): T {
  const force = entry.sensitivity !== "normal" || httpHeaderSensitivity(entry.name) !== "normal"
  return {
    ...entry,
    value: force ? "<redacted>" : redactKnownHttpSecrets(entry.value, secrets),
  }
}

function redactedRequest(request: HttpRequestDefinition, secrets: readonly string[]) {
  const auth =
    request.auth.kind === "bearer"
      ? { ...request.auth, token: "<redacted>" as const }
      : request.auth.kind === "basic"
        ? { ...request.auth, password: "<redacted>" as const }
        : request.auth.kind === "api-key"
          ? { ...request.auth, value: "<redacted>" as const }
          : request.auth
  return {
    ...request,
    url: redactKnownHttpSecrets(request.url, secrets),
    query: request.query.map((entry) => redactEntry(entry, secrets)),
    path: request.path.map((entry) => redactEntry(entry, secrets)),
    headers: request.headers.map((entry) => redactEntry(entry, secrets)),
    auth,
    options: {
      ...request.options,
      ...(request.options.proxy
        ? { proxy: redactHttpUrlSecrets(request.options.proxy, secrets) }
        : {}),
    },
    body: {
      ...request.body,
      text: redactKnownHttpSecrets(request.body.text, secrets),
      form: request.body.form.map((entry) => redactEntry(entry, secrets)),
      ...(request.body.multipart
        ? { multipart: request.body.multipart.map((entry) => redactEntry(entry, secrets)) }
        : {}),
      ...(request.body.filePath !== undefined
        ? { filePath: redactKnownHttpSecrets(request.body.filePath, secrets) }
        : {}),
    },
  } satisfies HttpRequestDefinition
}

function conflictSource(
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  additionalSecrets: readonly string[] = [],
) {
  const secrets = [
    ...new Set([...additionalSecrets, ...httpRequestSecretValues(request, variables)]),
  ]
  return sanitizeTerminalText(serializeHttpRequestBlock(redactedRequest(request, secrets)))
}

export async function inspectHttpExternalConflict(
  root: string,
  request: HttpRequestDefinition,
  variables: HttpVariableContext = new Map(),
): Promise<HttpExternalConflictPreview> {
  const current = await currentFile(root, request)
  const external = current.block ? requestFromHttpFile(current.file, current.block) : null
  const externalSecrets = external ? httpRequestSecretValues(external, variables) : []
  const localSource = conflictSource(request, variables, externalSecrets)
  const externalSource = external
    ? conflictSource(external, variables, httpRequestSecretValues(request, variables))
    : ""
  return {
    documentId: request.id,
    requestName: request.name,
    path: request.source.kind === "file" ? request.source.path : "",
    canUseExternal: Boolean(external),
    diff: diffHttpText(externalSource, localSource),
  }
}

export async function resolveHttpExternalConflict(
  root: string,
  request: HttpRequestDefinition,
  resolution: HttpExternalConflictResolution,
) {
  if (resolution === "save-copy") {
    if (request.source.kind === "file" && request.source.supported === false) {
      throw new HttpCollectionConflictError("O bloco HTTP não pode ser editado com segurança.")
    }
    return saveHttpRequest(root, {
      ...request,
      id: `${request.id}-local-${Date.now()}`,
      source: { kind: "scratch" },
      name: `${request.name} local`,
    })
  }
  const current = await currentFile(root, request)
  if (!current.block) {
    throw new HttpCollectionConflictError(
      "O request foi removido externamente; salve a versão local como cópia.",
    )
  }
  const external = requestFromHttpFile(current.file, current.block)
  if (resolution === "reload") return external
  return saveHttpRequest(root, {
    ...request,
    source: { ...external.source },
  })
}
