import { createHash, randomUUID } from "node:crypto"
import { lstat, open, readFile, realpath, rename, rm } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { parseHttpFile, requestFromHttpFile } from "../model/http-file"
import type { HttpAuth, HttpRequestDefinition } from "../model/types"
import { urlQueryEntryPrefix } from "../model/url-query"
import type { PostmanApi } from "./api"

export type PostmanEntry = {
  key: string
  requestId: string
  remoteHash: string
  baseline: Snapshot
}
export type PostmanFolder = { id: string; path: string; remoteHash: string }
export type PostmanCollectionFolder = PostmanFolder & { filePath: string }
export type PostmanProvenance = {
  version: 1
  collectionId: string
  workspaceId?: string
  collectionHash?: string
  entries: PostmanEntry[]
  folders?: PostmanFolder[]
}
export type Snapshot = {
  name: string
  method: string
  url: string
  headers: Array<{ key: string; value: string; enabled: boolean }>
  path: Array<{ key: string; value: string; enabled: boolean }>
  auth: HttpAuth
  body: HttpRequestDefinition["body"]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/u.test(value)
}

export function postmanRemoteHash(item: unknown) {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex")
}

export function postmanRemoteRequests(collection: unknown) {
  const found: Array<Record<string, unknown>> = []
  const visit = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const value of items) {
      const item = record(value)
      if (!item) continue
      if (Array.isArray(item.item)) visit(item.item)
      else if (record(item.request)) found.push(item)
    }
  }
  visit(record(collection)?.item)
  return found
}

export function postmanRemoteFolders(collection: unknown): PostmanFolder[] {
  const found: PostmanFolder[] = []
  const visit = (items: unknown, parent = "") => {
    if (!Array.isArray(items)) return
    for (const value of items) {
      const item = record(value)
      if (!item || !Array.isArray(item.item)) continue
      const name = typeof item.name === "string" ? item.name : ""
      const path = parent ? `${parent} / ${name}` : name
      if (validId(item.id) && name) {
        found.push({ id: item.id, path, remoteHash: postmanRemoteHash(item) })
      }
      visit(item.item, path)
    }
  }
  visit(record(collection)?.item)
  return found
}

function requestUrl(request: HttpRequestDefinition) {
  const query = request.query
    .filter((entry) => !entry.id.startsWith(urlQueryEntryPrefix(request.id)))
    .filter((entry) => entry.enabled && entry.name.trim())
    .map((entry) => {
      const value = /\{\{[^{}]+\}\}/.test(entry.value)
        ? entry.value
        : encodeURIComponent(entry.value)
      return `${encodeURIComponent(entry.name)}=${value}`
    })
    .join("&")
  return query ? `${request.url}${request.url.includes("?") ? "&" : "?"}${query}` : request.url
}

export function postmanRequestSnapshot(request: HttpRequestDefinition): Snapshot {
  return {
    name: request.name,
    method: request.method,
    url: requestUrl(request),
    headers: request.headers.map((entry) => ({
      key: entry.name,
      value: entry.value,
      enabled: entry.enabled,
    })),
    path: request.path.map((entry) => ({
      key: entry.name,
      value: entry.value,
      enabled: entry.enabled,
    })),
    auth: request.auth,
    body: request.body,
  }
}

function changed(a: unknown, b: unknown) {
  return JSON.stringify(a) !== JSON.stringify(b)
}

function remoteName(before: string, after: string) {
  const separator = before.lastIndexOf(" / ")
  const prefix = separator < 0 ? "" : before.slice(0, separator + 3)
  if (after.includes(" / ") && !after.startsWith(prefix)) {
    throw new Error("O nome local mudou a pasta da request; renomeie apenas a request.")
  }
  return prefix && after.startsWith(prefix) ? after.slice(prefix.length) : after
}

function remoteAuth(auth: HttpAuth) {
  if (JSON.stringify(auth).match(/\{\{postman_[^{}]+\}\}/)) {
    throw new Error("Autenticação com segredo privado importado não pode ser enviada ao Postman.")
  }
  if (auth.kind === "none") return null
  if (auth.kind === "bearer")
    return { type: "bearer", bearer: [{ key: "token", value: auth.token }] }
  if (auth.kind === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: auth.username },
        { key: "password", value: auth.password },
      ],
    }
  }
  return {
    type: "apikey",
    apikey: [
      { key: "key", value: auth.name },
      { key: "value", value: auth.value },
      { key: "in", value: auth.placement },
    ],
  }
}

