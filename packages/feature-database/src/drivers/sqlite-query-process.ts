import { affectedRowCount, queryResultColumns } from "../model/query-result-metadata"

type SqliteQueryRequest = {
  id: string
  filename: string
  readonly: boolean
  sql: string
}

type SqliteQueryResponse =
  | {
      id: string
      ok: true
      rows: Array<Record<string, unknown>>
      columns: string[]
      affectedRows: number | null
    }
  | {
      id: string
      ok: false
      error: string
    }

type SqliteClient = {
  unsafe: (sql: string) => {
    execute: () => PromiseLike<unknown>
  }
  close: (options?: { timeout?: number }) => Promise<void>
}

let database: SqliteClient | null = null
let databaseKey = ""

function sendResponse(response: SqliteQueryResponse) {
  return new Promise<void>((resolve) => {
    if (!process.send) {
      resolve()
      return
    }
    process.send(response, () => resolve())
  })
}

process.on("message", async (request: SqliteQueryRequest) => {
  try {
    const nextDatabaseKey = `${request.filename}\0${request.readonly ? "ro" : "rw"}`
    if (!database || databaseKey !== nextDatabaseKey) {
      if (database) await database.close({ timeout: 0 })
      database = new Bun.SQL({
        adapter: "sqlite",
        filename: request.filename,
        readonly: request.readonly,
        create: false,
        strict: true,
      })
      databaseKey = nextDatabaseKey
    }
    const result = await database.unsafe(request.sql).execute()
    const rows = Array.isArray(result)
      ? result
          .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
          .map((row) => ({ ...row }))
      : []
    const response: SqliteQueryResponse = {
      id: request.id,
      ok: true,
      rows,
      columns: queryResultColumns(result, rows),
      affectedRows: affectedRowCount(result),
    }
    await sendResponse(response)
  } catch (error) {
    const response: SqliteQueryResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Falha desconhecida ao executar SQLite.",
    }
    await sendResponse(response)
  }
})

process.on("disconnect", () => {
  void database?.close({ timeout: 0 })
})
