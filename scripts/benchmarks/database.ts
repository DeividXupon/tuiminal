import { Database } from "bun:sqlite"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { databaseMcpBenchmarks, installBenchmarkMcp } from "./database-mcp"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function databaseBenchmarks(root: string): Promise<{
  cases: BenchmarkCase[]
  cleanup: () => Promise<void>
}> {
  const filename = join(root, "benchmark.sqlite")
  const database = new Database(filename, { create: true, strict: true })
  try {
    database.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, note TEXT)")
    database.exec("CREATE INDEX users_name ON users(name)")
    const insert = database.query("INSERT INTO users (id, name, note) VALUES (?, ?, ?)")
    database.transaction(() => {
      for (let index = 1; index <= 2_000; index += 1) {
        insert.run(index, `User ${index}`, `Note ${index}`)
      }
    })()
  } finally {
    database.close()
  }
  const settings = join(root, "config", "tuiminal")
  const mcpCommand = installBenchmarkMcp(root)
  const slowStartedFile = join(root, "mcp-slow-started")
  mkdirSync(settings, { recursive: true })
  writeFileSync(
    join(settings, "databases.json"),
    JSON.stringify({
      version: 1,
      defaultConnectionId: "benchmark",
      connections: [
        {
          id: "benchmark",
          name: "Benchmark",
          driver: "sqlite",
          source: "saved",
          filename,
          ssl: false,
          writeEnabled: true,
        },
        {
          id: "benchmark-mcp",
          name: "Benchmark MCP",
          driver: "mcp-mysql",
          source: "saved",
          database: "benchmark",
          command: mcpCommand,
          ssl: false,
          writeEnabled: false,
        },
      ],
      savedQueries: {},
      queryHistory: [],
    }),
  )
  const service = await import("../../packages/feature-database/src/services/database")
  const { isReadOnlySql } = await import(
    "../../packages/feature-database/src/model/sql-read-policy"
  )
  const { serializeDatabaseBatchRows } = await import(
    "../../packages/feature-database/src/model/batch"
  )
  type DatabaseQueryHistoryEntry =
    import("../../packages/feature-database/src/model/types").DatabaseQueryHistoryEntry
  type DatabaseQueryHistoryAppendEntry =
    import("../../packages/feature-database/src/services/database").DatabaseQueryHistoryAppendEntry
  const table = { schema: "main", name: "users", type: "table" as const }
  const columns = await service.loadDatabaseTableColumns("benchmark", table)
  const resetRow = (sql: string) => {
    const fixture = new Database(filename, { strict: true })
    try {
      fixture.exec(sql)
    } finally {
      fixture.close()
    }
  }
  const previewRows = Array.from({ length: 100 }, (_, index) => ({
    id: String(index),
    data: { id: index, name: `User ${index}`, note: `Note ${index}` },
    rowKey: { id: index },
  }))
  let nextId = 3_000
  let nextBatchId = 10_000
  const now = Date.now()
  const history: DatabaseQueryHistoryEntry[] = Array.from({ length: 10_000 }, (_, index) => ({
    id: `read-${index}`,
    connectionId: "benchmark",
    connectionScope: "sqlite::benchmark",
    connectionName: "Benchmark",
    driver: "sqlite",
    sql: `SELECT ${index}`,
    command: "SELECT",
    status: "success",
    executedAt: new Date(now - index * 1_000).toISOString(),
    durationMs: 1,
    rowCount: 1,
    affectedRows: null,
    error: null,
    rerunnable: true,
    parameterPreview: [],
  }))
  const historyBatch: DatabaseQueryHistoryAppendEntry[] = Array.from(
    { length: 100 },
    (_, index) => ({
      sql: `SELECT ${index}`,
      command: "SELECT",
      status: "success",
      executedAt: new Date(now - index * 1_000).toISOString(),
      durationMs: 1,
      rowCount: 1,
      affectedRows: null,
      error: null,
      rerunnable: true,
      parameterPreview: [],
    }),
  )
  service.appendDatabaseQueryHistoryBatch("benchmark", historyBatch)
  for (let index = 0; index < 20; index += 1) {
    service.saveDatabaseQuery("benchmark", {
      name: `Saved query ${index}`,
      sql: `SELECT ${index}`,
    })
  }
  const editableQuery = service.saveDatabaseQuery("benchmark", {
    name: "Editable query",
    sql: "SELECT 1",
  })
  let queryVersion = 1
  const cases: BenchmarkCase[] = [
    defineBenchmark({
      id: "database.catalog",
      tool: "database",
      description: "SQLite catalog and tables",
      run: () => service.listDatabaseTables("benchmark"),
      verify: (result) => {
        if (!result.tables.some((entry) => entry.name === "users")) throw new Error("Missing table")
      },
    }),
    defineBenchmark({
      id: "database.page",
      tool: "database",
      description: "SQLite first grid page (100 rows)",
      run: () => service.loadTablePage("benchmark", table, 0, 100),
      verify: (result) => {
        if (result.rows.length !== 100) throw new Error("Wrong page size")
      },
    }),
    defineBenchmark({
      id: "database.large_page",
      tool: "database",
      description: "SQLite 1,000-row grid window",
      run: () => service.loadTablePage("benchmark", table, 0, 1_000),
      verify: (result) => {
        if (result.rows.length !== 1_000) throw new Error("Incomplete large grid window")
      },
    }),
    defineBenchmark({
      id: "database.search_sort",
      tool: "database",
      description: "SQLite table search and descending sort",
      run: () =>
        service.loadTablePage("benchmark", table, 0, 100, false, {
          search: "User 1",
          sort: { column: "id", direction: "desc" },
        }),
      verify: (result) => {
        if (!result.rows.length) throw new Error("Search returned no rows")
      },
    }),
    defineBenchmark({
      id: "database.sql_query",
      tool: "database",
      description: "SQLite editor query and result window",
      run: () =>
        service.executeDatabaseQuery("benchmark", "SELECT id, name FROM users ORDER BY id"),
      verify: (result) => {
        if (!result.rows.length) throw new Error("SQL query returned no rows")
      },
    }),
    defineBenchmark({
      id: "database.sql_result_window",
      tool: "database",
      description: "Fetch a later 50-row SQL result window",
      run: () =>
        service.executeDatabaseQuery("benchmark", "SELECT id, name FROM users ORDER BY id", false, {
          resultOffset: 1_000,
          resultLimit: 50,
          recordHistory: false,
        }),
      verify: (result) => {
        if (result.rows.length !== 50 || result.windowOffset !== 1_000) {
          throw new Error("Wrong SQL result window")
        }
      },
    }),
    defineBenchmark({
      id: "database.structure",
      tool: "database",
      description: "SQLite columns, indexes, DDL and relationships",
      run: () => service.loadDatabaseTableStructure("benchmark", table),
      verify: (result) => {
        if (!result.ddl.includes("CREATE TABLE")) throw new Error("Missing DDL")
      },
    }),
    defineBenchmark({
      id: "database.insert",
      tool: "database",
      description: "SQLite reviewed row insert",
      run: () => service.insertTableRow("benchmark", table, { id: nextId++, name: "New" }),
      verify: (result) => {
        if (result.confirmedRows !== 1) throw new Error("Insert was not confirmed")
      },
    }),
    defineBenchmark({
      id: "database.update",
      tool: "database",
      description: "SQLite reviewed row update with conflict check",
      beforeEach: () => resetRow("UPDATE users SET name = 'User 1' WHERE id = 1"),
      run: () =>
        service.updateTableRow(
          "benchmark",
          table,
          { id: 1 },
          { name: "Changed" },
          { id: 1, name: "User 1", note: "Note 1" },
        ),
      verify: (result) => {
        if (result.confirmedRows !== 1) throw new Error("Update was not confirmed")
      },
    }),
    defineBenchmark({
      id: "database.delete",
      tool: "database",
      description: "SQLite reviewed row delete with conflict check",
      beforeEach: () =>
        resetRow("INSERT OR REPLACE INTO users (id, name, note) VALUES (2500, 'Delete', 'Note')"),
      run: () =>
        service.deleteTableRow(
          "benchmark",
          table,
          { id: 2500 },
          { id: 2500, name: "Delete", note: "Note" },
        ),
      verify: (result) => {
        if (result.confirmedRows !== 1) throw new Error("Delete was not confirmed")
      },
    }),
    defineBenchmark({
      id: "database.batch_transaction",
      tool: "database",
      description: "Commit ten approved row inserts in one SQLite transaction",
      run: () =>
        service
          .applyTableMutations(
            "benchmark",
            Array.from({ length: 10 }, (_, index) => ({
              table,
              columns,
              mutation: {
                kind: "insert" as const,
                values: { id: nextBatchId + index, name: `Batch ${nextBatchId + index}` },
              },
              originalRow: null,
            })),
          )
          .finally(() => {
            nextBatchId += 10
          }),
      verify: (result) => {
        if (result.confirmedRows !== 10 || !result.transactional) {
          throw new Error("Database batch transaction failed")
        }
      },
    }),
    defineBenchmark({
      id: "database.history_retention",
      tool: "database",
      description: "Retain recent metadata from 10,000 query history entries",
      run: () => service.retainDatabaseQueryHistory(history, now),
      verify: (result) => {
        if (result.length !== 100) throw new Error("Database history retention failed")
      },
    }),
    defineBenchmark({
      id: "database.history_list",
      tool: "database",
      description: "Load and filter persisted query history",
      run: () => service.listDatabaseQueryHistory("benchmark"),
      verify: (result) => {
        if (result.filter(service.databaseQueryHistoryEntryIsRead).length !== 100) {
          throw new Error("History read retention changed")
        }
      },
    }),
    defineBenchmark({
      id: "database.history_append_batch",
      tool: "database",
      description: "Persist and retain 100 query-history records in one batch",
      run: () => service.appendDatabaseQueryHistoryBatch("benchmark", historyBatch),
      verify: () => {
        const entries = service.listDatabaseQueryHistory("benchmark")
        if (entries.filter(service.databaseQueryHistoryEntryIsRead).length !== 100) {
          throw new Error("History batch was not retained correctly")
        }
      },
    }),
    defineBenchmark({
      id: "database.saved_queries_list",
      tool: "database",
      description: "Load and sort 21 persisted saved queries",
      run: () => service.listDatabaseSavedQueries("benchmark"),
      verify: (result) => {
        if (result.length !== 21) throw new Error("Saved queries were not loaded")
      },
    }),
    defineBenchmark({
      id: "database.saved_query_update",
      tool: "database",
      description: "Update one persisted saved SQL query",
      run: () =>
        service.saveDatabaseQuery("benchmark", {
          id: editableQuery.id,
          name: "Editable query",
          sql: `SELECT ${++queryVersion}`,
        }),
      verify: (result) => {
        if (result.id !== editableQuery.id) throw new Error("Saved query identity changed")
      },
    }),
    defineBenchmark({
      id: "database.export_csv",
      tool: "database",
      description: "Export 100 selected rows to CSV",
      run: () => serializeDatabaseBatchRows(previewRows, ["id", "name", "note"], "csv"),
      verify: (result) => {
        if (!result.includes("User 99")) throw new Error("Incomplete export")
      },
    }),
    defineBenchmark({
      id: "database.read_policy",
      tool: "database",
      description: "Classify 100 SQL statements for read-only safety",
      operationsPerSample: 100,
      run: () => {
        let accepted = 0
        for (let index = 0; index < 100; index += 1) {
          accepted += Number(isReadOnlySql(`SELECT id FROM users WHERE id = ${index}`, "sqlite"))
        }
        return accepted
      },
      verify: (result) => {
        if (result !== 100) throw new Error("Read policy changed")
      },
    }),
  ]
  cases.push(...databaseMcpBenchmarks(service, slowStartedFile))
  return { cases, cleanup: () => service.closeDatabaseConnection() }
}