function remoteBody(body: Snapshot["body"]) {
  if (!["none", "json", "text", "xml"].includes(body.kind)) {
    throw new Error("Envio deste formato de body ao Postman ainda não é suportado.")
  }
  if (body.kind === "none") return { dataMode: "none", rawModeData: "" }
  return {
    dataMode: "raw",
    rawModeData: body.text,
    dataOptions: { raw: { language: body.kind === "text" ? "text" : body.kind } },
  }
}

function remoteHeaders(headers: Snapshot["headers"]) {
  if (headers.some((header) => /\{\{postman_[^{}]+\}\}/.test(header.value))) {
    throw new Error("Headers com segredos privados importados não podem ser enviados ao Postman.")
  }
  return headers
}

export function postmanRequestKey(blockId: string) {
  return blockId.slice(blockId.lastIndexOf("#") + 1)
}

function payload(before: Snapshot, after: Snapshot) {
  const update: Record<string, unknown> = {}
  if (before.name !== after.name) update.name = remoteName(before.name, after.name)
  if (before.method !== after.method) update.method = after.method
  if (before.url !== after.url) update.url = after.url
  if (changed(before.headers, after.headers)) update.headerData = remoteHeaders(after.headers)
  if (changed(before.path, after.path)) update.pathVariableData = after.path
  if (changed(before.auth, after.auth)) update.auth = remoteAuth(after.auth)
  if (changed(before.body, after.body)) Object.assign(update, remoteBody(after.body))
  return update
}

export async function postmanSidecar(root: string, filePath: string) {
  if (!filePath.replaceAll("\\", "/").startsWith("postman/") || !filePath.endsWith(".http")) {
    throw new Error("Somente requests importadas da conta Postman podem ser enviadas.")
  }
  const canonicalRoot = await realpath(root)
  const file = resolve(canonicalRoot, filePath)
  if (!file.startsWith(`${canonicalRoot}${sep}`)) throw new Error("Caminho HTTP inválido.")
  const directory = await realpath(dirname(file))
  if (relative(canonicalRoot, directory) !== "postman") {
    throw new Error("A coleção Postman precisa permanecer na biblioteca HTTP.")
  }
  const actual = await realpath(file)
  if (actual !== file) throw new Error("Arquivo HTTP Postman simbólico não é permitido.")
  return `${file}.postman.json`
}

export async function readPostmanProvenance(path: string): Promise<PostmanProvenance> {
  const info = await lstat(path).catch(() => null)
  if (!info?.isFile() || info.isSymbolicLink()) {
    throw new Error("Associação Postman indisponível. Importe a coleção novamente.")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, "utf8"))
  } catch {
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  }
  const data = record(parsed)
  if (
    data?.version !== 1 ||
    !validId(data.collectionId) ||
    !Array.isArray(data.entries) ||
    data.entries.some((entry) => {
      const item = record(entry)
      return (
        !item ||
        typeof item.key !== "string" ||
        !validId(item.requestId) ||
        typeof item.remoteHash !== "string" ||
        !record(item.baseline)
      )
    })
  ) {
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  }
  if (data.workspaceId !== undefined && !validId(data.workspaceId)) {
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  }
  if (data.collectionHash !== undefined && !/^[a-f0-9]{64}$/u.test(String(data.collectionHash))) {
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  }
  if (
    data.folders !== undefined &&
    (!Array.isArray(data.folders) ||
      data.folders.some((folder) => {
        const item = record(folder)
        return (
          !item ||
          !validId(item.id) ||
          typeof item.path !== "string" ||
          !item.path ||
          typeof item.remoteHash !== "string" ||
          !/^[a-f0-9]{64}$/u.test(item.remoteHash)
        )
      }))
  ) {
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
  }
  return data as PostmanProvenance
}

