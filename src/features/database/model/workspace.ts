import type { DatabaseColumn, DatabaseTableMutation, DatabaseTable } from "./types"
import {
  databaseBatchDeleteMutations,
  databaseBatchRowIdentity,
  databaseBatchUpdateMutations,
  type DatabaseBatchSelectedRow,
  jsonValue,
} from "./batch"
import type { SqlCompletionContext } from "./sql-autocomplete"

export type DatabaseView = "data" | "columns" | "indexes" | "schema"
export type DatabasePane = "catalog" | "grid" | "inspector"

export type DatabaseSqlTab = {
  id: string
  title: string
}

export type DatabaseQueryRerunRequest = {
  id: string
  connectionId: string
  sql: string
}

export type StagedDatabaseChange = {
  id: string
  connectionId: string
  connectionName: string
  table: DatabaseTable
  columns: DatabaseColumn[]
  mutation: DatabaseTableMutation
  originalRow: Record<string, unknown> | null
  approved: boolean
}

export type DatabaseGridRow = {
  id: string
  data: Record<string, unknown>
  rowKey: Record<string, unknown> | null
  change: StagedDatabaseChange | null
}

export type CatalogEntry = {
  name: string
  description: string
  value: string
  table: DatabaseTable | null
}

export type SqlAutocompleteState = SqlCompletionContext & {
  selectedIndex: number
  anchorRow: number
  anchorColumn: number
  forced: boolean
}

export function tableKey(table: DatabaseTable) {
  return `${table.schema}\u0000${table.name}`
}

export function changeTableKey(connectionId: string, table: DatabaseTable) {
  return `${connectionId}\u0000${tableKey(table)}`
}

export function rowKeyFingerprint(rowKey: Record<string, unknown>) {
  return JSON.stringify(
    Object.entries(rowKey)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => [field, typeof value, value]),
    jsonValue,
  )
}

export function valuesMatch(left: unknown, right: unknown) {
  if (left === null || left === undefined) return right === null || right === undefined
  if (right === null || right === undefined) return false
  if (typeof left === "object" || typeof right === "object") {
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return String(left) === String(right)
    }
  }
  return String(left) === String(right)
}

export function batchRow(gridRow: DatabaseGridRow): DatabaseBatchSelectedRow {
  return {
    id: databaseBatchRowIdentity(gridRow.rowKey, gridRow.id),
    data: gridRow.data,
    rowKey: gridRow.rowKey,
  }
}

function batchChangeIndex(
  current: StagedDatabaseChange[],
  connectionId: string,
  table: DatabaseTable,
) {
  const changes: Array<StagedDatabaseChange | null> = [...current]
  const indices = new Map<string, { positions: number[]; head: number }>()
  const scope = changeTableKey(connectionId, table)
  for (const [index, change] of current.entries()) {
    if (
      change.mutation.kind === "insert" ||
      changeTableKey(change.connectionId, change.table) !== scope
    )
      continue
    const fingerprint = rowKeyFingerprint(change.mutation.rowKey)
    const bucket = indices.get(fingerprint) ?? { positions: [], head: 0 }
    bucket.positions.push(index)
    indices.set(fingerprint, bucket)
  }
  const position = (fingerprint: string) => {
    const bucket = indices.get(fingerprint)
    return bucket?.positions[bucket.head]
  }
  return {
    get(fingerprint: string) {
      const index = position(fingerprint)
      return index === undefined ? null : (changes[index] ?? null)
    },
    set(fingerprint: string, change: StagedDatabaseChange) {
      const index = position(fingerprint)
      if (index !== undefined) changes[index] = change
      else {
        indices.set(fingerprint, { positions: [changes.length], head: 0 })
        changes.push(change)
      }
    },
    remove(fingerprint: string) {
      const index = position(fingerprint)
      const bucket = indices.get(fingerprint)
      if (index === undefined || !bucket) return
      changes[index] = null
      bucket.head += 1
    },
    result() {
      return changes.filter((change): change is StagedDatabaseChange => change !== null)
    },
  }
}

export function stageBatchUpdates({
  current,
  rows,
  connectionId,
  connectionName,
  table,
  columns,
  column,
  value,
  nextId,
}: {
  current: StagedDatabaseChange[]
  rows: DatabaseBatchSelectedRow[]
  connectionId: string
  connectionName: string
  table: DatabaseTable
  columns: DatabaseColumn[]
  column: DatabaseColumn
  value: unknown
  nextId: () => string
}) {
  const changes = batchChangeIndex(current, connectionId, table)
  let stagedCount = 0
  for (const { row, mutation } of databaseBatchUpdateMutations(rows, column.field, value)) {
    if (mutation.kind !== "update") continue
    const fingerprint = rowKeyFingerprint(mutation.rowKey)
    const existing = changes.get(fingerprint)
    if (existing?.mutation.kind === "delete") continue
    const originalRow = existing?.originalRow ?? row.data
    const nextValues = {
      ...(existing?.mutation.kind === "update" ? existing.mutation.values : {}),
      [column.field]: value,
    }
    if (valuesMatch(originalRow[column.field], value)) delete nextValues[column.field]
    if (!Object.keys(nextValues).length) {
      changes.remove(fingerprint)
      continue
    }
    const nextChange: StagedDatabaseChange = {
      id: existing?.id ?? nextId(),
      connectionId,
      connectionName,
      table,
      columns,
      mutation: { ...mutation, values: nextValues },
      originalRow,
      approved: false,
    }
    changes.set(fingerprint, nextChange)
    stagedCount += 1
  }
  return { changes: changes.result(), stagedCount }
}

export function stageBatchDeletes({
  current,
  rows,
  connectionId,
  connectionName,
  table,
  columns,
  nextId,
}: {
  current: StagedDatabaseChange[]
  rows: DatabaseBatchSelectedRow[]
  connectionId: string
  connectionName: string
  table: DatabaseTable
  columns: DatabaseColumn[]
  nextId: () => string
}) {
  const changes = batchChangeIndex(current, connectionId, table)
  let stagedCount = 0
  for (const { row, mutation } of databaseBatchDeleteMutations(rows)) {
    if (mutation.kind !== "delete") continue
    const fingerprint = rowKeyFingerprint(mutation.rowKey)
    const existing = changes.get(fingerprint)
    const nextChange: StagedDatabaseChange = {
      id: existing?.id ?? nextId(),
      connectionId,
      connectionName,
      table,
      columns,
      mutation,
      originalRow: existing?.originalRow ?? row.data,
      approved: false,
    }
    changes.set(fingerprint, nextChange)
    stagedCount += 1
  }
  return { changes: changes.result(), stagedCount }
}
