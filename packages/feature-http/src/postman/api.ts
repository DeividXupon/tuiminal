import { validatePostmanApiKey, type PostmanAccount } from "./account"

export type PostmanWorkspace = { id: string; name: string; visibility?: string }
export type PostmanCollection = { id: string; uid?: string; name: string; updatedAt?: string }
export type PostmanEnvironment = { id: string; uid?: string; name: string; updatedAt?: string }
export type PostmanVariable = {
  key: string
  value?: string
  enabled?: boolean
  type?: string
  secret?: boolean
  source?: unknown
}

export type PostmanFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Json = Record<string, unknown>
const MAX_RESPONSE_BYTES = 20_000_000
const PAGE_LIMIT = 100
const MAX_PAGES = 50

function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Resposta inesperada da API Postman.")
  }
  return value as Json
}

function items<T>(source: Json, name: string): T[] {
  const value = source[name]
  if (!Array.isArray(value)) throw new Error("Resposta inesperada da API Postman.")
  return value as T[]
}

function resourceId(id: string) {
  if (!/^[\w-]{1,128}$/u.test(id)) throw new Error("Identificador Postman inválido.")
  return encodeURIComponent(id)
}

async function boundedJson(response: Response): Promise<Json> {
  const size = Number(response.headers.get("content-length"))
  if (size > MAX_RESPONSE_BYTES) throw new Error("Resposta Postman maior que 20 MB.")
  if (!response.body) return object(await response.json())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new Error("Resposta Postman maior que 20 MB.")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    length,
  ).toString("utf8")
  try {
    return object(JSON.parse(body))
  } catch {
    throw new Error("Resposta JSON inválida da API Postman.")
  }
}

async function throwPostmanApiError(response: Response): Promise<never> {
  await response.body?.cancel().catch(() => {})
  if (response.status === 401) throw new Error("Chave de API Postman inválida ou expirada.")
  if (response.status === 403) throw new Error("A conta não tem acesso a este recurso Postman.")
  if (response.status === 404) throw new Error("Recurso Postman não encontrado.")
  if (response.status === 429) {
    const candidate = response.headers.get("retry-after")
    const delay = candidate && /^\d{1,5}$/.test(candidate) ? candidate : null
    throw new Error(`Limite da API Postman atingido${delay ? `; tente em ${delay} s` : ""}.`)
  }
  throw new Error(`A API Postman retornou HTTP ${response.status}.`)
}

export class PostmanApi {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(
    account: PostmanAccount,
    private readonly request: PostmanFetch = fetch,
    baseUrl?: string,
  ) {
    this.apiKey = validatePostmanApiKey(account.apiKey)
    this.baseUrl =
      baseUrl ??
      (account.region === "eu" ? "https://api.eu.postman.com" : "https://api.postman.com")
  }

  private async requestJson(
    path: string,
    query?: Record<string, string | number>,
    body?: Record<string, unknown>,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = body ? "PUT" : "GET",
  ): Promise<Json> {
    const url = new URL(path, this.baseUrl)
    for (const [name, value] of Object.entries(query ?? {}))
      url.searchParams.set(name, String(value))
    let response: Response
    try {
      response = await this.request(url, {
        method,
        headers: {
          "x-api-key": this.apiKey,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      })
    } catch {
      throw new Error("Não foi possível conectar à API Postman.")
    }
    if (!response.ok) return throwPostmanApiError(response)
    return boundedJson(response)
  }

  private get(path: string, query?: Record<string, string | number>): Promise<Json> {
    return this.requestJson(path, query)
  }

  async workspaces(): Promise<PostmanWorkspace[]> {
    const all: PostmanWorkspace[] = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.get("/workspaces", {
        limit: PAGE_LIMIT,
        ...(cursor ? { cursor } : {}),
      })
      all.push(...items<PostmanWorkspace>(result, "workspaces"))
      const next = object(result.meta ?? {}).nextCursor
      if (typeof next !== "string" || !next) return all
      if (cursors.has(next)) break
      cursors.add(next)
      cursor = next
    }
    throw new Error("Paginação dos workspaces Postman excedeu o limite.")
  }

  async collections(workspaceId: string): Promise<PostmanCollection[]> {
    const all: PostmanCollection[] = []
    let offset = 0
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.get("/collections", {
        workspace: resourceId(workspaceId),
        limit: PAGE_LIMIT,
        offset,
      })
      const current = items<PostmanCollection>(result, "collections")
      all.push(...current)
      const total = object(result.meta ?? {}).total
      if (typeof total === "number" && all.length >= total) return all
      if (current.length === 0) {
        if (typeof total === "number") break
        return all
      }
      if (typeof total !== "number" && current.length < PAGE_LIMIT) return all
      offset += current.length
    }
    throw new Error("Paginação das coleções Postman excedeu o limite.")
  }

  async environments(workspaceId: string): Promise<PostmanEnvironment[]> {
    return items<PostmanEnvironment>(
      await this.get("/environments", { workspace: resourceId(workspaceId) }),
      "environments",
    )
  }

  async collection(id: string): Promise<Json> {
    return object((await this.get(`/collections/${resourceId(id)}`)).collection)
  }

  async createCollection(workspaceId: string, name: string) {
    return object(
      (
        await this.requestJson(
          "/collections",
          { workspace: resourceId(workspaceId) },
          {
            collection: {
              info: {
                name,
                schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
              },
              item: [],
            },
          },
          "POST",
        )
      ).collection,
    )
  }

  async renameCollection(collectionId: string, name: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}`,
      undefined,
      { collection: { info: { name } } },
      "PATCH",
    )
  }

  async deleteCollection(collectionId: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}`,
      undefined,
      undefined,
      "DELETE",
    )
  }

  async createRequest(collectionId: string, name: string, folderId?: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}/requests`,
      folderId ? { folder: resourceId(folderId) } : undefined,
      { name, method: "GET", url: "https://example.invalid" },
      "POST",
    )
  }

  async createFolder(collectionId: string, name: string, parentFolderId?: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}/folders`,
      undefined,
      { name, ...(parentFolderId ? { folder: resourceId(parentFolderId) } : {}) },
      "POST",
    )
  }

  async renameFolder(collectionId: string, folderId: string, name: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}/folders/${resourceId(folderId)}`,
      undefined,
      { name },
      "PUT",
    )
  }

  async deleteFolder(collectionId: string, folderId: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}/folders/${resourceId(folderId)}`,
      undefined,
      undefined,
      "DELETE",
    )
  }

  async deleteRequest(collectionId: string, requestId: string) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}/requests/${resourceId(requestId)}`,
      undefined,
      undefined,
      "DELETE",
    )
  }

  async updateRequest(collectionId: string, requestId: string, changes: Record<string, unknown>) {
    return this.requestJson(
      `/collections/${resourceId(collectionId)}/requests/${resourceId(requestId)}`,
      undefined,
      changes,
    )
  }

  async environment(id: string): Promise<{ name: string; values: PostmanVariable[] }> {
    const value = object((await this.get(`/environments/${resourceId(id)}`)).environment)
    return { name: String(value.name ?? ""), values: items<PostmanVariable>(value, "values") }
  }

  async globals(workspaceId: string): Promise<PostmanVariable[]> {
    return items<PostmanVariable>(
      await this.get(`/workspaces/${resourceId(workspaceId)}/global-variables`),
      "values",
    )
  }
}