export async function replacePostmanProvenance(path: string, value: PostmanProvenance) {
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporary, "wx", 0o600)
  try {
    await handle.writeFile(JSON.stringify(value), "utf8")
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export async function writePostmanProvenance(
  root: string,
  filePath: string,
  collectionId: string,
  collection: unknown,
  workspaceId?: string,
) {
  if (!validId(collectionId)) throw new Error("Identificador de coleção Postman inválido.")
  if (workspaceId !== undefined && !validId(workspaceId))
    throw new Error("Identificador de workspace Postman inválido.")
  const path = await postmanSidecar(root, filePath)
  const source = await readFile(path.slice(0, -".postman.json".length), "utf8")
  const file = parseHttpFile(source, filePath)
  const items = postmanRemoteRequests(collection)
  const entries = file.requests.flatMap((block, index): PostmanEntry[] => {
    const item = items[index]
    if (!item || !validId(item.id)) return []
    return [
      {
        key: postmanRequestKey(block.blockId),
        requestId: item.id,
        remoteHash: postmanRemoteHash(item),
        baseline: postmanRequestSnapshot(requestFromHttpFile(file, block)),
      },
    ]
  })
  const handle = await open(path, "wx", 0o600)
  try {
    await handle.writeFile(
      JSON.stringify({
        version: 1,
        collectionId,
        workspaceId,
        collectionHash: postmanRemoteHash(collection),
        entries,
        folders: postmanRemoteFolders(collection),
      }),
      "utf8",
    )
    await handle.sync()
  } finally {
    await handle.close()
  }
  return file.requests.length - entries.length
}

export async function pushPostmanRequest(
  root: string,
  api: Pick<PostmanApi, "collection" | "updateRequest">,
  request: HttpRequestDefinition,
) {
  if (request.source.kind !== "file" || request.source.supported === false) {
    throw new Error("Salve uma request Postman editável antes de enviá-la.")
  }
  const requestSource = request.source
  const metadataPath = await postmanSidecar(root, requestSource.path)
  const metadata = await readPostmanProvenance(metadataPath)
  const key = postmanRequestKey(requestSource.blockId)
  const entries = metadata.entries.filter((item) => item.key === key)
  const entry = entries.length === 1 ? entries[0] : undefined
  if (!entry || !validId(entry.requestId) || !/^[a-f0-9]{64}$/.test(entry.remoteHash)) {
    throw new Error("Esta request não possui ID remoto; importe a coleção novamente.")
  }
  const localSource = await readFile(metadataPath.slice(0, -".postman.json".length), "utf8")
  const local = parseHttpFile(localSource, requestSource.path)
  if (local.sourceHash !== requestSource.sourceHash) {
    throw new Error("O arquivo HTTP mudou; recarregue a request antes de enviá-la.")
  }
  const blocks = local.requests.filter((item) => postmanRequestKey(item.blockId) === entry.key)
  const block = blocks.length === 1 ? blocks[0] : undefined
  if (!block?.editable) throw new Error("A request local não está disponível para edição.")
  const current = postmanRequestSnapshot(requestFromHttpFile(local, block))
  const update = payload(entry.baseline, current)
  if (Object.keys(update).length === 0) return "unchanged" as const
  const collection = await api.collection(metadata.collectionId)
  const collectionBaselineMatches = metadata.collectionHash === postmanRemoteHash(collection)
  const remote = postmanRemoteRequests(collection).find((item) => item.id === entry.requestId)
  if (!remote || postmanRemoteHash(remote) !== entry.remoteHash) {
    throw new Error("A request mudou no Postman; importe a coleção novamente antes de enviar.")
  }
  await api.updateRequest(metadata.collectionId, entry.requestId, update)
  const refreshed = await api.collection(metadata.collectionId)
  const updated = postmanRemoteRequests(refreshed).find((item) => item.id === entry.requestId)
  if (!updated)
    throw new Error("Request enviada, mas a confirmação remota falhou. Reimporte a coleção.")
  entry.remoteHash = postmanRemoteHash(updated)
  entry.baseline = current
  if (collectionBaselineMatches) {
    metadata.collectionHash = postmanRemoteHash(refreshed)
    metadata.folders = postmanRemoteFolders(refreshed)
  }
  await replacePostmanProvenance(metadataPath, metadata)
  return "pushed" as const
}
