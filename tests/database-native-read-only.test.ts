import { describe, expect, test } from "bun:test"
import {
  type CancelableDatabaseQuery,
  nativeReadOnlyQuery,
  readOnlyClientIsInvalid,
  type RuntimeSqlClient,
  type RuntimeSqlExecutor,
} from "../packages/feature-database/src/services/read-only-query"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function fixture(
  options: {
    beforeBegin?: Promise<void>
    readOnly?: unknown
    data?: Promise<unknown>
    failSet?: boolean
    failReset?: boolean
    oldMariaDb?: boolean
  } = {},
) {
  const calls: string[] = []
  let cancels = 0
  let sets = 0
  const client: RuntimeSqlClient = {
    async begin<T>(
      mode: string | ((tx: RuntimeSqlExecutor) => T | Promise<T>),
      callback?: (tx: RuntimeSqlExecutor) => T | Promise<T>,
    ): Promise<T> {
      calls.push(`BEGIN ${typeof mode === "string" ? mode : ""}`)
      await options.beforeBegin
      const run = typeof mode === "function" ? mode : callback
      if (!run) throw new Error("Missing transaction callback")
      return run(client)
    },
    unsafe(sql) {
      calls.push(sql)
      const promise = Promise.resolve().then(() => {
        if (sql.includes("@@SESSION.transaction_read_only") && options.oldMariaDb) {
          throw Object.assign(new Error("Unknown variable"), { code: "ER_UNKNOWN_SYSTEM_VARIABLE" })
        }
        if (sql.includes("@@SESSION.")) return [{ read_only: options.readOnly ?? 0 }]
        if (sql.startsWith("SET SESSION")) {
          sets += 1
          if ((sets === 1 && options.failSet) || (sets === 2 && options.failReset)) {
            throw new Error("session setting failed")
          }
          return []
        }
        return options.data ?? [{ answer: 42 }]
      })
      const query: CancelableDatabaseQuery = Object.assign(promise, {
        execute: () => query,
        cancel: () => {
          cancels += 1
          return query
        },
      })
      return query
    },
    async close() {
      calls.push("CLOSE")
    },
  }
  return { client, calls, cancels: () => cancels }
}

describe("native read-only execution", () => {
  test("cancellation before acquiring the transaction sends no SQL", async () => {
    const acquired = deferred<void>()
    const { client, calls } = fixture({ beforeBegin: acquired.promise })
    const query = nativeReadOnlyQuery(client, "SELECT 42", "mysql")
    query.cancel()
    acquired.resolve()
    await expect(Promise.resolve(query)).rejects.toThrow("cancelada")
    expect(calls).toEqual(["BEGIN READ ONLY"])
  })

  test("pins MySQL session defaults, then restores them before pool release", async () => {
    const { client, calls } = fixture()
    expect(await nativeReadOnlyQuery(client, "SELECT 42", "mysql")).toEqual([{ answer: 42 }])
    expect(calls).toEqual([
      "BEGIN READ ONLY",
      "SELECT @@SESSION.transaction_read_only AS read_only",
      "SET SESSION TRANSACTION READ ONLY",
      "SELECT 42",
      "SET SESSION TRANSACTION READ WRITE",
    ])
  })

  test("restores a preexisting read-only default without granting writes", async () => {
    const { client, calls } = fixture({ readOnly: 1 })
    await nativeReadOnlyQuery(client, "SELECT 42", "mysql")
    expect(calls.at(-1)).toBe("SET SESSION TRANSACTION READ ONLY")
    expect(calls).not.toContain("SET SESSION TRANSACTION READ WRITE")
  })

  test("supports older MariaDB session variable names", async () => {
    const { client, calls } = fixture({ oldMariaDb: true })
    await nativeReadOnlyQuery(client, "SELECT 42", "mysql")
    expect(calls).toContain("SELECT @@SESSION.tx_read_only AS read_only")
  })

  test("refuses unknown protection state and never dispatches the query", async () => {
    const { client, calls } = fixture({ readOnly: "unexpected" })
    await expect(
      Promise.resolve(nativeReadOnlyQuery(client, "SELECT 42", "mysql")),
    ).rejects.toThrow()
    expect(calls).not.toContain("SELECT 42")
  })

  test("failure to install session protection prevents SQL and restores defaults", async () => {
    const { client, calls } = fixture({ failSet: true })
    await expect(
      Promise.resolve(nativeReadOnlyQuery(client, "SELECT 42", "mysql")),
    ).rejects.toThrow()
    expect(calls).not.toContain("SELECT 42")
    expect(calls.at(-1)).toBe("SET SESSION TRANSACTION READ WRITE")
  })

  test("invalidates and closes a pool if restoring defaults fails", async () => {
    const { client, calls } = fixture({ failReset: true })
    await expect(
      Promise.resolve(nativeReadOnlyQuery(client, "SELECT 42", "mysql")),
    ).rejects.toThrow()
    expect(calls.at(-1)).toBe("CLOSE")
    expect(readOnlyClientIsInvalid(client)).toBe(true)
  })

  test("cancel forwards to the native handle and failure still restores MySQL defaults", async () => {
    const data = deferred<unknown>()
    const { client, calls, cancels } = fixture({ data: data.promise })
    const query = nativeReadOnlyQuery(client, "SELECT 42", "mysql")
    const failure = Promise.resolve(query).catch((error: Error) => error)
    for (let tick = 0; tick < 20 && !calls.includes("SELECT 42"); tick += 1) await Promise.resolve()
    expect(calls).toContain("SELECT 42")
    query.cancel()
    expect(cancels()).toBe(1)
    data.reject(new Error("cancelled by driver"))
    expect(await failure).toEqual(new Error("cancelled by driver"))
    expect(calls.at(-1)).toBe("SET SESSION TRANSACTION READ WRITE")
  })

  test("PostgreSQL uses only its pinned transaction, without MySQL settings", async () => {
    const { client, calls } = fixture()
    await nativeReadOnlyQuery(client, "SELECT 42", "postgres")
    expect(calls).toEqual(["BEGIN READ ONLY", "SELECT 42"])
  })
})
