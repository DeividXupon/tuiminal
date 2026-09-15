import type { DatabaseColumn, DatabaseConnectionProfile } from "../model/types"
import type { RuntimeSqlExecutor } from "./read-only-query"
import type { DatabaseMutationRuntime, PreparedDatabaseMutation } from "./database-mutation-types"

type SnapshotResult = {
  exists: boolean
  matches: boolean
  incompleteColumns: number
}

const LONG_VALUE_PATTERN = /(text|json|blob|binary|bytea)/i

function rowValue(row: Record<string, unknown>, field: string) {
  const direct = row[field]
  if (direct !== undefined || Object.hasOwn(row, field)) return direct
  const match = Object.keys(row).find(
    (key) => key.toLocaleLowerCase() === field.toLocaleLowerCase(),
  )
  return match ? row[match] : undefined
}

async function transactionRows(
  transaction: RuntimeSqlExecutor,
  runtime: DatabaseMutationRuntime,
  sql: string,
  parameters: unknown[] = [],
) {
  return runtime.rowsFromResult(await transaction.unsafe(sql, parameters))
}

export async function assertTransactionalWriteTarget(
  profile: DatabaseConnectionProfile,
  statement: PreparedDatabaseMutation,
  transaction: RuntimeSqlExecutor,
  runtime: DatabaseMutationRuntime,
) {
  const { table } = statement
  if (profile.driver === "mysql") {
    const rows = await transactionRows(
      transaction,
      runtime,
      `SELECT t.TABLE_TYPE AS table_type, t.ENGINE AS engine, e.TRANSACTIONS AS transactions ` +
        `FROM information_schema.TABLES t LEFT JOIN information_schema.ENGINES e ` +
        `ON e.ENGINE = t.ENGINE WHERE t.TABLE_SCHEMA = ? AND t.TABLE_NAME = ?`,
      [table.schema || profile.database, table.name],
    )
    const row = rows[0]
    if (!row || String(rowValue(row, "table_type") ?? "").toLocaleUpperCase() !== "BASE TABLE") {
      throw runtime.conflict("A tabela revisada não existe mais ou mudou de tipo.")
    }
    if (String(rowValue(row, "transactions") ?? "").toLocaleUpperCase() !== "YES") {
      const engine = String(rowValue(row, "engine") ?? "desconhecido")
      throw new Error(
        `A escrita foi bloqueada porque o mecanismo ${engine} não garante rollback transacional.`,
      )
    }
    return
  }
  if (profile.driver === "postgres") {
    const rows = await transactionRows(
      transaction,
      runtime,
      `SELECT c.relkind FROM pg_catalog.pg_class c ` +
        `JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace ` +
        `WHERE n.nspname = $1 AND c.relname = $2`,
      [table.schema, table.name],
    )
    const kind = String(rowValue(rows[0] ?? {}, "relkind") ?? "")
    if (kind !== "r" && kind !== "p") {
      throw runtime.conflict("A tabela revisada não existe mais ou mudou de tipo.")
    }
    return
  }
  const rows = await transactionRows(
    transaction,
    runtime,
    `SELECT type FROM ${runtime.quoteIdentifier(profile, table.schema || "main")}.sqlite_master ` +
      `WHERE name = ?`,
    [table.name],
  )
  if (String(rowValue(rows[0] ?? {}, "type") ?? "").toLocaleLowerCase() !== "table") {
    throw runtime.conflict("A tabela revisada não existe mais ou mudou de tipo.")
  }
}

function schemaFingerprint(columns: DatabaseColumn[]) {
  return JSON.stringify(
    columns.map((column) => ({
      field: column.field,
      type: column.type.toLocaleLowerCase(),
      nullable: column.nullable,
      key: column.key,
      defaultValue: column.defaultValue,
    })),
  )
}

export async function assertReviewedSchema(
  profile: DatabaseConnectionProfile,
  statement: PreparedDatabaseMutation,
  transaction: RuntimeSqlExecutor,
  runtime: DatabaseMutationRuntime,
) {
  const current = await runtime.inspectSchema(profile, statement.table, (sql) =>
    transactionRows(transaction, runtime, sql),
  )
  if (!current.length || schemaFingerprint(current) !== schemaFingerprint(statement.columns)) {
    throw runtime.conflict("O schema da tabela mudou desde a revisão. Recarregue antes de gravar.")
  }
}

function snapshotValueIsComplete(column: DatabaseColumn, value: unknown) {
  if (value === null || value === undefined || ArrayBuffer.isView(value)) return true
  if (typeof value !== "string") return true
  if (value === "<mascarado>" || /^<binário \d+ bytes>$/u.test(value)) return false
  if (value.endsWith("… <célula truncada>")) return false
  return !LONG_VALUE_PATTERN.test(column.type) || Buffer.byteLength(value) < 240
}

function comparisonSql(profile: DatabaseConnectionProfile, identifier: string, marker: string) {
  if (profile.driver === "mysql") return `${identifier} <=> ${marker}`
  if (profile.driver === "postgres") return `${identifier} IS NOT DISTINCT FROM ${marker}`
  return `${identifier} IS ${marker}`
}

