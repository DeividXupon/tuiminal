import { isReadOnlySql } from "./sql-read-policy"
import type { DatabaseQueryHistoryEntry } from "./types"

const COMMANDS = new Set([
  "SELECT",
  "WITH",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "EXPLAIN",
  "PRAGMA",
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "SET",
  "VACUUM",
  "ANALYZE",
  "ATTACH",
  "DETACH",
  "CALL",
  "DO",
  "SQL",
])

/** SQL, parameter values, and server diagnostics can contain arbitrary secrets.
 * Keep execution metadata on disk, never an allegedly safe executable rewrite.
 * Saved favorites are a separate, explicit persistence action.
 */
export function metadataOnlyHistoryEntry(
  entry: DatabaseQueryHistoryEntry,
): DatabaseQueryHistoryEntry {
  return {
    ...entry,
    storage: "metadata-only",
    readOnly: entry.readOnly ?? isReadOnlySql(entry.sql, entry.driver),
    command: COMMANDS.has(entry.command) ? entry.command : "SQL",
    sql: "",
    error: entry.error ? "Não foi possível executar a consulta." : null,
    parameterPreview: [],
    rerunnable: false,
  }
}

export function historyEntryIsRead(
  entry: Pick<DatabaseQueryHistoryEntry, "sql"> &
    Partial<Pick<DatabaseQueryHistoryEntry, "driver" | "storage" | "readOnly">>,
) {
  return entry.storage === "metadata-only"
    ? entry.readOnly === true
    : isReadOnlySql(entry.sql, entry.driver)
}
