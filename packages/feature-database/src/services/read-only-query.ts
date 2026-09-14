import type { DatabaseDriver } from "../model/types"

export type CancelableDatabaseQuery<T = unknown> = PromiseLike<T> & {
  execute: () => CancelableDatabaseQuery<T>
  cancel: () => CancelableDatabaseQuery<T>
}

export type RuntimeSqlExecutor = {
  unsafe: (
    query: string,
    parameters?: unknown[] | Record<string, unknown>,
  ) => CancelableDatabaseQuery<unknown>
}

type TransactionCallback<T> = (transaction: RuntimeSqlExecutor) => T | Promise<T>
export type RuntimeSqlClient = RuntimeSqlExecutor & {
  begin: {
    <T>(callback: TransactionCallback<T>): Promise<T>
    <T>(options: string, callback: TransactionCallback<T>): Promise<T>
  }
  close: (options?: { timeout?: number }) => Promise<void>
}

const invalidClients = new WeakSet<RuntimeSqlClient>()
export const readOnlyClientIsInvalid = (client: RuntimeSqlClient) => invalidClients.has(client)

async function mysqlSessionReadOnly(transaction: RuntimeSqlExecutor) {
  let rows: unknown
  try {
    rows = await transaction.unsafe("SELECT @@SESSION.transaction_read_only AS read_only")
  } catch (error) {
    // MariaDB versions before transaction_read_only was added use tx_read_only.
    if ((error as { code?: string }).code !== "ER_UNKNOWN_SYSTEM_VARIABLE") throw error
    rows = await transaction.unsafe("SELECT @@SESSION.tx_read_only AS read_only")
  }
  const value = Array.isArray(rows) ? rows[0]?.read_only : undefined
  if (value === 0 || value === "0" || value === false) return false
  if (value === 1 || value === "1" || value === true) return true
  throw new Error("Não foi possível validar a consulta.")
}

async function withMysqlReadOnly<T>(
  client: RuntimeSqlClient,
  transaction: RuntimeSqlExecutor,
  run: () => Promise<T>,
) {
  const wasReadOnly = await mysqlSessionReadOnly(transaction)
  let outcome: { value: T } | { error: unknown }
  try {
    // DDL can implicitly commit READ ONLY. Its next transaction must also be RO.
    await transaction.unsafe("SET SESSION TRANSACTION READ ONLY")
    outcome = { value: await run() }
  } catch (error) {
    outcome = { error }
  }
  try {
    await transaction.unsafe(`SET SESSION TRANSACTION READ ${wasReadOnly ? "ONLY" : "WRITE"}`)
  } catch (error) {
    // Never return a connection with unknown session state to a live pool.
    invalidClients.add(client)
    await client.close({ timeout: 0 })
    if ("error" in outcome) throw new AggregateError([outcome.error, error])
    throw error
  }
  if ("error" in outcome) throw outcome.error
  return outcome.value
}

/** Pin protection and SQL to the same connection, not two arbitrary pool slots. */
export function nativeReadOnlyQuery(
  client: RuntimeSqlClient,
  sql: string,
  driver: DatabaseDriver = "postgres",
) {
  let cancelled = false
  let current: CancelableDatabaseQuery | null = null
  const promise = client.begin("READ ONLY", async (transaction) => {
    if (cancelled) throw new Error("Consulta cancelada.")
    const run = async () => {
      if (cancelled) throw new Error("Consulta cancelada.")
      current = transaction.unsafe(sql)
      return current.execute()
    }
    return driver === "mysql" ? withMysqlReadOnly(client, transaction, run) : run()
  })
  const query: CancelableDatabaseQuery = Object.assign(promise, {
    execute: () => query,
    cancel: () => {
      cancelled = true
      current?.cancel()
      return query
    },
  })
  return query
}
