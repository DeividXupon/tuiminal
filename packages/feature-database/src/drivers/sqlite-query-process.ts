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

function resultColumns(result: unknown, rows: Array<Record<string, unknown>>) {
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

function resultAffectedRows(result: unknown) {
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
      columns: resultColumns(result, rows),
      affectedRows: resultAffectedRows(result),
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