async function rowSnapshotMatches(
  profile: DatabaseConnectionProfile,
  statement: PreparedDatabaseMutation,
  rowKey: Record<string, unknown>,
  expectedValues: Record<string, unknown>,
  transaction: RuntimeSqlExecutor,
  runtime: DatabaseMutationRuntime,
  lock: boolean,
): Promise<SnapshotResult> {
  const compared = statement.columns.filter((column) => Object.hasOwn(expectedValues, column.field))
  const complete = compared.filter((column) =>
    snapshotValueIsComplete(column, expectedValues[column.field]),
  )
  const values = complete.map((column) => expectedValues[column.field])
  const comparisons = complete.map((column, index) =>
    comparisonSql(
      profile,
      runtime.quoteIdentifier(profile, column.field),
      runtime.parameterMarker(profile, index),
    ),
  )
  const where = runtime.primaryKeyWhere(profile, statement.columns, rowKey, values.length)
  const matchExpression = comparisons.length ? comparisons.join(" AND ") : "1 = 1"
  const lockSql = lock && profile.driver !== "sqlite" ? " FOR UPDATE" : ""
  const rows = await transactionRows(
    transaction,
    runtime,
    `SELECT CASE WHEN ${matchExpression} THEN 1 ELSE 0 END AS __tuiminal_snapshot_match ` +
      `FROM ${runtime.qualifiedTable(profile, statement.table)} WHERE ${where.sql}${lockSql}`,
    [...values, ...where.values],
  )
  return {
    exists: rows.length === 1,
    matches: Number(rowValue(rows[0] ?? {}, "__tuiminal_snapshot_match")) === 1,
    incompleteColumns: compared.length - complete.length,
  }
}

function databaseValuesMatch(left: unknown, right: unknown) {
  if (left === right) return true
  if (left === null || left === undefined || right === null || right === undefined) return false
  if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
    return Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(
      Buffer.from(right.buffer, right.byteOffset, right.byteLength),
    )
  }
  if (left instanceof Date || right instanceof Date) return String(left) === String(right)
  if (typeof left !== "object" && typeof right !== "object") return String(left) === String(right)
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return String(left) === String(right)
  }
}

export async function validateOriginalSnapshot(
  profile: DatabaseConnectionProfile,
  statement: PreparedDatabaseMutation,
  transaction: RuntimeSqlExecutor,
  runtime: DatabaseMutationRuntime,
) {
  if (statement.mutation.kind === "insert") return false
  if (!statement.originalRow) {
    throw runtime.conflict(
      "A revisão não possui o snapshot original desta linha. Recarregue antes de gravar.",
    )
  }
  const expected =
    statement.mutation.kind === "update"
      ? Object.fromEntries(
          Object.keys(statement.mutation.values).map((field) => [
            field,
            statement.originalRow?.[field],
          ]),
        )
      : statement.originalRow
  const snapshot = await rowSnapshotMatches(
    profile,
    statement,
    statement.mutation.rowKey,
    expected,
    transaction,
    runtime,
    true,
  )
  if (!snapshot.exists || !snapshot.matches) throw runtime.conflict()
  if (statement.mutation.kind === "update" && snapshot.incompleteColumns) {
    throw runtime.conflict(
      "O valor original editado não estava integralmente visível. Recarregue antes de gravar.",
    )
  }
  return (
    statement.mutation.kind === "update" &&
    Object.entries(statement.mutation.values).every(([field, value]) =>
      databaseValuesMatch(statement.originalRow?.[field], value),
    )
  )
}

function updatedRowKey(statement: PreparedDatabaseMutation) {
  if (statement.mutation.kind !== "update") return {}
  const next = { ...statement.mutation.rowKey }
  for (const column of statement.columns.filter((column) => column.key === "PRI")) {
    if (Object.hasOwn(statement.mutation.values, column.field)) {
      next[column.field] = statement.mutation.values[column.field]
    }
  }
  return next
}

export async function confirmMutation(
  profile: DatabaseConnectionProfile,
  statement: PreparedDatabaseMutation,
  affected: number | null,
  transaction: RuntimeSqlExecutor,
  runtime: DatabaseMutationRuntime,
) {
  if (statement.mutation.kind === "insert") {
    if (affected !== 1) {
      throw runtime.conflict(
        "O banco não confirmou exatamente uma linha inserida; a transação foi interrompida.",
      )
    }
    return false
  }
  if (statement.mutation.kind === "delete") {
    const after = await rowSnapshotMatches(
      profile,
      statement,
      statement.mutation.rowKey,
      {},
      transaction,
      runtime,
      false,
    )
    if (after.exists || affected !== 1) {
      throw runtime.conflict(
        "O banco não confirmou a exclusão da linha; a transação foi interrompida.",
      )
    }
    return false
  }
  const after = await rowSnapshotMatches(
    profile,
    statement,
    updatedRowKey(statement),
    statement.mutation.values,
    transaction,
    runtime,
    false,
  )
  if (!after.exists || !after.matches || after.incompleteColumns) {
    throw runtime.conflict(
      "O banco não confirmou os valores editados; a transação foi interrompida.",
    )
  }
  if (affected !== 0 && affected !== 1) {
    throw runtime.conflict(
      "O banco reportou uma contagem inesperada de linhas; a transação foi interrompida.",
    )
  }
  return affected === 0
}
