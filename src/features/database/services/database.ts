import { randomUUID } from "node:crypto"
import {
  databaseQueryHistoryParameterPreview,
  databaseQueryHistorySessionParameterPreview,
  normalizeQueryHistoryParameterPreview,
} from "../model/history-parameters"
export {
  DATABASE_QUERY_HISTORY_PARAMETER_LIMIT,
  DATABASE_QUERY_HISTORY_PARAMETER_NAME_LIMIT,
  DATABASE_QUERY_HISTORY_PARAMETER_VALUE_LIMIT,
  DATABASE_QUERY_HISTORY_SENSITIVE_TERMS,
  limitQueryHistoryParameterText,
  queryHistoryParameterValue,
  queryHistoryParameterIsSensitive,
  databaseQueryHistoryParameterPreview,
  databaseQueryHistorySessionParameterPreview,
  normalizeQueryHistoryParameterPreview,
} from "../model/history-parameters"
import { historyEntryIsRead, metadataOnlyHistoryEntry } from "../model/history-privacy"
import {
  clearHistoryContent,
  rememberHistoryContent,
  restoreHistoryContent,
  retainHistoryContent,
} from "./history-content"
import { accessSync, constants, existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { definedProperties } from "../../../shared/data/defined-properties"
import { isReadOnlySql } from "../model/sql-read-policy"
import {
  nativeReadOnlyQuery,
  readOnlyClientIsInvalid,
  type CancelableDatabaseQuery,
  type RuntimeSqlClient,
} from "./read-only-query"
export type {
  CancelableDatabaseQuery,
  RuntimeSqlClient,
  RuntimeSqlExecutor,
} from "./read-only-query"
import { isSensitiveColumnName } from "../../../shared/security/sensitive-data"
import { atomicWriteFileSync, fileContentHash } from "../../../shared/storage/atomic-file"
import type {
  DatabaseCatalog,
  DatabaseColumn,
  DatabaseConnectionDraft,
  DatabaseConnectionProfile,
  DatabaseConstraint,
  DatabaseDriver,
  DatabaseIndex,
  DatabaseMutationBatchResult,
  DatabaseMutationPreview,
  DatabaseQueryExecutionOptions,
  DatabaseQueryHistoryEntry,
  DatabaseQueryHistorySessionParameter,
  DatabaseQueryPlan,
  DatabaseQueryResult,
  DatabaseRelationship,
  DatabaseSavedQuery,
  DatabaseTable,
  DatabaseTableMutation,
  DatabaseTablePageOptions,
  DatabaseTableQuery,
  DatabaseTableStructure,
  TablePage,
} from "../model/types"
import { sqliteQueryProcessCommand } from "./sqlite-query-runtime"
import {
  databaseMutationConnectionFailureMayBeUncertain,
  emptyDatabaseMutationExecutionState,
  executeDatabaseMutationTransaction,
} from "./database-mutations"

export { coerceDatabaseCellValue } from "../model/cell-value"

export function databaseSavedQueryIsDirty(query: DatabaseSavedQuery | null, currentSql: string) {
  return Boolean(query && query.sql !== currentSql)
}

export type StoredDatabaseSettings = {
  version: 1
  defaultConnectionId: string | null
  connections: DatabaseConnectionProfile[]
  savedQueries: Record<string, DatabaseSavedQuery[]>
  queryHistory: DatabaseQueryHistoryEntry[]
}

export type McpTextContent = {
  type: "text"
  text: string
}

export class DatabaseQueryCancelledError extends Error {
  constructor() {
    super("Consulta cancelada.")
    this.name = "DatabaseQueryCancelledError"
  }
}

export class DatabaseMutationConflictError extends Error {
  constructor(message = "O registro foi alterado desde a revisão. Recarregue e revise novamente.") {
    super(message)
    this.name = "DatabaseMutationConflictError"
  }
}

export class DatabaseMutationCommitUncertainError extends Error {
  readonly cause: unknown

  constructor(cause: unknown) {
    super(
      "A conexão foi perdida durante a gravação e não foi possível confirmar o commit. " +
        "Recarregue os dados antes de tentar novamente.",
    )
    this.name = "DatabaseMutationCommitUncertainError"
    this.cause = cause
  }
}

export type SqliteProcessResult = {
  rows: Array<Record<string, unknown>>
  columns: string[]
  affectedRows: number | null
}

export type SqliteProcessResponse =
  | ({ id: string; ok: true } & SqliteProcessResult)
  | { id: string; ok: false; error: string }

export type SqliteQuerySubprocess = {
  killed: boolean
  kill: (signal?: number | NodeJS.Signals) => void
  exited: Promise<number>
  send: (message: unknown) => void
}

export type PendingSqliteQuery = {
  id: string
  signal?: AbortSignal
  onAbort: () => void
  resolve: (result: SqliteProcessResult) => void
  reject: (error: Error) => void
}

export type SqliteQuerySession = {
  key: string
  subprocess: SqliteQuerySubprocess
  alive: boolean
  pending: PendingSqliteQuery | null
  idleTimer: ReturnType<typeof setTimeout> | null
}

export const SQLITE_QUERY_PROCESS_IDLE_MS = 30_000
export const sqliteQuerySessions = new Map<string, Set<SqliteQuerySession>>()

export function removeSqliteQuerySession(session: SqliteQuerySession) {
  const sessions = sqliteQuerySessions.get(session.key)
  sessions?.delete(session)
  if (!sessions?.size) sqliteQuerySessions.delete(session.key)
}

export function destroySqliteQuerySession(session: SqliteQuerySession, error?: Error) {
  if (!session.alive) return
  session.alive = false
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = null
  removeSqliteQuerySession(session)
  const pending = session.pending
  session.pending = null
  if (pending) {
    pending.signal?.removeEventListener("abort", pending.onAbort)
    pending.reject(error ?? new Error("O processo SQLite foi encerrado."))
  }
  if (!session.subprocess.killed) session.subprocess.kill("SIGKILL")
}

export function releaseSqliteQuerySession(session: SqliteQuerySession) {
  if (!session.alive) return
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = setTimeout(() => {
    destroySqliteQuerySession(session)
  }, SQLITE_QUERY_PROCESS_IDLE_MS)
}

export function createSqliteQuerySession(key: string) {
  let session: SqliteQuerySession | null = null
  const subprocess = Bun.spawn({
    cmd: sqliteQueryProcessCommand(),
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    serialization: "advanced",
    ipc: (message: SqliteProcessResponse) => {
      const currentSession = session
      const pending = currentSession?.pending
      if (!currentSession || !pending || pending.id !== message.id) return
      currentSession.pending = null
      pending.signal?.removeEventListener("abort", pending.onAbort)
      releaseSqliteQuerySession(currentSession)
      if (message.ok) pending.resolve(message)
      else pending.reject(new Error(message.error))
    },
  })
  session = {
    key,
    subprocess,
    alive: true,
    pending: null,
    idleTimer: null,
  }
  const sessions = sqliteQuerySessions.get(key) ?? new Set<SqliteQuerySession>()
  sessions.add(session)
  sqliteQuerySessions.set(key, sessions)
  void subprocess.exited.then((exitCode) => {
    const currentSession = session
    if (!currentSession?.alive) return
    destroySqliteQuerySession(
      currentSession,
      new Error(`O processo SQLite terminou sem resposta (código ${exitCode}).`),
    )
  })
  return session
}

export function acquireSqliteQuerySession(key: string) {
  const reusable = [...(sqliteQuerySessions.get(key) ?? [])].find(
    (session) => session.alive && !session.pending,
  )
  if (reusable) {
    if (reusable.idleTimer) clearTimeout(reusable.idleTimer)
    reusable.idleTimer = null
    return reusable
  }
  return createSqliteQuerySession(key)
}

export function executeSqliteProcessQuery(
  profile: Pick<DatabaseConnectionProfile, "filename" | "writeEnabled">,
  sql: string,
  signal?: AbortSignal,
): Promise<SqliteProcessResult> {
  const filename = profile.filename
  if (!filename) return Promise.reject(new Error("Arquivo SQLite não informado."))
  if (signal?.aborted) return Promise.reject(new DatabaseQueryCancelledError())

  return new Promise((resolveQuery, rejectQuery) => {
    const key = `${filename}\0${profile.writeEnabled ? "rw" : "ro"}`
    const session = acquireSqliteQuerySession(key)
    const id = randomUUID()
    const onAbort = () => {
      destroySqliteQuerySession(session, new DatabaseQueryCancelledError())
    }
    session.pending = {
      id,
      ...(signal === undefined ? {} : { signal }),
      onAbort,
      resolve: resolveQuery,
      reject: rejectQuery,
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    try {
      session.subprocess.send({
        id,
        filename,
        readonly: !profile.writeEnabled,
        sql,
      })
    } catch (error) {
      destroySqliteQuerySession(
        session,
        error instanceof Error ? error : new Error("Não foi possível iniciar a consulta SQLite."),
      )
    }
  })
}

export async function awaitCancelableDatabaseQuery<T>(
  query: CancelableDatabaseQuery<T>,
  signal?: AbortSignal,
  forceCancel?: () => void | Promise<void>,
): Promise<T> {
  const executing = query.execute()
  return new Promise<T>((resolveQuery, rejectQuery) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener("abort", cancel)
      callback()
    }
    const cancel = () => {
      try {
        executing.cancel()
      } catch {
        // The forced connection close below remains the cancellation fallback.
      }
      if (forceCancel) void Promise.resolve(forceCancel()).catch(() => undefined)
      finish(() => rejectQuery(new DatabaseQueryCancelledError()))
    }
    executing.then(
      (value) => finish(() => resolveQuery(value)),
      (error) =>
        finish(() => rejectQuery(signal?.aborted ? new DatabaseQueryCancelledError() : error)),
    )
    if (signal?.aborted) cancel()
    else signal?.addEventListener("abort", cancel, { once: true })
  })
}

export type RuntimeBun = {
  SQL: new (options: Record<string, unknown>) => RuntimeSqlClient
  secrets?: {
    get: (options: { service: string; name: string }) => Promise<string | null>
    set: (options: {
      service: string
      name: string
      value: string
      allowUnrestrictedAccess?: boolean
    }) => Promise<void>
    delete: (options: { service: string; name: string }) => Promise<boolean>
  }
}

export const CONFIG_ROOT = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const DATABASE_SETTINGS_PATH = join(CONFIG_ROOT, "tuiminal", "databases.json")
export const SECRET_SERVICE = "dev.tuiminal.database"
export const LONG_VALUE_PATTERN = /(text|json|blob|binary|bytea)/i
export const BINARY_VALUE_PATTERN = /(blob|binary|bytea)/i
export const DRIVER_LABELS: Record<DatabaseDriver, string> = {
  mysql: "MySQL",
  postgres: "PostgreSQL",
  sqlite: "SQLite",
  "mcp-mysql": "MCP",
}

