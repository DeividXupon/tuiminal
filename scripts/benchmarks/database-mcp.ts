import { execFileSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import type { DatabaseConnectionProfile } from "../../packages/feature-database/src/model/types"
import type * as DatabaseService from "../../packages/feature-database/src/services/database"
import { defineBenchmark } from "./harness"

export function installBenchmarkMcp(root: string) {
  const command = join(
    root,
    process.platform === "win32" ? "benchmark-mysql-mcp.exe" : "benchmark-mysql-mcp",
  )
  execFileSync(
    process.execPath,
    [
      "build",
      "--compile",
      "--no-compile-autoload-dotenv",
      "--no-compile-autoload-bunfig",
      join(import.meta.dir, "database-mcp-server.ts"),
      "--outfile",
      command,
    ],
    { cwd: resolve(import.meta.dir, "../.."), stdio: "pipe" },
  )
  return command
}

export function databaseMcpBenchmarks(service: typeof DatabaseService, slowStartedFile: string) {
  const connectionId = "benchmark-mcp"
  const profile: DatabaseConnectionProfile = service.connectionProfile(connectionId)
  const table = { schema: "benchmark", name: "users", type: "table" as const }
  const warm = async () => {
    await service.readQuery(connectionId, "SELECT 1 AS connection_ok")
  }
  let slowQuery: Promise<Record<string, unknown>[]> | undefined
  let cancellation: AbortController | undefined
  return [
    defineBenchmark({
      id: "database.mcp_connection",
      tool: "database",
      description: "Start and close a disposable MCP server after tool discovery and SELECT 1",
      run: () => service.testDatabaseConnection(profile, ""),
      verify: () => undefined,
    }),
    defineBenchmark({
      id: "database.mcp_catalog",
      tool: "database",
      description: "Read a MySQL catalog through the cached MCP server",
      beforeEach: warm,
      run: () => service.listDatabaseTables(connectionId),
      verify: (result) => {
        if (result.tables.length !== 1 || result.tables[0]?.name !== "users") {
          throw new Error("MCP catalog response changed")
        }
      },
    }),
    defineBenchmark({
      id: "database.mcp_page",
      tool: "database",
      description: "Read a 50-row table page through MCP schema and query calls",
      beforeEach: warm,
      run: () => service.loadTablePage(connectionId, table, 0, 50),
      verify: (result) => {
        if (result.rows.length !== 50 || result.rowKeys[0]?.id !== 1) {
          throw new Error("MCP table page response changed")
        }
      },
    }),
    defineBenchmark({
      id: "database.mcp_sql_query",
      tool: "database",
      description: "Execute a bounded read-only SQL editor query through MCP",
      beforeEach: warm,
      run: () =>
        service.executeDatabaseQuery(connectionId, "SELECT id, name FROM users ORDER BY id"),
      verify: (result) => {
        if (!result.rows.length || result.rows[0]?.id !== 1) {
          throw new Error("MCP editor query returned no rows")
        }
      },
    }),
    defineBenchmark({
      id: "database.mcp_sql_window",
      tool: "database",
      description: "Read a later 50-row SQL result window through MCP",
      beforeEach: warm,
      run: () =>
        service.executeDatabaseQuery(
          connectionId,
          "SELECT id, name FROM users ORDER BY id",
          false,
          { resultOffset: 1_000, resultLimit: 50, recordHistory: false },
        ),
      verify: (result) => {
        if (result.rows.length !== 50 || result.windowOffset !== 1_000) {
          throw new Error("MCP SQL result window changed")
        }
      },
    }),
    defineBenchmark({
      id: "database.mcp_cancel",
      tool: "database",
      description: "Cancel an MCP query after the disposable server receives it",
      beforeEach: async () => {
        await warm()
        rmSync(slowStartedFile, { force: true })
        cancellation = new AbortController()
        slowQuery = service.mcpQuery(
          await service.getMcpClient(profile),
          `SELECT id FROM users /* benchmark_slow:${encodeURIComponent(slowStartedFile)} */`,
          cancellation.signal,
        )
        for (let attempt = 0; attempt < 100; attempt += 1) {
          if (existsSync(slowStartedFile)) return
          await Bun.sleep(10)
        }
        cancellation.abort()
        await slowQuery.catch(() => undefined)
        throw new Error("MCP server did not receive the cancellable query")
      },
      run: async () => {
        if (!cancellation || !slowQuery) throw new Error("MCP cancellation was not prepared")
        cancellation.abort()
        try {
          await slowQuery
          return false
        } catch (error) {
          return error instanceof service.DatabaseQueryCancelledError
        }
      },
      verify: (cancelled) => {
        if (!cancelled) throw new Error("MCP query did not cancel")
      },
    }),
  ]
}
