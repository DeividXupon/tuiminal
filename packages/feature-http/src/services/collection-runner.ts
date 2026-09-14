import { readFile, realpath, stat } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { evaluateHttpAssertions } from "../model/assertions"
import { redactHttpDiagnostic, redactHttpHistoryUrl } from "../model/history"
import { HTTP_ENVIRONMENT_PREPARATION_ERROR } from "../model/history-privacy"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"
import { evaluateHttpJsonPath } from "../model/response"
import {
  combineHttpPrivacy,
  httpRequestSecretValues,
  requestHttpPrivacy,
  redactHttpUrlSecrets,
  redactKnownHttpSecrets,
} from "../model/secrets"
import type {
  HttpProjectRequestItem,
  HttpFailureKind,
  HttpRequestDefinition,
  HttpResponseSnapshot,
  HttpVariableContext,
  HttpVariableValue,
  HttpPrivacyContext,
} from "../model/types"
import { executePreparedHttpRequest, HttpExecutionError } from "./fetch-transport"
import { HttpRequestValidationError, prepareHttpRequest } from "./request-builder"
import { responseBodyText } from "./response-reader"
import { HttpCookieJar, HttpCookieJarStore, type HttpCookieJarResolver } from "./cookies"
import {
  httpInsecureTlsApproval,
  HttpInsecureTlsApprovalError,
  type HttpInsecureTlsApproval,
} from "../model/tls-policy"

export type HttpRunItem = {
  privacy?: HttpPrivacyContext
  requestId: string
  requestName: string
  method: string
  url: string
  response?: HttpResponseSnapshot
  error?: { kind: HttpFailureKind; message: string; approval?: HttpInsecureTlsApproval }
}

export type HttpRunCase = { name: string; items: HttpRunItem[] }

function requestSelector(item: HttpProjectRequestItem) {
  return item.request.source.kind === "file"
    ? (item.request.source.blockId.split("#").at(-1) ?? item.request.name)
    : item.request.name
}

function selectedRequests(items: HttpProjectRequestItem[], selector?: string) {
  const selected = selector
    ? items.find(
        (item) =>
          item.request.id === selector ||
          item.request.name === selector ||
          requestSelector(item) === selector,
      )
    : undefined
  if (selector && !selected) throw new Error(`Request não encontrado: ${selector}.`)
  const included = new Set<string>()
  const visiting = new Set<string>()
  const ordered: HttpProjectRequestItem[] = []
  const visit = (item: HttpProjectRequestItem) => {
    const id = item.request.id
    if (included.has(id)) return
    if (visiting.has(id)) throw new Error(`Ciclo de dependência detectado em ${item.request.name}.`)
    visiting.add(id)
    const dependency = item.request.chain?.dependsOn
    if (dependency) {
      const parent = items.find(
        (candidate) =>
          candidate.request.name === dependency || requestSelector(candidate) === dependency,
      )
      if (!parent) throw new Error(`Dependência não encontrada: ${dependency}.`)
      visit(parent)
    }
    visiting.delete(id)
    included.add(id)
    ordered.push(item)
  }
  for (const target of selected ? [selected] : items) visit(target)
  return ordered
}

function chainedContext(base: HttpVariableContext, extracted: Map<string, HttpVariableValue>) {
  const context = new Map(base)
  for (const [name, value] of extracted) context.set(name, value)
  return context
}

function runnerContext(
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  extracted: Map<string, HttpVariableValue>,
  variablesForRequest?: (request: HttpRequestDefinition) => HttpVariableContext,
) {
  const context = new Map(variablesForRequest?.(request) ?? variables)
  if (variablesForRequest) {
    for (const [name, value] of variables) context.set(name, value)
  }
  return chainedContext(context, extracted)
}

export function redactHttpRunUrl(
  value: string,
  variables: HttpVariableContext,
  requestSecrets: readonly string[] = [],
) {
  const secrets = [
    ...requestSecrets,
    ...[...variables.values()]
      .filter((item) => item.secret && item.value)
      .map((item) => item.value),
  ]
  return redactHttpHistoryUrl(redactHttpUrlSecrets(value, secrets))
}

