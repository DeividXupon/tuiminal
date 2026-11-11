import { refreshInheritedRequest } from "./inherited-settings"
import { HttpScriptScopeStore } from "../services/script-scopes"
import type { HttpRequestDefinition } from "../model/types"
import { createHttpVariableContext } from "../model/variables"
import { httpBuiltInVariables } from "../model/environment-scope"
import type { PostmanApi, PostmanCollection, PostmanVariable } from "./api"
import { livePostmanCollection, postmanValues, type LivePostmanCollection } from "./live-view"
import { saveLivePostmanRequest } from "./live-save"

export type LivePostmanApi = Pick<
  PostmanApi,
  | "collections"
  | "collection"
  | "globals"
  | "environments"
  | "environment"
  | "createCollection"
  | "renameCollection"
  | "deleteCollection"
  | "createRequest"
  | "updateRequest"
  | "deleteRequest"
  | "createFolder"
  | "renameFolder"
  | "deleteFolder"
  | "copyFolder"
> &
  Partial<
    Pick<
      PostmanApi,
      | "saveEnvironment"
      | "createEnvironment"
      | "deleteEnvironment"
      | "saveGlobals"
      | "replaceCollection"
    >
  >

/** Owned by one mounted HTTP workspace. All account data is volatile. */
export class LivePostmanSession {
  private scriptScopes = new HttpScriptScopeStore()
  private collections = new Map<string, LivePostmanCollection>()
  private listeners = new Set<() => void>()
  private version = 0
  private busy = false
  private disposed = false
  readonly pendingCreations = new Map<string, string>()
  private reads = new Map<string, number>()
  private globals: Record<string, string> = {}
  private environment: Record<string, string> = {}
  environmentName: string | null = null
  errors: string[] = []

