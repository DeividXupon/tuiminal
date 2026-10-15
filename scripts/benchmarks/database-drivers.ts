import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import type {
  DatabaseConnectionDraft,
  DatabaseTable,
} from "../../packages/feature-database/src/model/types"
import { type BenchmarkCase, defineBenchmark } from "./harness"

type DatabaseService = typeof import("../../packages/feature-database/src/services/database")
type DriverFixture = {
  id: string
  draft: DatabaseConnectionDraft
  table: DatabaseTable
}

const containers = [
  {
    id: "mysql",
    image: "mysql:8.4",
    port: 3306,
    environment: ["MYSQL_ALLOW_EMPTY_PASSWORD=yes", "MYSQL_DATABASE=tuiminal_benchmark"],
    extra: ["--skip-log-bin"],
    driver: "mysql" as const,
    username: "root",
  },
  {
    id: "mariadb",
    image: "mariadb:11.8",
    port: 3306,
    environment: ["MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1", "MARIADB_DATABASE=tuiminal_benchmark"],
    extra: ["--skip-log-bin"],
    driver: "mysql" as const,
    username: "root",
  },
  {
    id: "postgres",
    image: "postgres:17-alpine",
    port: 5432,
    environment: ["POSTGRES_HOST_AUTH_METHOD=trust", "POSTGRES_DB=tuiminal_benchmark"],
    extra: [],
    driver: "postgres" as const,
    username: "postgres",
  },
] as const

function docker(args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      args,
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: 1_000_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`docker ${args[0] ?? ""} failed: ${stderr.trim() || error.message}`))
          return
        }
        resolve(stdout.trim())
      },
    )
  })
}

