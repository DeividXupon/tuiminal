export type DatabaseDriver = "mysql" | "postgres" | "sqlite" | "mcp-mysql"
export type DatabaseConnectionSource = "saved" | "environment" | "mcp"

export type DatabaseConnectionProfile = {
  id: string
  name: string
  driver: DatabaseDriver
  source: DatabaseConnectionSource
  host?: string
  port?: number
  database?: string
  username?: string
  filename?: string
  command?: string
  ssl: boolean
  writeEnabled: boolean
}

// Forms explicitly clear driver-specific fields when switching connection type.
export type DatabaseConnectionDraft = Pick<
  DatabaseConnectionProfile,
  "name" | "driver" | "ssl" | "writeEnabled"
> & {
  [K in "host" | "port" | "database" | "username" | "filename" | "command"]?:
    | DatabaseConnectionProfile[K]
    | undefined
}

export type DatabaseTable = {
  schema: string
  name: string
  type: "table" | "view"
}

export type DatabaseColumn = {
  field: string
  type: string
  nullable: boolean
  key: string
  defaultValue: string | null
}

export type DatabaseIndex = {
  name: string
  unique: boolean
  definition: string
}

export type DatabaseConstraint = {
  name: string
  type: string
  definition: string
}

export type DatabaseRelationship = {
  name: string
  direction: "outgoing" | "incoming"
  columns: string[]
  relatedSchema: string
  relatedTable: string
  relatedColumns: string[]
  onUpdate: string
  onDelete: string
}

export type DatabaseTableStructure = {
  ddl: string
  constraints: DatabaseConstraint[]
  relationships: DatabaseRelationship[]
  indexes: DatabaseIndex[]
}

export type DatabaseCatalog = {
  databaseName: string
  tables: DatabaseTable[]
}

export type TablePage = {
  columns: DatabaseColumn[]
  rows: Array<Record<string, unknown>>
  rowKeys: Array<Record<string, unknown>>
  hasMore: boolean
}

export type DatabaseTableSort = {
  column: string
  direction: "asc" | "desc"
}

export type DatabaseTableQuery = {
  search: string
  sort: DatabaseTableSort | null
}

export type DatabaseTableMutation =
  | { kind: "insert"; values: Record<string, unknown> }
  | { kind: "update"; rowKey: Record<string, unknown>; values: Record<string, unknown> }
  | { kind: "delete"; rowKey: Record<string, unknown> }

export type DatabaseMutationPreview = {
  sql: string
  parameters: unknown[]
}

export type DatabaseQueryResult = {
  command: string
  mutating: boolean
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  affectedRows: number | null
  durationMs: number
  truncated: boolean
}

export type DatabaseQueryPlan = {
  sql: string
  command: string
  mutating: boolean
}

export type DatabaseQueryExecutionOptions = {
  signal?: AbortSignal
}

export type DatabaseSavedQuery = {
  id: string
  name: string
  sql: string
  createdAt: string
  updatedAt: string
}

export type DatabaseQueryHistoryParameter = {
  position: number
  name: string
  value: string
  masked: boolean
  revealedValue?: string
}

export type DatabaseQueryHistorySessionParameter = {
  position: number
  value: string
}

export type DatabaseQueryHistoryEntry = {
  id: string
  connectionId: string
  connectionScope: string
  connectionName: string
  driver: DatabaseDriver
  sql: string
  command: string
  status: "success" | "error"
  executedAt: string
  durationMs: number
  rowCount: number | null
  affectedRows: number | null
  error: string | null
  rerunnable: boolean
  parameterPreview: DatabaseQueryHistoryParameter[]
}

export type DatabaseTablePageOptions = {
  recordHistory?: boolean
}