  constructor(
    readonly api: LivePostmanApi,
    readonly workspaceId: string,
    public environmentId?: string,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  snapshot = () => this.view
  dispose() {
    this.disposed = true
    this.collections.clear()
    this.scriptScopes.clear()
    this.version++
    this.globals = {}
    this.environment = {}
    this.listeners.clear()
    this.pendingCreations.clear()
    this.reads.clear()
  }
  private publish() {
    if (this.disposed) return
    this.version++
    for (const listener of this.listeners) listener()
  }
  install(collection: LivePostmanCollection) {
    if (this.disposed) return
    this.collections.set(collection.file.path, collection)
    this.publish()
  }
  remove(path: string) {
    this.collections.delete(path)
    this.publish()
  }
  collection(path: string) {
    const value = this.collections.get(path)
    if (!value) throw new Error("A coleção Postman mudou; atualize a biblioteca.")
    return value
  }
  private viewCache: { version: number; value: LivePostmanView } | null = null
  get view(): LivePostmanView {
    if (this.viewCache?.version === this.version) return this.viewCache.value
    const entries = [...this.collections.values()]
    const value = {
      variablesForRequest: (request: HttpRequestDefinition) => this.variablesForRequest(request),
      projectRequests: entries.flatMap((entry) => entry.requests),
      sourceFiles: entries.map((entry) => entry.file),
      sourceDirectories: [] as string[],
      sourcePostmanFolders: entries.flatMap((entry) => entry.folders),
    }
    this.viewCache = { version: this.version, value }
    return value
  }
  async load(onProgress?: (done: number, total: number) => void) {
    const selected = await this.api.collections(this.workspaceId)
    if (this.disposed) return
    const globals = postmanValues(await this.api.globals(this.workspaceId))
    let environment: Record<string, string> = {}
    let environmentName: string | null = null
    let environmentId = this.environmentId
    if (this.environmentId) {
      const available = await this.api.environments(this.workspaceId)
      const entry = available.find(
        (item) => item.id === this.environmentId || item.uid === this.environmentId,
      )
      if (!entry) throw new Error("Ambiente não encontrado neste workspace Postman.")
      environmentId = entry.uid ?? entry.id
      const remote = await this.api.environment(environmentId)
      environment = postmanValues(remote.values)
      environmentName = remote.name
    }
    const next = new Map<string, LivePostmanCollection>()
    const errors: string[] = []
    let done = 0
    for (const entry of selected) {
      if (this.disposed) return
      try {
        const collection = livePostmanCollection(
          entry,
          await this.api.collection(entry.uid ?? entry.id),
        )
        next.set(collection.file.path, collection)
      } catch (error) {
        errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
      onProgress?.(++done, selected.length)
    }
    if (this.disposed) return
    this.collections = next
    this.globals = globals
    this.environment = environment
    this.environmentName = environmentName
    this.environmentId = environmentId
    this.errors = errors
    this.publish()
  }
  async fetchCollection(selected: PostmanCollection) {
    const token = (this.reads.get(selected.id) ?? 0) + 1
    this.reads.set(selected.id, token)
    const collection = livePostmanCollection(
      selected,
      await this.api.collection(selected.uid ?? selected.id),
    )
    if (this.reads.get(selected.id) !== token)
      return this.collections.get(collection.file.path) ?? collection
    this.install(collection)
    return collection
  }
  async openRequest(request: HttpRequestDefinition) {
    if (this.busy) throw new Error("Aguarde a operação Postman em andamento.")
    if (request.source.kind !== "file") return request
    const current = this.collection(request.source.path)
    const latest = await this.fetchCollection(current.selected)
    const item = latest.requests.find((entry) => entry.request.id === request.id)
    if (!item) throw new Error("A request não existe mais no Postman.")
    return item.request
  }
  async mutate<T>(operation: () => Promise<T>) {
    this.assertActive()
    if (this.busy) throw new Error("Aguarde a operação Postman em andamento.")
    this.busy = true
    try {
      return await operation()
    } finally {
      this.busy = false
    }
  }
  assertActive = () => {
    if (this.disposed) throw new Error("Conexão Postman cancelada.")
  }
  setEnvironment(id: string | undefined, name: string | null, values: PostmanVariable[]) {
    this.assertActive()
    this.environmentId = id
    this.environmentName = name
    this.environment = postmanValues(values)
    this.publish()
  }
  setGlobals(values: PostmanVariable[]) {
    this.assertActive()
    this.globals = postmanValues(values)
    this.publish()
  }
  async save(request: HttpRequestDefinition) {
    return this.mutate(async () => {
      if (request.source.kind !== "file") throw new Error("Selecione uma coleção Postman.")
      const collection = this.collection(request.source.path)
      this.reads.set(collection.selected.id, (this.reads.get(collection.selected.id) ?? 0) + 1)
      const result = await saveLivePostmanRequest(this.api, collection, request, this.assertActive)
      this.install(result.collection)
      return result.request
    })
  }
  requestForExecution = (request: HttpRequestDefinition) => {
    const latest =
      request.source.kind === "file"
        ? this.collections
            .get(request.source.path)
            ?.requests.find((entry) => entry.request.id === request.id)?.request
        : undefined
    return refreshInheritedRequest(request, latest)
  }
  variablesForRequest = (request: HttpRequestDefinition) => {
    const collection =
      request.source.kind === "file" ? this.collections.get(request.source.path) : undefined
    return this.scriptScopes.context(
      createHttpVariableContext([
        {
          origin: "request",
          values: collection?.privateValues ?? {},
          secret: true,
        },
        { origin: "private", values: this.environment, secret: true },
        { origin: "file", values: collection?.variables ?? {}, secret: true },
        { origin: "public", values: this.globals, secret: true },
        { origin: "built-in", values: httpBuiltInVariables() },
      ]),
      {
        environment: `environment:${this.environmentId ?? ""}`,
        globals: "globals",
        collectionVariables: `collection:${collection?.file.path ?? ""}`,
      },
      {
        environment: this.environment,
        globals: this.globals,
        collectionVariables: collection?.variables ?? {},
      },
    )
  }
}

export type LivePostmanView = {
  variablesForRequest: LivePostmanSession["variablesForRequest"]
  projectRequests: LivePostmanCollection["requests"]
  sourceFiles: LivePostmanCollection["file"][]
  sourceDirectories: string[]
  sourcePostmanFolders: LivePostmanCollection["folders"]
}

export function requirePostmanSession(session: LivePostmanSession | null | undefined) {
  if (!session) throw new Error("Selecione um workspace Postman.")
  return session
}