export const nativeClients = new Map<string, Promise<RuntimeSqlClient>>()
export const mcpClients = new Map<string, Promise<Client>>()
export const sessionPasswords = new Map<string, string>()
export const schemaCache = new Map<string, DatabaseColumn[]>()
export const QUERY_RESULT_LIMIT = 500
export const QUERY_RESULT_FETCH_LIMIT = QUERY_RESULT_LIMIT + 1
export const QUERY_RESULT_CELL_LIMIT_BYTES = 256_000
export const QUERY_TEXT_LIMIT = 100_000
export const DATABASE_QUERY_HISTORY_READ_LIMIT = 100
export const DATABASE_QUERY_HISTORY_CHANGE_RETENTION_DAYS = 184

export const DATABASE_DRIVER_OPTIONS: ReadonlyArray<{
  id: DatabaseDriver
  label: string
  description: string
}> = [
  { id: "mysql", label: "MySQL", description: "MySQL 5.7+ e MariaDB" },
  { id: "postgres", label: "Postgres", description: "PostgreSQL por wire protocol" },
  { id: "sqlite", label: "SQLite", description: "arquivo local" },
  { id: "mcp-mysql", label: "MCP", description: "servidor de banco compatível" },
]

export function runtimeBun() {
  const runtime = (globalThis as typeof globalThis & { Bun?: RuntimeBun }).Bun
  if (!runtime?.SQL) {
    throw new Error("As conexões nativas exigem que o Tuiminal seja executado com Bun.")
  }
  return runtime
}

export function isDriver(value: unknown): value is DatabaseDriver {
  return value === "mysql" || value === "postgres" || value === "sqlite" || value === "mcp-mysql"
}

export function normalizeSavedProfile(value: unknown): DatabaseConnectionProfile | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<DatabaseConnectionProfile>
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    !isDriver(candidate.driver)
  ) {
    return null
  }

  return definedProperties({
    id: candidate.id,
    name: candidate.name,
    driver: candidate.driver,
    source: "saved" as const,
    host: typeof candidate.host === "string" ? candidate.host : undefined,
    port: typeof candidate.port === "number" ? candidate.port : undefined,
    database: typeof candidate.database === "string" ? candidate.database : undefined,
    username: typeof candidate.username === "string" ? candidate.username : undefined,
    filename: typeof candidate.filename === "string" ? candidate.filename : undefined,
    command: typeof candidate.command === "string" ? candidate.command : undefined,
    ssl: candidate.ssl === true,
    writeEnabled: candidate.writeEnabled === true,
  })
}

export function normalizeSavedQuery(value: unknown): DatabaseSavedQuery | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<DatabaseSavedQuery>
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.sql !== "string"
  ) {
    return null
  }
  const now = new Date(0).toISOString()
  return {
    id: candidate.id,
    name: candidate.name.trim() || "Query sem nome",
    sql: candidate.sql,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
  }
}

export function normalizeSavedQueries(value: unknown): Record<string, DatabaseSavedQuery[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, DatabaseSavedQuery[]> = {}
  for (const [connectionId, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue
    const queries = entries
      .map(normalizeSavedQuery)
      .filter((query): query is DatabaseSavedQuery => Boolean(query))
    if (queries.length) normalized[connectionId] = queries
  }
  return normalized
}

export function normalizeQueryHistoryEntry(value: unknown): DatabaseQueryHistoryEntry | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<DatabaseQueryHistoryEntry>
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.connectionId !== "string" ||
    typeof candidate.connectionScope !== "string" ||
    typeof candidate.connectionName !== "string" ||
    !isDriver(candidate.driver) ||
    typeof candidate.sql !== "string" ||
    typeof candidate.command !== "string" ||
    (candidate.status !== "success" && candidate.status !== "error") ||
    typeof candidate.executedAt !== "string" ||
    typeof candidate.durationMs !== "number"
  ) {
    return null
  }
  return {
    id: candidate.id,
    connectionId: candidate.connectionId,
    connectionScope: candidate.connectionScope,
    connectionName: candidate.connectionName,
    driver: candidate.driver,
    ...(candidate.storage === "metadata-only"
      ? { storage: candidate.storage, readOnly: candidate.readOnly === true }
      : {}),
    sql: candidate.sql,
    command: candidate.command,
    status: candidate.status,
    executedAt: candidate.executedAt,
    durationMs: Math.max(0, candidate.durationMs),
    rowCount: typeof candidate.rowCount === "number" ? candidate.rowCount : null,
    affectedRows: typeof candidate.affectedRows === "number" ? candidate.affectedRows : null,
    error: typeof candidate.error === "string" ? candidate.error : null,
    rerunnable: candidate.rerunnable !== false,
    parameterPreview: normalizeQueryHistoryParameterPreview(candidate.parameterPreview),
  }
}

export const databaseQueryHistoryEntryIsRead = historyEntryIsRead

export function filterDatabaseQueryHistory(
  entries: readonly DatabaseQueryHistoryEntry[],
  showReads: boolean,
) {
  return showReads
    ? [...entries]
    : entries.filter((entry) => !databaseQueryHistoryEntryIsRead(entry))
}

export function retainDatabaseQueryHistory(
  entries: readonly DatabaseQueryHistoryEntry[],
  now = Date.now(),
) {
  return retainSortedDatabaseQueryHistory(
    [...entries].sort((left, right) => right.executedAt.localeCompare(left.executedAt)),
    now,
  )
}

export function retainSortedDatabaseQueryHistory(
  entries: readonly DatabaseQueryHistoryEntry[],
  now = Date.now(),
) {
  const changeCutoff = now - DATABASE_QUERY_HISTORY_CHANGE_RETENTION_DAYS * 24 * 60 * 60 * 1_000
  let retainedReads = 0
  return entries.filter((entry) => {
    if (databaseQueryHistoryEntryIsRead(entry)) {
      retainedReads += 1
      return retainedReads <= DATABASE_QUERY_HISTORY_READ_LIMIT
    }
    const executedAt = Date.parse(entry.executedAt)
    return Number.isFinite(executedAt) && executedAt >= changeCutoff
  })
}

export function normalizeQueryHistory(value: unknown): DatabaseQueryHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return retainDatabaseQueryHistory(
    value
      .map(normalizeQueryHistoryEntry)
      .filter((entry): entry is DatabaseQueryHistoryEntry => Boolean(entry)),
  )
}

let storedSettingsCache: StoredDatabaseSettings | null = null
let storedSettingsSourceHash: string | null = null
let storedSettingsReadError = ""

export function emptyStoredSettings(): StoredDatabaseSettings {
  return {
    version: 1,
    defaultConnectionId: null,
    connections: [],
    savedQueries: {},
    queryHistory: [],
  }
}

export function readSettings(): StoredDatabaseSettings {
  if (storedSettingsCache) return structuredClone(storedSettingsCache)
  try {
    if (!existsSync(DATABASE_SETTINGS_PATH)) {
      storedSettingsCache = emptyStoredSettings()
      storedSettingsSourceHash = null
      storedSettingsReadError = ""
      return structuredClone(storedSettingsCache)
    }
    const source = readFileSync(DATABASE_SETTINGS_PATH, "utf8")
    const parsed = JSON.parse(source) as Partial<StoredDatabaseSettings>
    storedSettingsCache = {
      version: 1,
      defaultConnectionId:
        typeof parsed.defaultConnectionId === "string" ? parsed.defaultConnectionId : null,
      connections: Array.isArray(parsed.connections)
        ? parsed.connections
            .map(normalizeSavedProfile)
            .filter((profile): profile is DatabaseConnectionProfile => Boolean(profile))
        : [],
      savedQueries: normalizeSavedQueries(parsed.savedQueries),
      queryHistory: normalizeQueryHistory(parsed.queryHistory),
    }
    storedSettingsSourceHash = fileContentHash(source)
    storedSettingsReadError = ""
    return structuredClone(storedSettingsCache)
  } catch (error) {
    try {
      storedSettingsSourceHash = fileContentHash(readFileSync(DATABASE_SETTINGS_PATH))
    } catch {
      storedSettingsSourceHash = null
    }
    storedSettingsReadError =
      error instanceof Error ? error.message : "A configuração do banco é inválida."
    storedSettingsCache = emptyStoredSettings()
    return structuredClone(storedSettingsCache)
  }
}

export function writeSettings(
  settings: StoredDatabaseSettings,
  options: { recoverCorrupted?: boolean } = {},
) {
  if (storedSettingsReadError && !options.recoverCorrupted) {
    throw new Error(
      "databases.json está corrompido; preserve o arquivo e use a recuperação explícita antes de salvar.",
    )
  }
  const content = `${JSON.stringify(settings, null, 2)}\n`
  storedSettingsSourceHash = atomicWriteFileSync(DATABASE_SETTINGS_PATH, content, {
    expectedHash: storedSettingsSourceHash,
    mode: 0o600,
    backup: true,
  })
  storedSettingsReadError = ""
  storedSettingsCache = structuredClone(settings)
}

export function recoverDatabaseSettings(settings: StoredDatabaseSettings) {
  writeSettings(settings, { recoverCorrupted: true })
}

export function databaseSettingsStorageError() {
  return storedSettingsReadError
}