export function redactHttpRunDiagnostic(
  value: string,
  variables: HttpVariableContext,
  requestSecrets: readonly string[] = [],
) {
  const secrets = [
    ...requestSecrets,
    ...[...variables.values()]
      .filter((item) => item.secret && item.value)
      .map((item) => item.value),
  ]
  return redactHttpDiagnostic(redactKnownHttpSecrets(value, secrets))
}

function evaluateRedactedAssertions(
  request: HttpRequestDefinition,
  response: HttpResponseSnapshot,
  context: HttpVariableContext,
  requestSecrets: readonly string[],
) {
  return evaluateHttpAssertions(request.assertions, response).map((assertion) => ({
    ...assertion,
    expression: redactHttpRunDiagnostic(assertion.expression, context, requestSecrets),
    actual: redactHttpRunDiagnostic(assertion.actual, context, requestSecrets),
    message: redactHttpRunDiagnostic(assertion.message, context, requestSecrets),
  }))
}

function extractVariables(
  request: HttpRequestDefinition,
  response: HttpResponseSnapshot,
  values: Map<string, HttpVariableValue>,
) {
  if (!request.chain?.extract.length) return
  const body = responseBodyText(response, false)
  for (const extraction of request.chain.extract) {
    const value = evaluateHttpJsonPath(body, extraction.jsonPath)
    if (value === undefined || (value !== null && typeof value === "object")) {
      throw new Error(`Extração ${extraction.name} não produziu um valor escalar.`)
    }
    values.set(extraction.name, {
      value: value === null ? "null" : String(value),
      origin: "request",
      secret: extraction.secret,
    })
  }
}

function collectionRunError(
  error: unknown,
  privacy: HttpPrivacyContext,
  environmentName: string | null,
): NonNullable<HttpRunItem["error"]> {
  const kind =
    error instanceof HttpInsecureTlsApprovalError
      ? "tls"
      : error instanceof HttpExecutionError || error instanceof HttpRequestValidationError
        ? error.kind
        : "parse"
  return {
    kind,
    message: redactHttpDiagnostic(
      privacy.redactText(error instanceof Error ? error.message : String(error)),
    ),
    ...(error instanceof HttpInsecureTlsApprovalError
      ? { approval: httpInsecureTlsApproval(error.url, environmentName) }
      : {}),
  }
}

export async function runHttpCollectionCase({
  name,
  items,
  selector,
  variables,
  root,
  signal,
  variablesForRequest,
  cookieJar,
  cookieJarForRequest,
  environmentName = null,
  isInsecureTlsApproved,
  authorizeRedirect,
}: {
  name: string
  items: HttpProjectRequestItem[]
  selector?: string
  variables: HttpVariableContext
  root: string
  signal?: AbortSignal
  variablesForRequest?: (request: HttpRequestDefinition) => HttpVariableContext
  cookieJar?: HttpCookieJar
  cookieJarForRequest?: HttpCookieJarResolver
  environmentName?: string | null
  isInsecureTlsApproved?: (approval: HttpInsecureTlsApproval) => boolean
  authorizeRedirect?: HttpRedirectAuthorizer
}): Promise<HttpRunCase> {
  const selected = selectedRequests(items, selector)
  const results: HttpRunItem[] = []
  const extracted = new Map<string, HttpVariableValue>()
  const scopedCookieJars = new HttpCookieJarStore()
  let casePrivacy = combineHttpPrivacy()

  for (const item of selected) {
    if (signal?.aborted) break
    const request = item.request
    const activeCookieJar =
      cookieJarForRequest?.(request) ??
      cookieJar ??
      scopedCookieJars.forRequest(request, environmentName)
    let context = variables
    let contextReady = false
    let privacy = combineHttpPrivacy(casePrivacy, requestHttpPrivacy(request, context))
    try {
      context = runnerContext(request, variables, extracted, variablesForRequest)
      contextReady = true
      privacy = combineHttpPrivacy(privacy, requestHttpPrivacy(request, context))
      const requestSecrets = httpRequestSecretValues(request, context)
      const executionId = `http-run-${Date.now()}-${results.length}`
      const prepared = prepareHttpRequest(request, executionId, 0, context, root)
      const received = await executePreparedHttpRequest(
        prepared,
        signal,
        undefined,
        activeCookieJar,
        (url) => isInsecureTlsApproved?.(httpInsecureTlsApproval(url, environmentName)) ?? false,
        authorizeRedirect
          ? (approval, signal) =>
              authorizeRedirect(Object.freeze({ ...approval, environmentName }), signal)
          : undefined,
      )
      const response = {
        ...received,
        assertions: evaluateRedactedAssertions(request, received, context, requestSecrets),
      }
      privacy = combineHttpPrivacy(privacy, received.privacy)
      extractVariables(request, response, extracted)
      privacy = combineHttpPrivacy(
        privacy,
        requestHttpPrivacy(request, chainedContext(context, extracted)),
      )
      casePrivacy = privacy
      results.push({
        privacy,
        requestId: request.id,
        requestName: privacy.redactText(request.name),
        method: prepared.method,
        url: redactHttpHistoryUrl(privacy.redactUrl(prepared.url)),
        response: { ...response, privacy },
      })
    } catch (error) {
      privacy = combineHttpPrivacy(
        privacy,
        error instanceof HttpExecutionError ? error.privacy : undefined,
        requestHttpPrivacy(request, chainedContext(context, extracted)),
      )
      casePrivacy = privacy
      results.push({
        privacy,
        requestId: request.id,
        requestName: privacy.redactText(request.name),
        method: request.method,
        url: redactHttpHistoryUrl(privacy.redactUrl(request.url)),
        error: collectionRunError(
          contextReady ? error : new Error(HTTP_ENVIRONMENT_PREPARATION_ERROR),
          privacy,
          environmentName,
        ),
      })
      break
    }
  }
  return {
    name,
    items: results.map((item) => ({
      ...item,
      privacy: casePrivacy,
      ...(item.response ? { response: { ...item.response, privacy: casePrivacy } } : {}),
    })),
  }
}

