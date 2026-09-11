import type {
  DatabaseColumn,
  DatabaseConnectionProfile,
  DatabaseMutationPreview,
  DatabaseQueryHistoryParameter,
  DatabaseQueryHistorySessionParameter,
  DatabaseTable,
  DatabaseTableMutation,
} from "../model/types"

export type ReviewedDatabaseMutation = {
  table: DatabaseTable
  columns: DatabaseColumn[]
  mutation: DatabaseTableMutation
  originalRow: Record<string, unknown> | null
}

export type PreparedDatabaseMutation = ReviewedDatabaseMutation &
  DatabaseMutationPreview & { parameterNames: string[] }

export type DatabaseMutationExecution = {
  sql: string
  durationMs: number
  affectedRows: number | null
  error: string | null
  parameterPreview: DatabaseQueryHistoryParameter[]
  sessionParameterPreview: DatabaseQueryHistorySessionParameter[]
}

export type DatabaseMutationExecutionState = {
  executions: DatabaseMutationExecution[]
  sentStatements: number
  matchedRows: number
  affectedRows: number
  affectedRowsKnown: boolean
  confirmedRows: number
  noOpStatements: number
  callbackCompleted: boolean
}

export type DatabaseMutationRuntime = {
  conflict: (message?: string) => Error
  rowsFromResult: (result: unknown) => Array<Record<string, unknown>>
  inspectSchema: (
    profile: DatabaseConnectionProfile,
    table: DatabaseTable,
    query: (sql: string) => Promise<Array<Record<string, unknown>>>,
  ) => Promise<DatabaseColumn[]>
  quoteIdentifier: (profile: DatabaseConnectionProfile, identifier: string) => string
  parameterMarker: (profile: DatabaseConnectionProfile, index: number) => string
  primaryKeyWhere: (
    profile: DatabaseConnectionProfile,
    columns: DatabaseColumn[],
    rowKey: Record<string, unknown>,
    startIndex: number,
  ) => { sql: string; values: unknown[] }
  qualifiedTable: (profile: DatabaseConnectionProfile, table: DatabaseTable) => string
  affectedRowCount: (result: unknown) => number | null
  parameterPreview: (
    parameters: readonly unknown[],
    names: readonly string[],
  ) => DatabaseQueryHistoryParameter[]
  sessionParameterPreview: (
    parameters: readonly unknown[],
    preview: readonly DatabaseQueryHistoryParameter[],
  ) => DatabaseQueryHistorySessionParameter[]
}
