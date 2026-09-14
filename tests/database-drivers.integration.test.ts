import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  DatabaseConnectionDraft,
  DatabaseTable,
} from "../packages/feature-database/src/model/types"
import { nativeReadOnlyQuery } from "../packages/feature-database/src/services/read-only-query"

const enabled = process.env.TUIMINAL_DATABASE_INTEGRATION === "1"
const suite = describe.skipIf(!enabled)
const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`
const mysqlContainer = `tuiminal-db-mysql-${suffix}`
const mariadbContainer = `tuiminal-db-mariadb-${suffix}`
const postgresContainer = `tuiminal-db-postgres-${suffix}`

type DatabaseApi = typeof import("../packages/feature-database/src/services/database")
type DriverFixture = {
  connectionId: string
  driver: "mysql" | "postgres"
  usersTable: DatabaseTable
}

let api: DatabaseApi
let configRoot = ""
let fixtures: DriverFixture[] = []

async function docker(...args: string[]) {
  const subprocess = Bun.spawn(["docker", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(`docker ${args[0] ?? ""} falhou: ${stderr.trim() || stdout.trim()}`)
  }
  return stdout.trim()
}

function mappedPort(output: string) {
  const port = Number(output.match(/:(\d+)$/)?.[1])
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Porta efêmera inválida: ${output}`)
  }
  return port
}

async function waitForConnection(draft: DatabaseConnectionDraft) {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await api.testDatabaseConnection(draft, "")
      return
    } catch (error) {
      lastError = error
      await Bun.sleep(500)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("O banco não ficou pronto.")
}