function mappedPort(value: string) {
  const port = Number(value.match(/:(\d+)$/)?.[1])
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Docker returned an invalid mapped port: ${value}`)
  }
  return port
}

async function waitForConnection(service: DatabaseService, draft: DatabaseConnectionDraft) {
  let lastError: unknown
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await service.testDatabaseConnection(draft, "")
      return
    } catch (error) {
      lastError = error
      await Bun.sleep(500)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Database container did not become ready")
}

async function seedDatabase(service: DatabaseService, fixture: DriverFixture) {
  const id = fixture.id
  await service.executeDatabaseQuery(
    id,
    "CREATE TABLE benchmark_rows (id INTEGER PRIMARY KEY, name VARCHAR(120) NOT NULL, note VARCHAR(120))",
    true,
  )
  for (let first = 1; first <= 2_000; first += 100) {
    const rows = Array.from(
      { length: 100 },
      (_, offset) => `(${first + offset}, 'User ${first + offset}', 'Note ${first + offset}')`,
    )
    await service.executeDatabaseQuery(
      id,
      `INSERT INTO benchmark_rows (id, name, note) VALUES ${rows.join(", ")}`,
      true,
    )
  }
}

async function driverCases(
  service: DatabaseService,
  fixture: DriverFixture,
): Promise<BenchmarkCase[]> {
  const { id, draft, table } = fixture
  const prefix = `database.${draft.name.toLowerCase()}`
  const columns = await service.loadDatabaseTableColumns(id, table)
  let nextId = 3_000
  let nextBatchId = 10_000
  return [
    defineBenchmark({
      id: `${prefix}.connection`,
      tool: "database",
      description: `Open, test and close a ${draft.name} connection`,
      run: async () => {
        await service.testDatabaseConnection(draft, "")
        return true
      },
      verify: (result) => {
        if (!result) throw new Error(`${draft.name} connection failed`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.catalog`,
      tool: "database",
      description: `List ${draft.name} schemas and tables`,
      run: () => service.listDatabaseTables(id),
      verify: (result) => {
        if (!result.tables.some((entry) => entry.name === table.name)) {
          throw new Error(`${draft.name} catalog omitted the fixture table`)
        }
      },
    }),
    defineBenchmark({
      id: `${prefix}.page`,
      tool: "database",
      description: `Read a 100-row ${draft.name} grid page`,
      run: () => service.loadTablePage(id, table, 0, 100),
      verify: (result) => {
        if (result.rows.length !== 100) throw new Error(`${draft.name} page is incomplete`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.search_sort`,
      tool: "database",
      description: `Search and sort a ${draft.name} table`,
      run: () =>
        service.loadTablePage(id, table, 0, 100, false, {
          search: "User 1",
          sort: { column: "id", direction: "desc" },
        }),
      verify: (result) => {
        if (!result.rows.length) throw new Error(`${draft.name} search returned no rows`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.structure`,
      tool: "database",
      description: `Load ${draft.name} columns, indexes and DDL`,
      run: () => service.loadDatabaseTableStructure(id, table),
      verify: (result) => {
        if (!result.ddl.toUpperCase().includes("CREATE TABLE")) {
          throw new Error(`${draft.name} DDL is missing`)
        }
      },
    }),
    defineBenchmark({
      id: `${prefix}.sql_query`,
      tool: "database",
      description: `Execute a 200-row ${draft.name} SQL query`,
      run: () =>
        service.executeDatabaseQuery(
          id,
          "SELECT id, name FROM benchmark_rows ORDER BY id LIMIT 200",
        ),
      verify: (result) => {
        if (!result.rows.length) throw new Error(`${draft.name} SQL query returned no rows`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.insert`,
      tool: "database",
      description: `Commit one reviewed ${draft.name} row insert`,
      run: () =>
        service.insertTableRow(id, table, {
          id: nextId++,
          name: "Benchmark insert",
          note: "Owned fixture",
        }),
      verify: (result) => {
        if (result.confirmedRows !== 1) throw new Error(`${draft.name} insert failed`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.update`,
      tool: "database",
      description: `Commit one reviewed ${draft.name} row update`,
      beforeEach: async () => {
        await service.executeDatabaseQuery(
          id,
          "UPDATE benchmark_rows SET name = 'User 1' WHERE id = 1",
          true,
        )
      },
      run: () =>
        service.updateTableRow(
          id,
          table,
          { id: 1 },
          { name: "Benchmark update" },
          { id: 1, name: "User 1", note: "Note 1" },
        ),
      verify: (result) => {
        if (result.confirmedRows !== 1) throw new Error(`${draft.name} update failed`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.delete`,
      tool: "database",
      description: `Commit one reviewed ${draft.name} row deletion`,
      beforeEach: async () => {
        await service.executeDatabaseQuery(id, "DELETE FROM benchmark_rows WHERE id = 2500", true)
        await service.executeDatabaseQuery(
          id,
          "INSERT INTO benchmark_rows (id, name, note) VALUES (2500, 'Delete', 'Note')",
          true,
        )
      },
      run: () =>
        service.deleteTableRow(id, table, { id: 2500 }, { id: 2500, name: "Delete", note: "Note" }),
      verify: (result) => {
        if (result.confirmedRows !== 1) throw new Error(`${draft.name} delete failed`)
      },
    }),
    defineBenchmark({
      id: `${prefix}.batch_transaction`,
      tool: "database",
      description: `Commit ten ${draft.name} row inserts in one transaction`,
      run: () =>
        service
          .applyTableMutations(
            id,
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
          throw new Error(`${draft.name} batch transaction failed`)
        }
      },
    }),
  ]
}

export async function externalDatabaseBenchmarks(): Promise<{
  cases: BenchmarkCase[]
  cleanup: () => Promise<void>
}> {
  const service = await import("../../packages/feature-database/src/services/database")
  const runId = randomUUID()
  const ownershipLabel = `tuiminal.benchmark.run=${runId}`
  const connectionIds: string[] = []
  const cleanup = async () => {
    const closed = await Promise.allSettled(connectionIds.map((id) => service.closeConnection(id)))
    const removed = await Promise.allSettled([
      (async () => {
        const ids = (await docker(["ps", "-aq", "--filter", `label=${ownershipLabel}`]))
          .split("\n")
          .filter(Boolean)
        if (ids.length) await docker(["rm", "-f", ...ids], 30_000)
      })(),
    ])
    const failed = [...closed, ...removed].find((result) => result.status === "rejected")
    if (failed?.status === "rejected") throw failed.reason
  }
  try {
    await docker(["info", "--format", "{{.ServerVersion}}"], 10_000)
    const fixtures: DriverFixture[] = []
    for (const container of containers) {
      const name = `tuiminal-benchmark-${container.id}-${process.pid}-${runId.slice(0, 12)}`
      await docker(
        [
          "run",
          "-d",
          "--name",
          name,
          "--label",
          ownershipLabel,
          ...container.environment.flatMap((value) => ["-e", value]),
          "-p",
          `127.0.0.1::${container.port}`,
          container.image,
          ...container.extra,
        ],
        180_000,
      )
      const port = mappedPort(await docker(["port", name, `${container.port}/tcp`]))
      const draft: DatabaseConnectionDraft = {
        name: container.id,
        driver: container.driver,
        host: "127.0.0.1",
        port,
        database: "tuiminal_benchmark",
        username: container.username,
        ssl: false,
        writeEnabled: true,
      }
      fixtures.push({
        id: "",
        draft,
        table: {
          schema: container.driver === "postgres" ? "public" : "tuiminal_benchmark",
          name: "benchmark_rows",
          type: "table",
        },
      })
    }
    await Promise.all(fixtures.map((fixture) => waitForConnection(service, fixture.draft)))
    for (const fixture of fixtures) {
      const { profile } = await service.addDatabaseConnection(fixture.draft, "", false)
      fixture.id = profile.id
      connectionIds.push(profile.id)
      await seedDatabase(service, fixture)
    }
    const cases = (
      await Promise.all(fixtures.map((fixture) => driverCases(service, fixture)))
    ).flat()
    return { cases, cleanup }
  } catch (error) {
    await cleanup().catch(() => undefined)
    throw error
  }
}