function csvRows(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index <= source.length; index += 1) {
    const character = source[index] ?? "\n"
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = !quoted
    } else if (!quoted && (character === "," || character === "\n")) {
      row.push(field)
      field = ""
      if (character === "\n") {
        if (row.some((value) => value.length)) rows.push(row)
        row = []
      }
    } else if (character !== "\r") field += character
  }
  return rows
}

export async function loadHttpRunnerDataset(path: string) {
  const source = await readFile(path, "utf8")
  if (path.toLowerCase().endsWith(".csv")) {
    const [headers = [], ...rows] = csvRows(source)
    return rows.map((row, index) => ({
      name: `linha-${index + 1}`,
      values: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])),
    }))
  }
  const parsed = JSON.parse(source) as unknown
  const values = Array.isArray(parsed) ? parsed : [parsed]
  return values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Caso ${index + 1} do dataset precisa ser um objeto.`)
    }
    return {
      name: `caso-${index + 1}`,
      values: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          typeof item === "string" ? item : JSON.stringify(item),
        ]),
      ),
    }
  })
}

export async function loadHttpProjectRunnerDataset(root: string, path: string) {
  const projectRoot = await realpath(root)
  let source: string
  try {
    source = await realpath(resolve(projectRoot, path))
  } catch {
    throw new Error(`Dataset não encontrado: ${path}.`)
  }
  if (source !== projectRoot && !source.startsWith(`${projectRoot}${sep}`)) {
    throw new Error("O dataset precisa permanecer dentro do projeto.")
  }
  const info = await stat(source)
  if (!info.isFile()) throw new Error("O caminho do dataset não aponta para um arquivo.")
  if (info.size > 8_000_000) throw new Error("O dataset excede 8 MB.")
  return loadHttpRunnerDataset(source)
}

export async function runHttpDataset<T>(
  cases: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<HttpRunCase>,
  signal?: AbortSignal,
) {
  const results = new Array<HttpRunCase>(cases.length)
  let next = 0
  const workers = Array.from(
    { length: Math.max(1, Math.min(8, concurrency, cases.length)) },
    async () => {
      while (next < cases.length && !signal?.aborted) {
        const index = next
        next += 1
        results[index] = await run(cases[index]!, index)
      }
    },
  )
  await Promise.all(workers)
  return results.filter((result): result is HttpRunCase => Boolean(result))
}

export function resolveHttpRunFile(root: string, value: string) {
  const separator = value.lastIndexOf("#")
  const filePart = separator > 0 ? value.slice(0, separator) : value
  const selector = separator > 0 ? value.slice(separator + 1) : undefined
  return { path: resolve(root, filePart), ...(selector ? { selector } : {}) }
}