async function seedDatabase(fixture: DriverFixture) {
  const identity =
    fixture.driver === "mysql"
      ? "INTEGER PRIMARY KEY AUTO_INCREMENT"
      : "INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY"
  const statements = [
    `CREATE TABLE teams (id ${identity}, name VARCHAR(120) NOT NULL UNIQUE)`,
    `CREATE TABLE users (` +
      `id ${identity}, team_id INTEGER, name VARCHAR(120) NOT NULL, ` +
      `email VARCHAR(255) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'active', ` +
      `CONSTRAINT chk_users_status CHECK (status IN ('active', 'blocked')), ` +
      `CONSTRAINT fk_users_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL)`,
    `CREATE INDEX idx_users_name ON users(name)`,
    `CREATE TABLE orders (` +
      `id ${identity}, user_id INTEGER NOT NULL, total DECIMAL(12,2) NOT NULL, ` +
      `CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
    `CREATE TABLE exact_amounts (id INTEGER PRIMARY KEY, amount DECIMAL(38,18) NOT NULL)`,
    `INSERT INTO teams (name) VALUES ('Platform'), ('Risk')`,
    `INSERT INTO users (team_id, name, email, status) VALUES ` +
      `(1, 'Alice', 'alice@example.test', 'active'), ` +
      `(2, 'Bob', 'bob@example.test', 'blocked'), ` +
      `(1, 'Carol', 'carol@example.test', 'active')`,
    `INSERT INTO orders (user_id, total) VALUES (1, 10.50), (1, 5.25), (2, 99.00)`,
    `CREATE VIEW active_users AS SELECT id, name, email FROM users WHERE status = 'active'`,
  ]
  for (const statement of statements) {
    await api.executeDatabaseQuery(fixture.connectionId, statement, true)
  }
}

suite("database driver integration", () => {
  beforeAll(async () => {
    configRoot = mkdtempSync(join(tmpdir(), "tuiminal-driver-integration-"))
    process.env.XDG_CONFIG_HOME = configRoot

    await Promise.all([
      docker(
        "run",
        "-d",
        "--name",
        mysqlContainer,
        "-e",
        "MYSQL_ALLOW_EMPTY_PASSWORD=yes",
        "-e",
        "MYSQL_DATABASE=tuiminal_test",
        "-p",
        "127.0.0.1::3306",
        "mysql:8.4",
        "--skip-log-bin",
      ),
      docker(
        "run",
        "-d",
        "--name",
        mariadbContainer,
        "-e",
        "MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1",
        "-e",
        "MARIADB_DATABASE=tuiminal_test",
        "-p",
        "127.0.0.1::3306",
        "mariadb:11.8",
        "--skip-log-bin",
      ),
      docker(
        "run",
        "-d",
        "--name",
        postgresContainer,
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "-e",
        "POSTGRES_DB=tuiminal_test",
        "-p",
        "127.0.0.1::5432",
        "postgres:17-alpine",
      ),
    ])

    const [mysqlPort, mariadbPort, postgresPort] = await Promise.all([
      docker("port", mysqlContainer, "3306/tcp").then(mappedPort),
      docker("port", mariadbContainer, "3306/tcp").then(mappedPort),
      docker("port", postgresContainer, "5432/tcp").then(mappedPort),
    ])
    api = await import("../packages/feature-database/src/services/database")
    const drafts: DatabaseConnectionDraft[] = [
      {
        name: "Integration MySQL",
        driver: "mysql",
        host: "127.0.0.1",
        port: mysqlPort,
        database: "tuiminal_test",
        username: "root",
        ssl: false,
        writeEnabled: true,
      },
      {
        name: "Integration MariaDB",
        driver: "mysql",
        host: "127.0.0.1",
        port: mariadbPort,
        database: "tuiminal_test",
        username: "root",
        ssl: false,
        writeEnabled: true,
      },
      {
        name: "Integration PostgreSQL",
        driver: "postgres",
        host: "127.0.0.1",
        port: postgresPort,
        database: "tuiminal_test",
        username: "postgres",
        ssl: false,
        writeEnabled: true,
      },
    ]

    for (const draft of drafts) await waitForConnection(draft)
    fixtures = []
    for (const draft of drafts) {
      const { profile } = await api.addDatabaseConnection(draft, "", false)
      fixtures.push({
        connectionId: profile.id,
        driver: profile.driver as "mysql" | "postgres",
        usersTable: {
          schema: profile.driver === "mysql" ? "tuiminal_test" : "public",
          name: "users",
          type: "table",
        },
      })
    }
    for (const fixture of fixtures) await seedDatabase(fixture)
  }, 120_000)

  afterAll(async () => {
    if (api) await api.closeDatabaseConnection()
    await Promise.allSettled([
      docker("rm", "-f", mysqlContainer),
      docker("rm", "-f", mariadbContainer),
      docker("rm", "-f", postgresContainer),
    ])
    if (configRoot) rmSync(configRoot, { recursive: true, force: true })
  })

  test("browses catalogs, data, searches, and sorts on MySQL, MariaDB, and PostgreSQL", async () => {
    for (const fixture of fixtures) {
      const catalog = await api.listDatabaseTables(fixture.connectionId)
      expect(catalog.tables).toEqual(
        expect.arrayContaining([
          fixture.usersTable,
          expect.objectContaining({ name: "active_users", type: "view" }),
        ]),
      )

      const page = await api.loadTablePage(fixture.connectionId, fixture.usersTable, 0, 10, true, {
        search: "ALI",
        sort: { column: "email", direction: "desc" },
      })
      expect(page.rows).toHaveLength(1)
      expect(page.rows[0]).toMatchObject({ name: "Alice", email: "alice@example.test" })
    }
  })

  test("loads DDL, constraints, indexes, and both relationship directions", async () => {
    for (const fixture of fixtures) {
      const structure = await api.loadDatabaseTableStructure(
        fixture.connectionId,
        fixture.usersTable,
      )
      expect(structure.ddl.toLocaleUpperCase()).toContain("CREATE TABLE")
      expect(structure.constraints.map((constraint) => constraint.type)).toEqual(
        expect.arrayContaining(["PRIMARY KEY", "UNIQUE", "CHECK", "FOREIGN KEY"]),
      )
      expect(structure.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_users_name", unique: false }),
        ]),
      )
      expect(structure.relationships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ direction: "outgoing", relatedTable: "teams" }),
          expect.objectContaining({ direction: "incoming", relatedTable: "orders" }),
        ]),
      )
    }
  })

  test("commits valid writes and rolls back a failing batch atomically", async () => {
    for (const fixture of fixtures) {
      const columns = await api.loadDatabaseTableColumns(fixture.connectionId, fixture.usersTable)
      await expect(
        api.applyTableMutations(fixture.connectionId, [
          {
            table: fixture.usersTable,
            columns,
            mutation: { kind: "update", rowKey: { id: 1 }, values: { name: "Should rollback" } },
            originalRow: { id: 1, name: "Alice" },
          },
          {
            table: fixture.usersTable,
            columns,
            mutation: { kind: "insert", values: { name: "Missing email" } },
            originalRow: null,
          },
        ]),
      ).rejects.toThrow()
      const rolledBack = await api.executeDatabaseQuery(
        fixture.connectionId,
        "SELECT name FROM users WHERE id = 1",
        true,
      )
      expect(rolledBack.rows[0]).toEqual({ name: "Alice" })

      await api.applyTableMutations(fixture.connectionId, [
        {
          table: fixture.usersTable,
          columns,
          mutation: { kind: "update", rowKey: { id: 1 }, values: { name: "Alice Updated" } },
          originalRow: { id: 1, name: "Alice" },
        },
      ])
      const committed = await api.executeDatabaseQuery(
        fixture.connectionId,
        "SELECT name FROM users WHERE id = 1",
        true,
      )
      expect(committed.rows[0]).toEqual({ name: "Alice Updated" })
    }
  })

  test("writes exact decimal edits without losing precision on native drivers", async () => {
    for (const fixture of fixtures) {
      const table = { ...fixture.usersTable, name: "exact_amounts" }
      const columns = await api.loadDatabaseTableColumns(fixture.connectionId, table)
      const amountColumn = columns.find((column) => column.field === "amount")
      if (!amountColumn) throw new Error("Missing decimal fixture column")
      const expected = "9007199254740993.010000000000000001"
      await api.applyTableMutations(fixture.connectionId, [
        {
          table,
          columns,
          mutation: {
            kind: "insert",
            values: {
              id: 1,
              amount: api.coerceDatabaseCellValue(
                amountColumn,
                "9.007199254740993010000000000000001e15",
              ),
            },
          },
          originalRow: null,
        },
      ])
      const castType = fixture.driver === "mysql" ? "CHAR" : "TEXT"
      const result = await api.executeDatabaseQuery(
        fixture.connectionId,
        `SELECT CAST(amount AS ${castType}) AS amount FROM exact_amounts WHERE id = 1`,
        true,
      )
      expect(result.rows).toEqual([{ amount: expected }])
    }
  })

  test("cancels long native queries and keeps each connection reusable", async () => {
    for (const fixture of fixtures) {
      const controller = new AbortController()
      const sql =
        fixture.driver === "mysql" ? "SELECT SLEEP(30) AS waited" : "SELECT pg_sleep(30) AS waited"
      const pending = api.executeDatabaseQuery(fixture.connectionId, sql, true, {
        signal: controller.signal,
      })
      setTimeout(() => controller.abort(), 150)
      await expect(pending).rejects.toBeInstanceOf(api.DatabaseQueryCancelledError)

      const followUp = await api.executeDatabaseQuery(
        fixture.connectionId,
        "SELECT 42 AS answer",
        true,
      )
      expect(Number(followUp.rows[0]?.answer)).toBe(42)
    }
  }, 20_000)

  test("enforces read-only natively with writable credentials on every driver", async () => {
    for (const fixture of fixtures) {
      const original = api.connectionProfile(fixture.connectionId)
      const { profile } = await api.addDatabaseConnection(
        { ...original, name: "Read-only fixture", writeEnabled: false },
        "",
        false,
      )
      try {
        const before = await api.executeDatabaseQuery(
          profile.id,
          "SELECT id, name FROM users ORDER BY id",
          true,
        )
        for (const sql of [
          "UPDATE users SET name = 'forbidden'",
          "DELETE FROM users",
          "DROP TABLE users",
          "CREATE TABLE forbidden (id INTEGER)",
          "SELECT tuiminal_unknown_effect()",
          "EXPLAIN ANALYZE DELETE FROM users",
          "SET TRANSACTION READ WRITE",
          "SELECT 1 /*! INTO OUTFILE '/tmp/tuiminal-forbidden' */",
        ]) {
          expect(() => api.previewDatabaseQuery(profile.id, sql)).toThrow("somente leitura")
          expect(api.previewDatabaseQuery(fixture.connectionId, sql).mutating).toBe(true)
          await expect(api.executeDatabaseQuery(profile.id, sql, true)).rejects.toThrow(
            "somente leitura",
          )
        }
        // Exercise the native boundary independently of the lexical guard, using
        // the original RW credential. Concurrent requests must each pin their mode.
        const client = await api.getNativeClient(original)
        const attempts = await Promise.allSettled([
          nativeReadOnlyQuery(client, "UPDATE users SET name = 'forbidden'", fixture.driver),
          nativeReadOnlyQuery(client, "DELETE FROM users", fixture.driver),
          nativeReadOnlyQuery(client, "CREATE TABLE forbidden (id INTEGER)", fixture.driver),
        ])
        expect(attempts.map((attempt) => attempt.status)).toEqual([
          "rejected",
          "rejected",
          "rejected",
        ])
        const after = await api.executeDatabaseQuery(
          profile.id,
          "SELECT id, name FROM users ORDER BY id",
          true,
        )
        expect(after.rows).toEqual(before.rows)
        // The same pooled connections must remain usable for explicit RW work.
        await Promise.all(
          Array.from({ length: 3 }, () =>
            client.begin(async (transaction) => {
              await transaction.unsafe("UPDATE users SET name = name WHERE id = 1")
            }),
          ),
        )
        await api.executeDatabaseQuery(
          fixture.connectionId,
          "CREATE TABLE approved (id INTEGER)",
          true,
        )
        await api.executeDatabaseQuery(fixture.connectionId, "DROP TABLE approved", true)
        expect(
          (await api.listDatabaseTables(profile.id)).tables.some(
            (table) => table.name === "forbidden",
          ),
        ).toBe(false)
        if (fixture.driver === "postgres") {
          expect(
            (await api.executeDatabaseQuery(profile.id, "SHOW transaction_read_only", true))
              .rows[0],
          ).toEqual({ transaction_read_only: "on" })
        }
      } finally {
        await api.removeDatabaseConnection(profile.id)
      }
    }
  })

  test("PostgreSQL reads cannot mutate through sequence calls or a view's function", async () => {
    const fixture = fixtures.find((item) => item.driver === "postgres")
    if (!fixture) throw new Error("Missing PostgreSQL fixture")
    await api.executeDatabaseQuery(
      fixture.connectionId,
      "CREATE SEQUENCE readonly_sequence START 1",
      true,
    )
    await api.executeDatabaseQuery(
      fixture.connectionId,
      "CREATE FUNCTION readonly_effect() RETURNS INTEGER LANGUAGE plpgsql AS $$ BEGIN UPDATE users SET name = 'forbidden'; RETURN 1; END $$",
      true,
    )
    await api.executeDatabaseQuery(
      fixture.connectionId,
      "CREATE VIEW readonly_effect_view AS SELECT readonly_effect() AS result",
      true,
    )
    const original = api.connectionProfile(fixture.connectionId)
    const client = await api.getNativeClient(original)
    const before = await api.executeDatabaseQuery(
      fixture.connectionId,
      "SELECT id, name FROM users ORDER BY id",
      true,
    )
    for (const sql of [
      "SELECT setval('readonly_sequence', 100)",
      "SELECT nextval('readonly_sequence')",
      "SELECT * FROM readonly_effect_view",
    ]) {
      await expect(Promise.resolve(nativeReadOnlyQuery(client, sql))).rejects.toThrow()
    }
    // A plain SELECT can hide a function behind a view. The normal editor path
    // must still use the native read-only transaction, even with an RW profile.
    await expect(
      api.executeDatabaseQuery(fixture.connectionId, "SELECT * FROM readonly_effect_view", true),
    ).rejects.toThrow()
    const after = await api.executeDatabaseQuery(
      fixture.connectionId,
      "SELECT id, name FROM users ORDER BY id",
      true,
    )
    expect(after.rows).toEqual(before.rows)
    expect(
      (
        await api.executeDatabaseQuery(
          fixture.connectionId,
          "SELECT last_value, is_called FROM readonly_sequence",
          true,
        )
      ).rows[0],
    ).toEqual({ last_value: "1", is_called: false })
  })
})