export function canExecute(command: string) {
  try {
    accessSync(command, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function discoveredMcpProfile(): DatabaseConnectionProfile | null {
  const command = process.env.TUIMINAL_MYSQL_MCP_COMMAND?.trim()
  // MCP is an explicit integration. A private Codex executable on the machine
  // must not silently become the product's default database connection.
  if (!command) return null
  if (!canExecute(command)) return null
  return {
    id: "discovered-mysql-mcp",
    name: "Banco via MCP",
    driver: "mcp-mysql",
    source: "mcp",
    command,
    ssl: false,
    writeEnabled: false,
  }
}

export function discoveredEnvironmentProfile(): DatabaseConnectionProfile | null {
  const connectionUrl =
    process.env.DATABASE_URL?.trim() ||
    process.env.MYSQL_URL?.trim() ||
    process.env.POSTGRES_URL?.trim()
  if (!connectionUrl) return null

  try {
    const url = new URL(connectionUrl)
    const driver: DatabaseDriver = url.protocol.startsWith("mysql")
      ? "mysql"
      : url.protocol.startsWith("postgres")
        ? "postgres"
        : url.protocol.startsWith("sqlite") || url.protocol.startsWith("file")
          ? "sqlite"
          : "postgres"
    if (url.password) sessionPasswords.set("environment-database-url", url.password)
    return definedProperties({
      id: "environment-database-url",
      name: "DATABASE_URL",
      driver,
      source: "environment" as const,
      host: url.hostname || undefined,
      port: url.port ? Number(url.port) : defaultPort(driver),
      database:
        driver === "sqlite" ? undefined : decodeURIComponent(url.pathname.replace(/^\//, "")),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      filename: driver === "sqlite" ? decodeURIComponent(url.pathname) : undefined,
      ssl: url.searchParams.has("ssl") || url.searchParams.has("sslmode"),
      writeEnabled: false,
    })
  } catch {
    return null
  }
}

export function databaseDriverLabel(driver: DatabaseDriver) {
  return DRIVER_LABELS[driver]
}

export function defaultPort(driver: DatabaseDriver) {
  if (driver === "mysql" || driver === "mcp-mysql") return 3306
  if (driver === "postgres") return 5432
  return undefined
}

export function listDatabaseConnections(): DatabaseConnectionProfile[] {
  const saved = readSettings().connections
  const environment = discoveredEnvironmentProfile()
  const mcp = discoveredMcpProfile()
  return [
    ...saved,
    ...(environment && !saved.some((profile) => profile.id === environment.id)
      ? [environment]
      : []),
    ...(mcp && !saved.some((profile) => profile.id === mcp.id) ? [mcp] : []),
  ]
}

export function getDefaultDatabaseConnectionId() {
  const settings = readSettings()
  const connections = listDatabaseConnections()
  return connections.some((profile) => profile.id === settings.defaultConnectionId)
    ? settings.defaultConnectionId
    : (connections[0]?.id ?? null)
}

export function setDefaultDatabaseConnection(connectionId: string) {
  const settings = readSettings()
  settings.defaultConnectionId = connectionId
  writeSettings(settings)
}

export function savedQueryScopeKey(connectionId: string) {
  const profile = listDatabaseConnections().find((connection) => connection.id === connectionId)
  if (!profile) return `${connectionId}::unknown`
  const target =
    profile.driver === "sqlite"
      ? (profile.filename ?? "")
      : profile.driver === "mcp-mysql"
        ? (profile.command ?? "")
        : `${profile.host ?? ""}:${profile.port ?? ""}/${profile.database ?? ""}`
  return `${connectionId}::${profile.driver}::${target}`
}

export function listDatabaseSavedQueries(connectionId: string) {
  const settings = readSettings()
  const scopeKey = savedQueryScopeKey(connectionId)
  return [...(settings.savedQueries[scopeKey] ?? settings.savedQueries[connectionId] ?? [])].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  )
}

export function saveDatabaseQuery(
  connectionId: string,
  query: { id?: string; name: string; sql: string },
) {
  const name = query.name.trim()
  const sql = query.sql.trim()
  if (!connectionId.trim()) throw new Error("Conexão inválida para salvar a query.")
  if (!name) throw new Error("Informe um nome para a query.")
  if (!sql) throw new Error("Escreva uma query antes de salvar.")

  const settings = readSettings()
  const scopeKey = savedQueryScopeKey(connectionId)
  const current = settings.savedQueries[scopeKey] ?? settings.savedQueries[connectionId] ?? []
  const existing = query.id ? current.find((entry) => entry.id === query.id) : undefined
  const now = new Date().toISOString()
  const saved: DatabaseSavedQuery = {
    id: existing?.id ?? `query-${randomUUID()}`,
    name,
    sql,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  settings.savedQueries[scopeKey] = [saved, ...current.filter((entry) => entry.id !== saved.id)]
  if (scopeKey !== connectionId) delete settings.savedQueries[connectionId]
  writeSettings(settings)
  return saved
}

export function removeDatabaseSavedQuery(connectionId: string, queryId: string) {
  const settings = readSettings()
  const scopeKey = savedQueryScopeKey(connectionId)
  const current = settings.savedQueries[scopeKey] ?? settings.savedQueries[connectionId] ?? []
  const next = current.filter((entry) => entry.id !== queryId)
  if (next.length === current.length) return false
  if (next.length) settings.savedQueries[scopeKey] = next
  else delete settings.savedQueries[scopeKey]
  if (scopeKey !== connectionId) delete settings.savedQueries[connectionId]
  writeSettings(settings)
  return true
}

export function listDatabaseQueryHistory(connectionId?: string) {
  const settings = readSettings()
  retainHistoryContent(settings.queryHistory)
  const entries = connectionId
    ? settings.queryHistory.filter(
        (entry) => entry.connectionScope === savedQueryScopeKey(connectionId),
      )
    : settings.queryHistory
  return entries.map(restoreHistoryContent)
}

export function databaseQueryHistoryCanRerun(entry: DatabaseQueryHistoryEntry) {
  if (!entry.rerunnable) return false
  const profile = listDatabaseConnections().find(
    (connection) => connection.id === entry.connectionId,
  )
  return Boolean(profile && savedQueryScopeKey(profile.id) === entry.connectionScope)
}

export type DatabaseQueryHistoryAppendEntry = Omit<
  DatabaseQueryHistoryEntry,
  "id" | "connectionId" | "connectionScope" | "connectionName" | "driver"
> & {
  sessionParameterPreview?: DatabaseQueryHistorySessionParameter[]
}

export function appendDatabaseQueryHistory(
  connectionId: string,
  entry: DatabaseQueryHistoryAppendEntry,
) {
  const profile = listDatabaseConnections().find((connection) => connection.id === connectionId)
  if (!profile || !entry.sql.trim()) return
  const settings = readSettings()
  const { sessionParameterPreview, ...persistedEntry } = entry
  const id = `history-${randomUUID()}`
  const saved: DatabaseQueryHistoryEntry = {
    id,
    connectionId,
    connectionScope: savedQueryScopeKey(connectionId),
    connectionName: profile.name,
    driver: profile.driver,
    ...persistedEntry,
    parameterPreview: normalizeQueryHistoryParameterPreview(persistedEntry.parameterPreview),
  }
  settings.queryHistory = retainSortedDatabaseQueryHistory([
    metadataOnlyHistoryEntry(saved),
    ...settings.queryHistory,
  ])
  writeSettings(settings)
  rememberHistoryContent(saved, sessionParameterPreview)
  retainHistoryContent(settings.queryHistory)
}

export function appendDatabaseQueryHistoryBatch(
  connectionId: string,
  entries: DatabaseQueryHistoryAppendEntry[],
) {
  const profile = listDatabaseConnections().find((connection) => connection.id === connectionId)
  const usableEntries = entries.filter((entry) => entry.sql.trim())
  if (!profile || !usableEntries.length) return
  const settings = readSettings()
  const prepared = usableEntries.map((entry) => {
    const { sessionParameterPreview, ...persistedEntry } = entry
    return {
      saved: {
        id: `history-${randomUUID()}`,
        connectionId,
        connectionScope: savedQueryScopeKey(connectionId),
        connectionName: profile.name,
        driver: profile.driver,
        ...persistedEntry,
        parameterPreview: normalizeQueryHistoryParameterPreview(persistedEntry.parameterPreview),
      },
      sessionParameterPreview,
    }
  })
  const saved = prepared.map((entry) => metadataOnlyHistoryEntry(entry.saved)).reverse()
  settings.queryHistory = retainSortedDatabaseQueryHistory([...saved, ...settings.queryHistory])
  writeSettings(settings)
  for (const entry of prepared) {
    rememberHistoryContent(entry.saved, entry.sessionParameterPreview)
  }
  retainHistoryContent(settings.queryHistory)
}

/** Explicit UI confirmation is required; never rewrite legacy SQL on load. */
export function clearLegacyDatabaseQueryHistoryContent() {
  const settings = readSettings()
  writeSettings({
    ...settings,
    queryHistory: settings.queryHistory.map((entry) =>
      entry.storage === "metadata-only" ? entry : metadataOnlyHistoryEntry(entry),
    ),
  })
  return listDatabaseQueryHistory()
}

export function normalizedDraft(draft: DatabaseConnectionDraft): DatabaseConnectionDraft {
  const name = draft.name.trim()
  if (!name) throw new Error("Informe um nome para a conexão.")

  if (draft.driver === "sqlite") {
    const rawFilename = draft.filename?.trim()
    if (!rawFilename) throw new Error("Informe o caminho do arquivo SQLite.")
    const expanded = rawFilename.startsWith("~/")
      ? join(homedir(), rawFilename.slice(2))
      : rawFilename
    return {
      ...draft,
      name,
      filename: isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded),
      host: undefined,
      port: undefined,
      database: undefined,
      username: undefined,
      command: undefined,
      ssl: false,
    }
  }

  if (draft.driver === "mcp-mysql") {
    const command = draft.command?.trim()
    if (!command) throw new Error("Informe o executável do servidor MCP.")
    const expanded = command.startsWith("~/") ? join(homedir(), command.slice(2)) : command
    if (!canExecute(expanded)) {
      throw new Error(`O MCP não foi encontrado ou não é executável: ${expanded}`)
    }
    return {
      ...draft,
      name,
      command: expanded,
      host: undefined,
      port: undefined,
      database: undefined,
      username: undefined,
      filename: undefined,
      ssl: false,
      writeEnabled: false,
    }
  }

  const host = draft.host?.trim()
  const database = draft.database?.trim()
  const username = draft.username?.trim()
  const port = Math.floor(draft.port ?? defaultPort(draft.driver) ?? 0)
  if (!host) throw new Error("Informe o host do banco.")
  if (!database) throw new Error("Informe o nome do banco.")
  if (!username) throw new Error("Informe o usuário.")
  if (port < 1 || port > 65_535) throw new Error("Informe uma porta válida.")
  return {
    ...draft,
    name,
    host,
    port,
    database,
    username,
    filename: undefined,
    command: undefined,
  }
}

export async function savePassword(connectionId: string, password: string) {
  sessionPasswords.set(connectionId, password)
  const secrets = runtimeBun().secrets
  if (!secrets) throw new Error("O gerenciador de credenciais do Bun não está disponível.")
  await secrets.set({ service: SECRET_SERVICE, name: connectionId, value: password })
}

export async function getPassword(connectionId: string) {
  const sessionPassword = sessionPasswords.get(connectionId)
  if (sessionPassword !== undefined) return sessionPassword
  try {
    const password = await runtimeBun().secrets?.get({
      service: SECRET_SERVICE,
      name: connectionId,
    })
    if (password !== null && password !== undefined) {
      sessionPasswords.set(connectionId, password)
      return password
    }
  } catch {
    // A profile can still connect without a password or ask for it again.
  }
  return ""
}

export function profileFromDraft(
  draft: DatabaseConnectionDraft,
  id = `database-${randomUUID()}`,
): DatabaseConnectionProfile {
  return definedProperties({ ...normalizedDraft(draft), id, source: "saved" as const })
}

export async function testDatabaseConnection(draft: DatabaseConnectionDraft, password: string) {
  const profile = profileFromDraft(draft, `test-${randomUUID()}`)
  if (password) sessionPasswords.set(profile.id, password)
  try {
    if (profile.driver === "mcp-mysql") {
      const client = await createMcpClient(profile)
      await readMcpQuery(client, "SELECT 1 AS connection_ok")
      await client.close()
    } else {
      const client = await createNativeClient(profile)
      await nativeQuery(client, "SELECT 1 AS connection_ok", profile.driver)
      await client.close({ timeout: 1 })
    }
  } finally {
    sessionPasswords.delete(profile.id)
  }
}

export async function testSavedDatabaseConnection(
  connectionId: string,
  draft: DatabaseConnectionDraft,
  password: string,
) {
  const savedPassword = password || (await getPassword(connectionId))
  await testDatabaseConnection(draft, savedPassword)
}

export async function addDatabaseConnection(
  draft: DatabaseConnectionDraft,
  password: string,
  persistPassword: boolean,
): Promise<{ profile: DatabaseConnectionProfile; warning: string | null }> {
  const profile = profileFromDraft(draft)
  await testDatabaseConnection(draft, password)

  const settings = readSettings()
  settings.connections.push(profile)
  settings.defaultConnectionId = profile.id
  writeSettings(settings)
  if (password) sessionPasswords.set(profile.id, password)

  let warning: string | null = null
  if (password && persistPassword) {
    try {
      await savePassword(profile.id, password)
    } catch {
      warning = "Conexão salva; a senha ficará disponível somente nesta sessão."
    }
  }

  return { profile, warning }
}

export async function updateDatabaseConnection(
  connectionId: string,
  draft: DatabaseConnectionDraft,
  password: string,
  persistPassword: boolean,
): Promise<{ profile: DatabaseConnectionProfile; warning: string | null }> {
  const settings = readSettings()
  const profileIndex = settings.connections.findIndex((item) => item.id === connectionId)
  if (profileIndex < 0) throw new Error("Apenas conexões salvas podem ser editadas.")

  const profile = profileFromDraft(draft, connectionId)
  const passwordForTest = password || (await getPassword(connectionId))
  await testDatabaseConnection(draft, passwordForTest)
  await closeConnection(connectionId)

  settings.connections[profileIndex] = profile
  writeSettings(settings)
  if (password) sessionPasswords.set(connectionId, password)

  let warning: string | null = null
  if (password && persistPassword) {
    try {
      await savePassword(connectionId, password)
    } catch {
      warning = "Conexão atualizada; a nova senha ficará disponível somente nesta sessão."
    }
  } else if (password) {
    try {
      await runtimeBun().secrets?.delete({ service: SECRET_SERVICE, name: connectionId })
    } catch {
      warning = "Conexão atualizada, mas a senha antiga pode continuar no keychain."
    }
  }

  return { profile, warning }
}

export async function removeDatabaseConnection(connectionId: string) {
  const profile = readSettings().connections.find((item) => item.id === connectionId)
  if (!profile) return false

  await closeConnection(connectionId)
  const settings = readSettings()
  settings.connections = settings.connections.filter((item) => item.id !== connectionId)
  for (const scopeKey of Object.keys(settings.savedQueries)) {
    if (scopeKey === connectionId || scopeKey.startsWith(`${connectionId}::`)) {
      delete settings.savedQueries[scopeKey]
    }
  }
  settings.queryHistory = settings.queryHistory.filter(
    (entry) => entry.connectionId !== connectionId,
  )
  if (settings.defaultConnectionId === connectionId) {
    settings.defaultConnectionId = settings.connections[0]?.id ?? null
  }
  writeSettings(settings)
  sessionPasswords.delete(connectionId)
  try {
    await runtimeBun().secrets?.delete({ service: SECRET_SERVICE, name: connectionId })
  } catch {
    // Removing the local profile is still useful if the system keychain is unavailable.
  }
  return true
}

export function isTextContent(part: unknown): part is McpTextContent {
  if (!part || typeof part !== "object") return false
  const candidate = part as { type?: unknown; text?: unknown }
  return candidate.type === "text" && typeof candidate.text === "string"
}

export function assertReadOnly(sql: string) {
  const normalized = executableSql(sql)
  if (!/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|PRAGMA)\b/i.test(normalized)) {
    throw new Error("A interface de banco aceita apenas consultas de leitura.")
  }
}

export function executableSql(sql: string) {
  const normalized = sql.trim()
  if (!normalized) throw new Error("Digite um comando SQL antes de executar.")
  if (normalized.length > QUERY_TEXT_LIMIT) {
    throw new Error("A consulta ultrapassa o limite de 100 mil caracteres.")
  }

  let quote: "'" | '"' | "`" | null = null
  let dollarQuote: string | null = null
  let lineComment = false
  let blockComment = false
  let statementEnded = false
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index] ?? ""
    const next = normalized[index + 1] ?? ""

    if (lineComment) {
      if (current === "\n") lineComment = false
      continue
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (dollarQuote) {
      if (normalized.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1
        dollarQuote = null
      }
      continue
    }
    if (quote) {
      if (current === quote) {
        if (next === quote) {
          index += 1
        } else if (normalized[index - 1] !== "\\") {
          quote = null
        }
      }
      continue
    }
    if (current === "-" && next === "-") {
      lineComment = true
      index += 1
      continue
    }
    if (current === "#") {
      lineComment = true
      continue
    }
    if (current === "/" && next === "*") {
      blockComment = true
      index += 1
      continue
    }
    if (current === "'" || current === '"' || current === "`") {
      if (statementEnded) {
        throw new Error("Execute um comando SQL por vez.")
      }
      quote = current
      continue
    }
    if (current === "$") {
      const openingDollarQuote = normalized
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (openingDollarQuote) {
        if (statementEnded) throw new Error("Execute um comando SQL por vez.")
        dollarQuote = openingDollarQuote
        index += openingDollarQuote.length - 1
        continue
      }
    }
    if (current === ";") {
      statementEnded = true
      continue
    }
    if (statementEnded && !/\s/.test(current)) {
      throw new Error("Execute um comando SQL por vez.")
    }
  }
  if (quote || dollarQuote || blockComment) throw new Error("O comando SQL está incompleto.")

  return normalized.replace(/;\s*$/, "")
}

export function sqlWithoutLeadingComments(sql: string) {
  return sql.replace(/^(?:\s|(?:--|#)[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "").trimStart()
}

export function queryCommand(sql: string) {
  return (
    sqlWithoutLeadingComments(sql)
      .match(/^([A-Za-z]+)/)?.[1]
      ?.toLocaleUpperCase() ?? "SQL"
  )
}

export function isReadOnlyEditorQuery(sql: string, driver: DatabaseDriver = "postgres") {
  return isReadOnlySql(sql, driver)
}

export function assertEditorQueryAllowed(profile: DatabaseConnectionProfile, sql: string) {
  if (databaseConnectionCanWrite(profile) || isReadOnlyEditorQuery(sql, profile.driver)) return
  throw new Error(
    "Esta conexão está em somente leitura. Comandos com efeitos, SELECT INTO e rotinas não reconhecidas exigem escrita habilitada.",
  )
}

export function quoteIdentifier(profile: DatabaseConnectionProfile, identifier: string) {
  if (!identifier || /[\0\r\n]/.test(identifier)) {
    throw new Error(`Identificador de banco inválido: ${identifier}`)
  }
  return profile.driver === "mysql" || profile.driver === "mcp-mysql"
    ? `\`${identifier.replaceAll("`", "``")}\``
    : `"${identifier.replaceAll('"', '""')}"`
}

export function qualifiedTable(profile: DatabaseConnectionProfile, table: DatabaseTable) {
  if (profile.driver === "sqlite" || profile.driver === "mcp-mysql") {
    return quoteIdentifier(profile, table.name)
  }
  return `${quoteIdentifier(profile, table.schema)}.${quoteIdentifier(profile, table.name)}`
}

export function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function rowsFromResult(result: unknown): Array<Record<string, unknown>> {
  return Array.isArray(result)
    ? result.filter(
        (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object",
      )
    : []
}

export async function mcpQuery(client: Client, sql: string, signal?: AbortSignal) {
  let result: Awaited<ReturnType<Client["callTool"]>>
  try {
    result = await client.callTool(
      { name: "mysql_query", arguments: { sql } },
      undefined,
      signal ? { signal } : undefined,
    )
  } catch (error) {
    if (signal?.aborted) throw new DatabaseQueryCancelledError()
    throw error
  }
  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .filter(isTextContent)
    .map((part) => part.text)
    .join("\n")
  if (result.isError) throw new Error(text || "A consulta ao banco falhou.")
  const jsonBlock = content.find(isTextContent)
  if (!jsonBlock) return []
  try {
    return rowsFromResult(JSON.parse(jsonBlock.text))
  } catch {
    throw new Error("O MCP retornou uma resposta que não pôde ser interpretada.")
  }
}

export async function readMcpQuery(client: Client, sql: string) {
  assertReadOnly(sql)
  return mcpQuery(client, sql)
}

export async function nativeQuery(
  client: RuntimeSqlClient,
  sql: string,
  driver: DatabaseDriver = "postgres",
) {
  assertReadOnly(sql)
  return rowsFromResult(
    await (driver === "sqlite" ? client.unsafe(sql) : nativeReadOnlyQuery(client, sql, driver)),
  )
}

export async function createMcpClient(profile: DatabaseConnectionProfile) {
  const command = profile.command
  if (!command || !canExecute(command)) {
    throw new Error(`MCP não encontrado em ${command ?? "caminho não informado"}.`)
  }
  const client = new Client({ name: "tuiminal-database-viewer", version: "0.3.0" })
  await client.connect(new StdioClientTransport({ command }))
  const { tools } = await client.listTools()
  if (!tools.some((tool) => tool.name === "mysql_query")) {
    await client.close()
    throw new Error("O MCP conectado não oferece a ferramenta mysql_query.")
  }
  return client
}

export async function createNativeClient(profile: DatabaseConnectionProfile) {
  const BunRuntime = runtimeBun()
  if (profile.driver === "sqlite") {
    if (!profile.filename) throw new Error("Arquivo SQLite não informado.")
    return new BunRuntime.SQL({
      adapter: "sqlite",
      filename: profile.filename,
      readonly: !profile.writeEnabled,
      create: false,
      strict: true,
    })
  }
  if (profile.driver !== "mysql" && profile.driver !== "postgres") {
    throw new Error("Esta conexão precisa de um servidor MCP.")
  }
  return new BunRuntime.SQL({
    adapter: profile.driver,
    hostname: profile.host,
    port: profile.port,
    database: profile.database,
    username: profile.username,
    password: await getPassword(profile.id),
    tls: profile.ssl,
    max: 3,
    idleTimeout: 30,
    connectionTimeout: 8,
  })
}

export function connectionProfile(connectionId: string) {
  const profile = listDatabaseConnections().find((item) => item.id === connectionId)
  if (!profile) throw new Error("A conexão selecionada não existe mais.")
  return profile
}

export async function getMcpClient(profile: DatabaseConnectionProfile) {
  let pending = mcpClients.get(profile.id)
  if (!pending) {
    pending = createMcpClient(profile).catch((error) => {
      mcpClients.delete(profile.id)
      throw error
    })
    mcpClients.set(profile.id, pending)
  }
  return pending
}

export async function getNativeClient(profile: DatabaseConnectionProfile) {
  let pending = nativeClients.get(profile.id)
  if (pending && readOnlyClientIsInvalid(await pending)) {
    if (nativeClients.get(profile.id) === pending) nativeClients.delete(profile.id)
    pending = nativeClients.get(profile.id)
  }
  if (!pending) {
    pending = createNativeClient(profile).catch((error) => {
      nativeClients.delete(profile.id)
      throw error
    })
    nativeClients.set(profile.id, pending)
  }
  return pending
}

export async function forceCloseNativeClient(connectionId: string, client: RuntimeSqlClient) {
  nativeClients.delete(connectionId)
  try {
    await client.close({ timeout: 0 })
  } catch {
    // The query was already cancelled or the connection was already closed.
  }
}

export async function readQuery(connectionId: string, sql: string) {
  const profile = connectionProfile(connectionId)
  return profile.driver === "mcp-mysql"
    ? readMcpQuery(await getMcpClient(profile), sql)
    : nativeQuery(await getNativeClient(profile), sql, profile.driver)
}

export function queryResultColumns(result: unknown, rows: Array<Record<string, unknown>>) {
  if (rows[0]) return Object.keys(rows[0])
  if (!result || typeof result !== "object") return []
  const columns = (result as { columns?: unknown }).columns
  if (!Array.isArray(columns)) return []
  return columns.flatMap((column) => {
    if (typeof column === "string") return [column]
    if (
      column &&
      typeof column === "object" &&
      typeof (column as { name?: unknown }).name === "string"
    ) {
      return [(column as { name: string }).name]
    }
    return []
  })
}

export function affectedRowCount(result: unknown) {
  if (!result || typeof result !== "object") return null
  const metadata = result as {
    affectedRows?: unknown
    changes?: unknown
    count?: unknown
    rowCount?: unknown
  }
  for (const value of [
    metadata.affectedRows,
    metadata.changes,
    metadata.count,
    metadata.rowCount,
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "bigint") return Number(value)
  }
  return null
}

function visibleQueryRows(rows: Array<Record<string, unknown>>, revealSensitive: boolean) {
  return rows
    .slice(0, QUERY_RESULT_LIMIT)
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          column,
          !revealSensitive && isSensitiveColumnName(column) && value !== null
            ? "<mascarado>"
            : ArrayBuffer.isView(value)
              ? `<binário ${value.byteLength} bytes>`
              : typeof value === "string" &&
                  Buffer.byteLength(value) > QUERY_RESULT_CELL_LIMIT_BYTES
                ? `${new TextDecoder().decode(
                    Buffer.from(value).subarray(0, QUERY_RESULT_CELL_LIMIT_BYTES - 32),
                  )}… <célula truncada>`
                : value,
        ]),
      ),
    )
}

function boundedEditorQuery(plan: DatabaseQueryPlan) {
  if (plan.mutating || plan.command !== "SELECT") return plan.sql
  const source = plan.sql.replace(/;\s*$/u, "")
  return `SELECT * FROM (${source}) AS __tuiminal_bounded_result LIMIT ${QUERY_RESULT_FETCH_LIMIT}`
}

async function editorQueryRows(
  profile: DatabaseConnectionProfile,
  plan: DatabaseQueryPlan,
  signal?: AbortSignal,
) {
  const querySql = boundedEditorQuery(plan)
  if (profile.driver === "mcp-mysql") {
    const rows = await mcpQuery(await getMcpClient(profile), querySql, signal)
    return { rawResult: rows, rows }
  }
  if (profile.driver === "sqlite") {
    const rawResult = await executeSqliteProcessQuery(
      { ...profile, writeEnabled: databaseConnectionCanWrite(profile) && plan.mutating },
      querySql,
      signal,
    )
    return { rawResult, rows: rawResult.rows }
  }
  const client = await getNativeClient(profile)
  const query = plan.mutating
    ? client.unsafe(plan.sql)
    : nativeReadOnlyQuery(client, querySql, profile.driver)
  const rawResult = await awaitCancelableDatabaseQuery(query, signal, () =>
    forceCloseNativeClient(profile.id, client),
  )
  return { rawResult, rows: rowsFromResult(rawResult) }
}

export async function executeDatabaseQuery(
  connectionId: string,
  sql: string,
  revealSensitive = false,
  options: DatabaseQueryExecutionOptions = {},
): Promise<DatabaseQueryResult> {
  const startedAt = performance.now()
  let plan: DatabaseQueryPlan | null = null
  try {
    plan = previewDatabaseQuery(connectionId, sql)
    const profile = connectionProfile(connectionId)
    const { rawResult, rows } = await editorQueryRows(profile, plan, options.signal)

    if (plan.mutating) {
      for (const key of schemaCache.keys()) {
        if (key.startsWith(`${connectionId}:`)) schemaCache.delete(key)
      }
    }

    const visibleRows = visibleQueryRows(rows, revealSensitive)
    const result: DatabaseQueryResult = {
      command: plan.command,
      mutating: plan.mutating,
      columns: queryResultColumns(rawResult, rows),
      rows: visibleRows,
      rowCount: visibleRows.length,
      affectedRows: plan.mutating ? affectedRowCount(rawResult) : null,
      durationMs: performance.now() - startedAt,
      truncated: rows.length > QUERY_RESULT_LIMIT,
    }
    try {
      appendDatabaseQueryHistory(connectionId, {
        sql: plan.sql,
        command: result.command,
        status: "success",
        executedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        rowCount: result.mutating ? null : result.rowCount,
        affectedRows: result.affectedRows,
        error: null,
        rerunnable: true,
        parameterPreview: [],
      })
    } catch {
      // A falha ao persistir histórico não deve transformar uma consulta bem-sucedida em erro.
    }
    return result
  } catch (error) {
    try {
      appendDatabaseQueryHistory(connectionId, {
        sql: plan?.sql ?? sql.trim(),
        command: plan?.command ?? "SQL",
        status: "error",
        executedAt: new Date().toISOString(),
        durationMs: performance.now() - startedAt,
        rowCount: null,
        affectedRows: null,
        error: error instanceof Error ? error.message : "Falha desconhecida",
        rerunnable: true,
        parameterPreview: [],
      })
    } catch {
      // Preserva o erro original da consulta se o histórico não puder ser salvo.
    }
    throw error
  }
}

export function previewDatabaseQuery(connectionId: string, sql: string): DatabaseQueryPlan {
  const profile = connectionProfile(connectionId)
  const statement = executableSql(sql)
  assertEditorQueryAllowed(profile, statement)
  const command = queryCommand(statement)
  return {
    sql: statement,
    command,
    mutating: !isReadOnlyEditorQuery(statement, profile.driver),
  }
}

export function databaseConnectionCanWrite(profile: DatabaseConnectionProfile) {
  return profile.source === "saved" && profile.writeEnabled && profile.driver !== "mcp-mysql"
}

export async function writeQuery(connectionId: string, sql: string, parameters: unknown[]) {
  const profile = connectionProfile(connectionId)
  if (!databaseConnectionCanWrite(profile)) {
    throw new Error("A escrita não está habilitada para esta conexão.")
  }
  return (await getNativeClient(profile)).unsafe(sql, parameters)
}

export function parameterMarker(profile: DatabaseConnectionProfile, index: number) {
  return profile.driver === "postgres" ? `$${index + 1}` : "?"
}

export function writableTable(profile: DatabaseConnectionProfile, table: DatabaseTable) {
  if (!databaseConnectionCanWrite(profile)) {
    throw new Error("Habilite leitura e escrita nas configurações da conexão.")
  }
  if (table.type !== "table") throw new Error("Views não podem ser alteradas por esta tela.")
}

export function primaryKeyWhere(
  profile: DatabaseConnectionProfile,
  columns: DatabaseColumn[],
  rowKey: Record<string, unknown>,
  parameterOffset: number,
) {
  const primaryColumns = columns.filter((column) => column.key === "PRI")
  if (!primaryColumns.length) {
    throw new Error("Esta tabela não possui chave primária; a escrita foi bloqueada por segurança.")
  }
  for (const column of primaryColumns) {
    if (!Object.hasOwn(rowKey, column.field)) {
      throw new Error("Não foi possível identificar este registro pela chave primária.")
    }
  }
  return {
    sql: primaryColumns
      .map(
        (column, index) =>
          `${quoteIdentifier(profile, column.field)} = ${parameterMarker(profile, parameterOffset + index)}`,
      )
      .join(" AND "),
    values: primaryColumns.map((column) => rowKey[column.field]),
  }
}

export function buildInsertStatement(
  profile: DatabaseConnectionProfile,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  valuesByColumn: Record<string, unknown>,
): DatabaseMutationPreview {
  const insertedColumns = columns.filter((column) => Object.hasOwn(valuesByColumn, column.field))
  if (!insertedColumns.length) {
    return {
      sql:
        profile.driver === "mysql"
          ? `INSERT INTO ${qualifiedTable(profile, table)} () VALUES ()`
          : `INSERT INTO ${qualifiedTable(profile, table)} DEFAULT VALUES`,
      parameters: [],
    }
  }
  const fields = insertedColumns.map((column) => quoteIdentifier(profile, column.field)).join(", ")
  const markers = insertedColumns
    .map((_column, index) => parameterMarker(profile, index))
    .join(", ")
  return {
    sql: `INSERT INTO ${qualifiedTable(profile, table)} (${fields}) VALUES (${markers})`,
    parameters: insertedColumns.map((column) => valuesByColumn[column.field]),
  }
}

export function buildUpdateStatement(
  profile: DatabaseConnectionProfile,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  rowKey: Record<string, unknown>,
  changes: Record<string, unknown>,
): DatabaseMutationPreview {
  const changedColumns = columns.filter((column) => Object.hasOwn(changes, column.field))
  if (!changedColumns.length) throw new Error("Nenhuma alteração foi informada.")
  const setSql = changedColumns
    .map(
      (column, index) =>
        `${quoteIdentifier(profile, column.field)} = ${parameterMarker(profile, index)}`,
    )
    .join(", ")
  const values = changedColumns.map((column) => changes[column.field])
  const where = primaryKeyWhere(profile, columns, rowKey, values.length)
  return {
    sql: `UPDATE ${qualifiedTable(profile, table)} SET ${setSql} WHERE ${where.sql}`,
    parameters: [...values, ...where.values],
  }
}

export function buildDeleteStatement(
  profile: DatabaseConnectionProfile,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  rowKey: Record<string, unknown>,
): DatabaseMutationPreview {
  const where = primaryKeyWhere(profile, columns, rowKey, 0)
  return {
    sql: `DELETE FROM ${qualifiedTable(profile, table)} WHERE ${where.sql}`,
    parameters: where.values,
  }
}

export function previewTableMutation(
  connectionId: string,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  mutation: DatabaseTableMutation,
): DatabaseMutationPreview {
  const profile = connectionProfile(connectionId)
  writableTable(profile, table)
  if (mutation.kind === "insert") {
    return buildInsertStatement(profile, table, columns, mutation.values)
  }
  if (mutation.kind === "update") {
    return buildUpdateStatement(profile, table, columns, mutation.rowKey, mutation.values)
  }
  return buildDeleteStatement(profile, table, columns, mutation.rowKey)
}

export function tableMutationParameterNames(
  columns: DatabaseColumn[],
  mutation: DatabaseTableMutation,
) {
  const primaryNames = columns
    .filter((column) => column.key === "PRI")
    .map((column) => column.field)
  if (mutation.kind === "insert") {
    return columns
      .filter((column) => Object.hasOwn(mutation.values, column.field))
      .map((column) => column.field)
  }
  if (mutation.kind === "update") {
    return [
      ...columns
        .filter((column) => Object.hasOwn(mutation.values, column.field))
        .map((column) => column.field),
      ...primaryNames,
    ]
  }
  return primaryNames
}

async function inspectTableSchema(
  profile: DatabaseConnectionProfile,
  table: DatabaseTable,
  query: (sql: string) => Promise<Array<Record<string, unknown>>>,
) {
  let rows: Array<Record<string, unknown>>
  if (profile.driver === "mysql" || profile.driver === "mcp-mysql") {
    rows = await query(`DESCRIBE ${qualifiedTable(profile, table)}`)
  } else if (profile.driver === "postgres") {
    rows = await query(
      `SELECT c.column_name AS field, c.data_type AS type, c.is_nullable AS nullable, ` +
        `COALESCE(c.column_default, '') AS default_value, ` +
        `CASE WHEN pk.column_name IS NULL THEN '' ELSE 'PRI' END AS key_name ` +
        `FROM information_schema.columns c LEFT JOIN (` +
        `SELECT kcu.table_schema, kcu.table_name, kcu.column_name ` +
        `FROM information_schema.table_constraints tc ` +
        `JOIN information_schema.key_column_usage kcu ` +
        `ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema ` +
        `WHERE tc.constraint_type = 'PRIMARY KEY') pk ` +
        `ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name ` +
        `AND pk.column_name = c.column_name ` +
        `WHERE c.table_schema = ${sqlLiteral(table.schema)} ` +
        `AND c.table_name = ${sqlLiteral(table.name)} ORDER BY c.ordinal_position`,
    )
  } else {
    rows = await query(`PRAGMA table_info(${quoteIdentifier(profile, table.name)})`)
  }

  return rows.map((row) => {
    if (profile.driver === "mysql" || profile.driver === "mcp-mysql") {
      return {
        field: String(row.Field ?? ""),
        type: String(row.Type ?? ""),
        nullable: row.Null === "YES",
        key: String(row.Key ?? ""),
        defaultValue:
          row.Default === null || row.Default === undefined ? null : String(row.Default),
      }
    }
    if (profile.driver === "postgres") {
      return {
        field: String(row.field ?? ""),
        type: String(row.type ?? ""),
        nullable: row.nullable === "YES",
        key: String(row.key_name ?? ""),
        defaultValue:
          row.default_value === null || row.default_value === undefined || row.default_value === ""
            ? null
            : String(row.default_value),
      }
    }
    const primary = Number(row.pk ?? 0) > 0
    return {
      field: String(row.name ?? ""),
      type: String(row.type ?? ""),
      nullable: !primary && Number(row.notnull ?? 0) === 0,
      key: primary ? "PRI" : "",
      defaultValue:
        row.dflt_value === null || row.dflt_value === undefined ? null : String(row.dflt_value),
    }
  })
}

export async function loadSchema(connectionId: string, table: DatabaseTable) {
  const profile = connectionProfile(connectionId)
  const cacheKey = `${connectionId}:${table.schema}:${table.name}`
  const cached = schemaCache.get(cacheKey)
  if (cached) return cached

  const columns = await inspectTableSchema(profile, table, (sql) => readQuery(connectionId, sql))
  schemaCache.set(cacheKey, columns)
  return columns
}

export function loadDatabaseTableColumns(connectionId: string, table: DatabaseTable) {
  return loadSchema(connectionId, table)
}

export function selectExpression(
  profile: DatabaseConnectionProfile,
  column: DatabaseColumn,
  revealSensitive: boolean,
) {
  const identifier = quoteIdentifier(profile, column.field)
  if (!revealSensitive && isSensitiveColumnName(column.field)) {
    return `CASE WHEN ${identifier} IS NULL THEN NULL ELSE '<mascarado>' END AS ${identifier}`
  }
  if (BINARY_VALUE_PATTERN.test(column.type)) {
    if (profile.driver === "sqlite") {
      return `CASE WHEN ${identifier} IS NULL THEN NULL ELSE '<binário ' || length(${identifier}) || ' bytes>' END AS ${identifier}`
    }
    return `CASE WHEN ${identifier} IS NULL THEN NULL ELSE CONCAT('<binário ', OCTET_LENGTH(${identifier}), ' bytes>') END AS ${identifier}`
  }
  if (LONG_VALUE_PATTERN.test(column.type)) {
    return profile.driver === "mysql" || profile.driver === "mcp-mysql"
      ? `LEFT(CAST(${identifier} AS CHAR), 240) AS ${identifier}`
      : profile.driver === "postgres"
        ? `LEFT(CAST(${identifier} AS TEXT), 240) AS ${identifier}`
        : `substr(CAST(${identifier} AS TEXT), 1, 240) AS ${identifier}`
  }
  return identifier
}

export function tableSearchLiteral(profile: DatabaseConnectionProfile, value: string) {
  const escaped =
    profile.driver === "mysql" || profile.driver === "mcp-mysql"
      ? value.replaceAll("\\", "\\\\")
      : value
  return sqlLiteral(escaped)
}

export function tableSearchTextExpression(profile: DatabaseConnectionProfile, identifier: string) {
  return profile.driver === "mysql" || profile.driver === "mcp-mysql"
    ? `CAST(${identifier} AS CHAR)`
    : `CAST(${identifier} AS TEXT)`
}

export function escapedSearchPattern(profile: DatabaseConnectionProfile, value: string) {
  const escaped = value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_")
  return tableSearchLiteral(profile, `%${escaped}%`)
}

export function buildTablePageQuery(
  profile: DatabaseConnectionProfile,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  offset: number,
  limit: number,
  revealSensitive: boolean,
  query: DatabaseTableQuery,
) {
  const selectList = columns
    .map((column) => selectExpression(profile, column, revealSensitive))
    .join(", ")
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
  const primaryColumns = columns.filter((column) => column.key === "PRI")
  const keyAliases = primaryColumns.map((_column, index) => `__tuiminal_pk_${index}`)
  const keySelectList = primaryColumns.length
    ? `, ${primaryColumns
        .map(
          (column, index) =>
            `${quoteIdentifier(profile, column.field)} AS ${quoteIdentifier(profile, keyAliases[index] ?? "")}`,
        )
        .join(", ")}`
    : ""
  const normalizedSearch = query.search.trim()
  const searchPattern = normalizedSearch ? escapedSearchPattern(profile, normalizedSearch) : ""
  const where =
    normalizedSearch && columns.length
      ? `\nWHERE (${columns
          .map((column) => {
            const identifier = quoteIdentifier(profile, column.field)
            return `LOWER(${tableSearchTextExpression(profile, identifier)}) LIKE LOWER(${searchPattern}) ESCAPE '!'`
          })
          .join("\n  OR ")})`
      : ""
  const selectedSortColumn = query.sort
    ? columns.find((column) => column.field === query.sort?.column)
    : null
  if (query.sort && !selectedSortColumn) {
    throw new Error(`A coluna de ordenação não existe: ${query.sort.column}`)
  }
  if (query.sort && query.sort.direction !== "asc" && query.sort.direction !== "desc") {
    throw new Error(`A direção de ordenação é inválida: ${String(query.sort.direction)}`)
  }
  const orderParts =
    selectedSortColumn && query.sort
      ? [
          `${quoteIdentifier(profile, selectedSortColumn.field)} ${query.sort.direction.toUpperCase()}`,
        ]
      : []
  for (const column of primaryColumns) {
    if (column.field !== selectedSortColumn?.field) {
      orderParts.push(`${quoteIdentifier(profile, column.field)} ASC`)
    }
  }
  const orderBy = orderParts.length ? `\nORDER BY ${orderParts.join(", ")}` : ""
  return {
    keyAliases,
    sql:
      `SELECT ${selectList || "*"}${keySelectList}\n` +
      `FROM ${qualifiedTable(profile, table)}${where}${orderBy}\n` +
      `LIMIT ${safeLimit + 1} OFFSET ${safeOffset}`,
  }
}

export function previewDatabaseTablePageQuery(
  connectionId: string,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  offset: number,
  limit: number,
  revealSensitive: boolean,
  query: DatabaseTableQuery,
) {
  return buildTablePageQuery(
    connectionProfile(connectionId),
    table,
    columns,
    offset,
    limit,
    revealSensitive,
    query,
  ).sql
}

export async function listDatabaseTables(connectionId: string): Promise<DatabaseCatalog> {
  const profile = connectionProfile(connectionId)
  let rows: Array<Record<string, unknown>>
  if (profile.driver === "mysql" || profile.driver === "mcp-mysql") {
    rows = await readQuery(
      connectionId,
      "SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name, " +
        "TABLE_TYPE AS table_type FROM information_schema.TABLES " +
        "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
    )
  } else if (profile.driver === "postgres") {
    rows = await readQuery(
      connectionId,
      "SELECT table_schema AS schema_name, table_name, table_type " +
        "FROM information_schema.tables WHERE table_schema NOT IN " +
        "('pg_catalog', 'information_schema') ORDER BY table_schema, table_name",
    )
  } else {
    rows = await readQuery(
      connectionId,
      "SELECT 'main' AS schema_name, name AS table_name, type AS table_type " +
        "FROM sqlite_master WHERE type IN ('table', 'view') " +
        "AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  }

  return {
    databaseName:
      profile.database ||
      (profile.filename ? profile.filename.split("/").at(-1) : undefined) ||
      String(rows[0]?.schema_name ?? DRIVER_LABELS[profile.driver]),
    tables: rows.map((row) => ({
      schema: String(row.schema_name ?? profile.database ?? "main"),
      name: String(row.table_name ?? ""),
      type: String(row.table_type ?? "table")
        .toLocaleLowerCase()
        .includes("view")
        ? "view"
        : "table",
    })),
  }
}

export async function loadTablePage(
  connectionId: string,
  table: DatabaseTable,
  offset: number,
  limit: number,
  revealSensitive = false,
  query: DatabaseTableQuery = { search: "", sort: null },
  options: DatabaseTablePageOptions = {},
): Promise<TablePage> {
  const profile = connectionProfile(connectionId)
  const columns = await loadSchema(connectionId, table)
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
  const primaryColumns = columns.filter((column) => column.key === "PRI")
  const { keyAliases, sql } = buildTablePageQuery(
    profile,
    table,
    columns,
    offset,
    limit,
    revealSensitive,
    query,
  )
  const startedAt = performance.now()
  let rows: Array<Record<string, unknown>>
  try {
    rows = await readQuery(connectionId, sql)
  } catch (error) {
    if (options.recordHistory) {
      try {
        appendDatabaseQueryHistory(connectionId, {
          sql,
          command: "SELECT",
          status: "error",
          executedAt: new Date().toISOString(),
          durationMs: performance.now() - startedAt,
          rowCount: null,
          affectedRows: null,
          error: error instanceof Error ? error.message : "Falha desconhecida",
          rerunnable: true,
          parameterPreview: [],
        })
      } catch {
        // Preserva o erro original da consulta se o histórico não puder ser salvo.
      }
    }
    throw error
  }
  const visibleRows = rows.slice(0, safeLimit).map((row) => {
    const visibleRow = { ...row }
    for (const alias of keyAliases) delete visibleRow[alias]
    return visibleRow
  })
  const rowKeys = rows
    .slice(0, safeLimit)
    .map((row) =>
      Object.fromEntries(
        primaryColumns.map((column, index) => [column.field, row[keyAliases[index] ?? ""]]),
      ),
    )
  if (options.recordHistory) {
    try {
      appendDatabaseQueryHistory(connectionId, {
        sql,
        command: "SELECT",
        status: "success",
        executedAt: new Date().toISOString(),
        durationMs: performance.now() - startedAt,
        rowCount: visibleRows.length,
        affectedRows: null,
        error: null,
        rerunnable: true,
        parameterPreview: [],
      })
    } catch {
      // A falha ao persistir histórico não deve invalidar os dados carregados.
    }
  }
  return {
    columns,
    rows: visibleRows,
    rowKeys,
    hasMore: rows.length > safeLimit,
  }
}

export async function updateTableRow(
  connectionId: string,
  table: DatabaseTable,
  rowKey: Record<string, unknown>,
  changes: Record<string, unknown>,
  originalRow: Record<string, unknown>,
) {
  const profile = connectionProfile(connectionId)
  writableTable(profile, table)
  const columns = await loadSchema(connectionId, table)
  return applyTableMutations(connectionId, [
    {
      table,
      columns,
      mutation: { kind: "update", rowKey, values: changes },
      originalRow,
    },
  ])
}

export async function insertTableRow(
  connectionId: string,
  table: DatabaseTable,
  valuesByColumn: Record<string, unknown>,
) {
  const profile = connectionProfile(connectionId)
  writableTable(profile, table)
  const columns = await loadSchema(connectionId, table)
  return applyTableMutations(connectionId, [
    { table, columns, mutation: { kind: "insert", values: valuesByColumn }, originalRow: null },
  ])
}

export async function deleteTableRow(
  connectionId: string,
  table: DatabaseTable,
  rowKey: Record<string, unknown>,
  originalRow: Record<string, unknown>,
) {
  const profile = connectionProfile(connectionId)
  writableTable(profile, table)
  const columns = await loadSchema(connectionId, table)
  return applyTableMutations(connectionId, [
    { table, columns, mutation: { kind: "delete", rowKey }, originalRow },
  ])
}

export async function applyTableMutations(
  connectionId: string,
  changes: ReadonlyArray<{
    table: DatabaseTable
    columns: DatabaseColumn[]
    mutation: DatabaseTableMutation
    originalRow: Record<string, unknown> | null
  }>,
): Promise<DatabaseMutationBatchResult> {
  if (!changes.length) throw new Error("Nenhuma alteração foi aprovada.")
  const profile = connectionProfile(connectionId)
  if (!databaseConnectionCanWrite(profile)) {
    throw new Error("A escrita não está habilitada para esta conexão.")
  }
  const statements = changes.map((change) => ({
    ...change,
    ...previewTableMutation(connectionId, change.table, change.columns, change.mutation),
    parameterNames: tableMutationParameterNames(change.columns, change.mutation),
  }))
  const client = await getNativeClient(profile)
  const state = emptyDatabaseMutationExecutionState()
  const runtime = {
    conflict: (message?: string) => new DatabaseMutationConflictError(message),
    rowsFromResult,
    inspectSchema: inspectTableSchema,
    quoteIdentifier,
    parameterMarker,
    primaryKeyWhere,
    qualifiedTable,
    affectedRowCount,
    parameterPreview: databaseQueryHistoryParameterPreview,
    sessionParameterPreview: databaseQueryHistorySessionParameterPreview,
  }
  try {
    await executeDatabaseMutationTransaction({ profile, statements, client, state, runtime })
  } catch (error) {
    const uncertain =
      state.callbackCompleted ||
      (state.sentStatements > 0 && databaseMutationConnectionFailureMayBeUncertain(error))
    const surfacedError = uncertain ? new DatabaseMutationCommitUncertainError(error) : error
    const transactionError =
      surfacedError instanceof Error ? surfacedError.message : "Falha desconhecida"
    try {
      appendDatabaseQueryHistoryBatch(
        connectionId,
        state.executions.map((execution) => ({
          sql: execution.sql,
          command: queryCommand(execution.sql),
          status: "error",
          executedAt: new Date().toISOString(),
          durationMs: execution.durationMs,
          rowCount: null,
          affectedRows: null,
          error: execution.error ?? `Transação revertida: ${transactionError}`,
          rerunnable: false,
          parameterPreview: execution.parameterPreview,
          sessionParameterPreview: execution.sessionParameterPreview,
        })),
      )
    } catch {
      // Preserva o erro original da transação se o histórico não puder ser salvo.
    }
    throw surfacedError
  }
  try {
    appendDatabaseQueryHistoryBatch(
      connectionId,
      state.executions.map((execution) => ({
        sql: execution.sql,
        command: queryCommand(execution.sql),
        status: "success",
        executedAt: new Date().toISOString(),
        durationMs: execution.durationMs,
        rowCount: null,
        affectedRows: execution.affectedRows,
        error: null,
        rerunnable: false,
        parameterPreview: execution.parameterPreview,
        sessionParameterPreview: execution.sessionParameterPreview,
      })),
    )
  } catch {
    // A falha ao persistir histórico não deve invalidar uma transação confirmada.
  }
  return {
    plannedStatements: statements.length,
    sentStatements: state.sentStatements,
    matchedRows: state.matchedRows,
    affectedRows: state.affectedRowsKnown ? state.affectedRows : null,
    confirmedRows: state.confirmedRows,
    noOpStatements: state.noOpStatements,
    transactional: true,
  }
}

export async function loadTableIndexes(
  connectionId: string,
  table: DatabaseTable,
): Promise<DatabaseIndex[]> {
  const profile = connectionProfile(connectionId)
  let rows: Array<Record<string, unknown>>
  if (profile.driver === "mysql" || profile.driver === "mcp-mysql") {
    rows = await readQuery(connectionId, `SHOW INDEX FROM ${qualifiedTable(profile, table)}`)
    const grouped = new Map<string, DatabaseIndex>()
    for (const row of rows) {
      const name = String(row.Key_name ?? "")
      const column = String(row.Column_name ?? "")
      const current = grouped.get(name)
      grouped.set(name, {
        name,
        unique: Number(row.Non_unique ?? 1) === 0,
        definition: current ? `${current.definition}, ${column}` : column,
      })
    }
    return [...grouped.values()]
  }
  if (profile.driver === "postgres") {
    rows = await readQuery(
      connectionId,
      `SELECT indexname AS name, indexdef AS definition FROM pg_indexes ` +
        `WHERE schemaname = ${sqlLiteral(table.schema)} ` +
        `AND tablename = ${sqlLiteral(table.name)} ORDER BY indexname`,
    )
    return rows.map((row) => ({
      name: String(row.name ?? ""),
      unique: String(row.definition ?? "")
        .toLocaleUpperCase()
        .includes(" UNIQUE "),
      definition: String(row.definition ?? ""),
    }))
  }
  rows = await readQuery(
    connectionId,
    `SELECT index_list.name, index_list."unique", index_list.origin, ` +
      `index_info.name AS column_name, index_info.seqno ` +
      `FROM pragma_index_list(${sqlLiteral(table.name)}) AS index_list ` +
      `LEFT JOIN pragma_index_info(index_list.name) AS index_info ` +
      `ORDER BY index_list.seq, index_info.seqno`,
  )
  const grouped = new Map<string, DatabaseIndex>()
  for (const row of rows) {
    const name = rowText(row, "name")
    const column = rowText(row, "column_name")
    const current = grouped.get(name)
    grouped.set(name, {
      name,
      unique: Number(row.unique ?? 0) === 1,
      definition: column
        ? current?.definition
          ? `${current.definition}, ${column}`
          : column
        : current?.definition || rowText(row, "origin") || "index",
    })
  }
  return [...grouped.values()]
}

export function rowText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value !== null && value !== undefined) return String(value)
  }
  return ""
}

export function sqliteCheckDefinitions(ddl: string) {
  const definitions: string[] = []
  const upper = ddl.toLocaleUpperCase()
  let searchAt = 0
  while (searchAt < ddl.length) {
    const checkAt = upper.indexOf("CHECK", searchAt)
    if (checkAt < 0) break
    let cursor = checkAt + 5
    while (/\s/.test(ddl[cursor] ?? "")) cursor += 1
    if (ddl[cursor] !== "(") {
      searchAt = cursor
      continue
    }
    const expressionStart = cursor
    let depth = 0
    let quote: "'" | '"' | "`" | null = null
    for (; cursor < ddl.length; cursor += 1) {
      const current = ddl[cursor] ?? ""
      const next = ddl[cursor + 1] ?? ""
      if (quote) {
        if (current === quote) {
          if (next === quote) cursor += 1
          else quote = null
        }
        continue
      }
      if (current === "'" || current === '"' || current === "`") {
        quote = current
        continue
      }
      if (current === "(") depth += 1
      if (current === ")") {
        depth -= 1
        if (depth === 0) {
          definitions.push(`CHECK ${ddl.slice(expressionStart, cursor + 1)}`)
          cursor += 1
          break
        }
      }
    }
    searchAt = cursor
  }
  return definitions
}

export function groupedRelationships(
  rows: Array<Record<string, unknown>>,
  selectedTable: DatabaseTable,
): DatabaseRelationship[] {
  const grouped = new Map<string, DatabaseRelationship>()
  for (const row of rows) {
    const sourceSchema = rowText(row, "source_schema", "SOURCE_SCHEMA")
    const sourceTable = rowText(row, "source_table", "SOURCE_TABLE")
    const sourceColumn = rowText(row, "source_column", "SOURCE_COLUMN")
    const targetSchema = rowText(row, "target_schema", "TARGET_SCHEMA")
    const targetTable = rowText(row, "target_table", "TARGET_TABLE")
    const targetColumn = rowText(row, "target_column", "TARGET_COLUMN")
    const name =
      rowText(row, "constraint_name", "CONSTRAINT_NAME") || `fk_${sourceTable}_${targetTable}`
    const outgoing = sourceSchema === selectedTable.schema && sourceTable === selectedTable.name
    const direction = outgoing ? "outgoing" : "incoming"
    const key = `${direction}:${sourceSchema}:${sourceTable}:${name}`
    const current = grouped.get(key) ?? {
      name,
      direction,
      columns: [],
      relatedSchema: outgoing ? targetSchema : sourceSchema,
      relatedTable: outgoing ? targetTable : sourceTable,
      relatedColumns: [],
      onUpdate: rowText(row, "update_rule", "UPDATE_RULE") || "NO ACTION",
      onDelete: rowText(row, "delete_rule", "DELETE_RULE") || "NO ACTION",
    }
    current.columns.push(outgoing ? sourceColumn : targetColumn)
    current.relatedColumns.push(outgoing ? targetColumn : sourceColumn)
    grouped.set(key, current)
  }
  return [...grouped.values()]
}

export async function loadSqliteRelationships(connectionId: string, selectedTable: DatabaseTable) {
  const rows = await readQuery(
    connectionId,
    `SELECT source.name AS source_table, foreign_key.id, foreign_key.seq, ` +
      `foreign_key."table" AS target_table, foreign_key."from" AS source_column, ` +
      `foreign_key."to" AS target_column, foreign_key.on_update, foreign_key.on_delete ` +
      `FROM sqlite_master AS source ` +
      `JOIN pragma_foreign_key_list(source.name) AS foreign_key ` +
      `WHERE source.type = 'table' AND (` +
      `source.name = ${sqlLiteral(selectedTable.name)} OR ` +
      `foreign_key."table" = ${sqlLiteral(selectedTable.name)}) ` +
      `ORDER BY source.name, foreign_key.id, foreign_key.seq`,
  )
  const normalizedRows = rows.map((row) => ({
    constraint_name: `fk_${rowText(row, "source_table")}_${rowText(row, "id")}`,
    source_schema: selectedTable.schema,
    source_table: rowText(row, "source_table"),
    source_column: rowText(row, "source_column"),
    target_schema: selectedTable.schema,
    target_table: rowText(row, "target_table"),
    target_column: rowText(row, "target_column"),
    update_rule: rowText(row, "on_update"),
    delete_rule: rowText(row, "on_delete"),
    ordinal_position: Number(row.seq ?? 0),
  }))
  normalizedRows.sort(
    (left, right) => Number(left.ordinal_position ?? 0) - Number(right.ordinal_position ?? 0),
  )
  return groupedRelationships(normalizedRows, selectedTable)
}

export function reconstructedTableDdl(
  profile: DatabaseConnectionProfile,
  table: DatabaseTable,
  columns: DatabaseColumn[],
  constraints: DatabaseConstraint[],
) {
  const lines = columns.map((column) => {
    const parts = [quoteIdentifier(profile, column.field), column.type || "TEXT"]
    if (!column.nullable) parts.push("NOT NULL")
    if (column.defaultValue !== null) parts.push(`DEFAULT ${column.defaultValue}`)
    return `  ${parts.join(" ")}`
  })
  for (const constraint of constraints) {
    lines.push(`  CONSTRAINT ${quoteIdentifier(profile, constraint.name)} ${constraint.definition}`)
  }
  return `CREATE TABLE ${qualifiedTable(profile, table)} (\n${lines.join(",\n")}\n);`
}

export async function loadDatabaseTableStructure(
  connectionId: string,
  table: DatabaseTable,
): Promise<DatabaseTableStructure> {
  const profile = connectionProfile(connectionId)
  let indexes: DatabaseIndex[] = []
  let ddl = ""
  let constraints: DatabaseConstraint[] = []
  let relationships: DatabaseRelationship[] = []

  if (profile.driver === "sqlite") {
    const [loadedIndexes, ddlRows, columns, loadedRelationships] = await Promise.all([
      loadTableIndexes(connectionId, table),
      readQuery(
        connectionId,
        `SELECT sql FROM sqlite_master WHERE name = ${sqlLiteral(table.name)} ` +
          `AND type = ${sqlLiteral(table.type)}`,
      ),
      loadSchema(connectionId, table),
      loadSqliteRelationships(connectionId, table),
    ])
    indexes = loadedIndexes
    ddl = rowText(ddlRows[0] ?? {}, "sql")
    const primaryColumns = columns
      .filter((column) => column.key === "PRI")
      .map((column) => column.field)
    if (primaryColumns.length) {
      constraints.push({
        name: "PRIMARY",
        type: "PRIMARY KEY",
        definition: `PRIMARY KEY (${primaryColumns.join(", ")})`,
      })
    }
    constraints.push(
      ...indexes
        .filter((index) => index.unique)
        .map((index) => ({
          name: index.name,
          type: "UNIQUE",
          definition: `UNIQUE (${index.definition})`,
        })),
    )
    constraints.push(
      ...sqliteCheckDefinitions(ddl).map((definition, index) => ({
        name: `check_${index + 1}`,
        type: "CHECK",
        definition,
      })),
    )
    relationships = loadedRelationships
    constraints.push(
      ...relationships
        .filter((relation) => relation.direction === "outgoing")
        .map((relation) => ({
          name: relation.name,
          type: "FOREIGN KEY",
          definition: `FOREIGN KEY (${relation.columns.join(", ")}) REFERENCES ${relation.relatedSchema}.${relation.relatedTable} (${relation.relatedColumns.join(", ")})`,
        })),
    )
  } else if (profile.driver === "mysql" || profile.driver === "mcp-mysql") {
    const constraintSql =
      `SELECT tc.CONSTRAINT_NAME AS name, tc.CONSTRAINT_TYPE AS type, ` +
      `GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR ', ') AS columns_list ` +
      `FROM information_schema.TABLE_CONSTRAINTS tc ` +
      `LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu ` +
      `ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND kcu.TABLE_NAME = tc.TABLE_NAME ` +
      `AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME ` +
      `WHERE tc.TABLE_SCHEMA = ${sqlLiteral(table.schema)} AND tc.TABLE_NAME = ${sqlLiteral(table.name)} ` +
      `GROUP BY tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME`
    const relationshipSql =
      `SELECT kcu.CONSTRAINT_NAME AS constraint_name, ` +
      `kcu.TABLE_SCHEMA AS source_schema, kcu.TABLE_NAME AS source_table, ` +
      `kcu.COLUMN_NAME AS source_column, kcu.REFERENCED_TABLE_SCHEMA AS target_schema, ` +
      `kcu.REFERENCED_TABLE_NAME AS target_table, kcu.REFERENCED_COLUMN_NAME AS target_column, ` +
      `rc.UPDATE_RULE AS update_rule, rc.DELETE_RULE AS delete_rule, ` +
      `kcu.ORDINAL_POSITION AS ordinal_position ` +
      `FROM information_schema.KEY_COLUMN_USAGE kcu ` +
      `LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc ` +
      `ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME ` +
      `WHERE kcu.REFERENCED_TABLE_NAME IS NOT NULL AND (` +
      `(kcu.TABLE_SCHEMA = ${sqlLiteral(table.schema)} AND kcu.TABLE_NAME = ${sqlLiteral(table.name)}) OR ` +
      `(kcu.REFERENCED_TABLE_SCHEMA = ${sqlLiteral(table.schema)} AND kcu.REFERENCED_TABLE_NAME = ${sqlLiteral(table.name)})) ` +
      `ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`
    const [loadedIndexes, ddlRows, constraintRows, relationshipRows] = await Promise.all([
      loadTableIndexes(connectionId, table),
      readQuery(
        connectionId,
        `${table.type === "view" ? "SHOW CREATE VIEW" : "SHOW CREATE TABLE"} ${qualifiedTable(profile, table)}`,
      ),
      readQuery(connectionId, constraintSql),
      readQuery(connectionId, relationshipSql),
    ])
    indexes = loadedIndexes
    const ddlRow = ddlRows[0] ?? {}
    ddl =
      Object.entries(ddlRow)
        .find(([key]) => /^Create (?:Table|View)$/i.test(key))?.[1]
        ?.toString() ?? ""
    constraints = constraintRows.map((row) => {
      const type = rowText(row, "type", "TYPE")
      const columns = rowText(row, "columns_list", "COLUMNS_LIST")
      return {
        name: rowText(row, "name", "NAME"),
        type,
        definition: columns ? `${type} (${columns})` : type,
      }
    })
    relationships = groupedRelationships(relationshipRows, table)
  } else {
    const constraintSql =
      `SELECT c.conname AS name, CASE c.contype ` +
      `WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY' ` +
      `WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE c.contype::text END AS type, ` +
      `pg_get_constraintdef(c.oid, true) AS definition FROM pg_constraint c ` +
      `WHERE c.conrelid = to_regclass(format('%I.%I', ${sqlLiteral(table.schema)}, ${sqlLiteral(table.name)})) ` +
      `ORDER BY type, name`
    const relationshipSql =
      `SELECT con.conname AS constraint_name, ` +
      `source_ns.nspname AS source_schema, source_table.relname AS source_table, ` +
      `source_column.attname AS source_column, target_ns.nspname AS target_schema, ` +
      `target_table.relname AS target_table, target_column.attname AS target_column, ` +
      `CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' ` +
      `WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ` +
      `ELSE con.confupdtype::text END AS update_rule, ` +
      `CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' ` +
      `WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ` +
      `ELSE con.confdeltype::text END AS delete_rule, source_key.ordinality AS ordinal_position ` +
      `FROM pg_constraint con ` +
      `JOIN pg_class source_table ON source_table.oid = con.conrelid ` +
      `JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace ` +
      `JOIN pg_class target_table ON target_table.oid = con.confrelid ` +
      `JOIN pg_namespace target_ns ON target_ns.oid = target_table.relnamespace ` +
      `JOIN unnest(con.conkey) WITH ORDINALITY AS source_key(attnum, ordinality) ON true ` +
      `JOIN unnest(con.confkey) WITH ORDINALITY AS target_key(attnum, ordinality) ` +
      `ON target_key.ordinality = source_key.ordinality ` +
      `JOIN pg_attribute source_column ON source_column.attrelid = con.conrelid ` +
      `AND source_column.attnum = source_key.attnum ` +
      `JOIN pg_attribute target_column ON target_column.attrelid = con.confrelid ` +
      `AND target_column.attnum = target_key.attnum ` +
      `WHERE con.contype = 'f' AND (` +
      `(source_ns.nspname = ${sqlLiteral(table.schema)} AND source_table.relname = ${sqlLiteral(table.name)}) OR ` +
      `(target_ns.nspname = ${sqlLiteral(table.schema)} AND target_table.relname = ${sqlLiteral(table.name)})) ` +
      `ORDER BY con.conname, source_key.ordinality`
    const [loadedIndexes, constraintRows, relationshipRows, viewRows, tableColumns] =
      await Promise.all([
        loadTableIndexes(connectionId, table),
        readQuery(connectionId, constraintSql),
        readQuery(connectionId, relationshipSql),
        table.type === "view"
          ? readQuery(
              connectionId,
              `SELECT pg_get_viewdef(to_regclass(format('%I.%I', ${sqlLiteral(table.schema)}, ${sqlLiteral(table.name)})), true) AS definition`,
            )
          : Promise.resolve([]),
        table.type === "table" ? loadSchema(connectionId, table) : Promise.resolve([]),
      ])
    indexes = loadedIndexes
    constraints = constraintRows.map((row) => ({
      name: rowText(row, "name"),
      type: rowText(row, "type"),
      definition: rowText(row, "definition"),
    }))
    relationships = groupedRelationships(relationshipRows, table)
    if (table.type === "view") {
      ddl = `CREATE VIEW ${qualifiedTable(profile, table)} AS\n${rowText(viewRows[0] ?? {}, "definition")};`
    } else {
      ddl = reconstructedTableDdl(profile, table, tableColumns, constraints)
    }
  }

  return { ddl, constraints, relationships, indexes }
}

export async function closeConnection(connectionId: string) {
  const pendingNative = nativeClients.get(connectionId)
  nativeClients.delete(connectionId)
  if (pendingNative) {
    try {
      await (await pendingNative).close({ timeout: 1 })
    } catch {
      // The connection is already unavailable.
    }
  }
  const pendingMcp = mcpClients.get(connectionId)
  mcpClients.delete(connectionId)
  if (pendingMcp) {
    try {
      await (await pendingMcp).close()
    } catch {
      // The process is already shutting down.
    }
  }
  for (const key of schemaCache.keys()) {
    if (key.startsWith(`${connectionId}:`)) schemaCache.delete(key)
  }
}

export async function closeDatabaseConnection() {
  const sqliteSessions = [...sqliteQuerySessions.values()].flatMap((sessions) => [...sessions])
  const sqliteProcesses = sqliteSessions.map((session) => session.subprocess)
  for (const session of sqliteSessions) {
    destroySqliteQuerySession(session, new DatabaseQueryCancelledError())
  }
  const connectionIds = new Set([...nativeClients.keys(), ...mcpClients.keys()])
  await Promise.all([
    ...[...connectionIds].map(closeConnection),
    ...sqliteProcesses.map((subprocess) => subprocess.exited),
  ])
  schemaCache.clear()
  clearHistoryContent()
}
