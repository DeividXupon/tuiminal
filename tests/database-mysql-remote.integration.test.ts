import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type {
  DatabaseConnectionProfile,
  DatabaseTable,
} from "../packages/feature-database/src/model/types"
import { remoteMySqlEnvironment } from "./fixtures/remote-mysql-environment"

const remoteEnvironment = remoteMySqlEnvironment()
const suite = describe.skipIf(remoteEnvironment.status !== "enabled")
const prefix = `tuiminal_it_${process.pid}_${randomUUID().slice(0, 8)}`
const names = {
  teams: `${prefix}_teams`,
  users: `${prefix}_users`,
  orders: `${prefix}_orders`,
  exactAmounts: `${prefix}_exact_amounts`,
  activeUsers: `${prefix}_active_users`,
}

type DatabaseApi = typeof import("../packages/feature-database/src/services/database")

let api: DatabaseApi | null = null
let profile: DatabaseConnectionProfile | null = null

function configuration() {
  if (remoteEnvironment.status === "invalid") throw remoteEnvironment.error
  if (remoteEnvironment.status !== "enabled") throw new Error("Remote MySQL is not configured.")
  return remoteEnvironment.configuration
}

function quote(identifier: string) {
  if (!api || !profile) throw new Error("Remote MySQL fixture is not connected.")
  return api.quoteIdentifier(profile, identifier)
}

function table(name: string): DatabaseTable {
  return { schema: configuration().database, name, type: "table" }
}

async function execute(sql: string) {
  if (!api || !profile) throw new Error("Remote MySQL fixture is not connected.")
  return api.executeDatabaseQuery(profile.id, sql, true)
}

async function createFixture() {
  const statements = [
    `CREATE TABLE ${quote(names.teams)} (` +
      `id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(120) NOT NULL UNIQUE)`,
    `CREATE TABLE ${quote(names.users)} (` +
      `id INTEGER PRIMARY KEY AUTO_INCREMENT, team_id INTEGER, ` +
      `name VARCHAR(120) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, ` +
      `status VARCHAR(32) NOT NULL DEFAULT 'active', ` +
      `CONSTRAINT ${quote(`${prefix}_users_status_check`)} ` +
      `CHECK (status IN ('active', 'blocked')), ` +
      `CONSTRAINT ${quote(`${prefix}_users_team_fk`)} FOREIGN KEY (team_id) ` +
      `REFERENCES ${quote(names.teams)}(id) ON DELETE SET NULL)`,
    `CREATE INDEX ${quote(`${prefix}_users_name_idx`)} ON ${quote(names.users)} (name)`,
    `CREATE TABLE ${quote(names.orders)} (` +
      `id INTEGER PRIMARY KEY AUTO_INCREMENT, user_id INTEGER NOT NULL, ` +
      `total DECIMAL(12,2) NOT NULL, ` +
      `CONSTRAINT ${quote(`${prefix}_orders_user_fk`)} FOREIGN KEY (user_id) ` +
      `REFERENCES ${quote(names.users)}(id) ON DELETE CASCADE)`,
    `CREATE TABLE ${quote(names.exactAmounts)} (` +
      `id INTEGER PRIMARY KEY, amount DECIMAL(38,18) NOT NULL)`,
    `INSERT INTO ${quote(names.teams)} (name) VALUES ('Platform'), ('Risk')`,
    `INSERT INTO ${quote(names.users)} (team_id, name, email, status) VALUES ` +
      `(1, 'Alice', 'alice@example.test', 'active'), ` +
      `(2, 'Bob', 'bob@example.test', 'blocked'), ` +
      `(1, 'Carol', 'carol@example.test', 'active')`,
    `INSERT INTO ${quote(names.orders)} (user_id, total) ` +
      `VALUES (1, 10.50), (1, 5.25), (2, 99.00)`,
    `CREATE SQL SECURITY INVOKER VIEW ${quote(names.activeUsers)} AS ` +
      `SELECT id, name, email FROM ${quote(names.users)} WHERE status = 'active'`,
  ]
  for (const statement of statements) await execute(statement)
}

function cleanupStatements() {
  return [
    `DROP VIEW IF EXISTS ${quote(names.activeUsers)}`,
    `DROP TABLE IF EXISTS ${quote(names.orders)}`,
    `DROP TABLE IF EXISTS ${quote(names.exactAmounts)}`,
    `DROP TABLE IF EXISTS ${quote(names.users)}`,
    `DROP TABLE IF EXISTS ${quote(names.teams)}`,
  ]
}

async function cleanupFixture() {
  let firstError: unknown = null
  if (api && profile) {
    for (const statement of cleanupStatements()) {
      try {
        await execute(statement)
      } catch (error) {
        firstError ??= error
      }
    }
    try {
      await api.removeDatabaseConnection(profile.id)
    } catch (error) {
      firstError ??= error
    }
  }
  profile = null
  return firstError
}

if (remoteEnvironment.status === "invalid") {
  test("remote MySQL environment is valid", () => {
    throw remoteEnvironment.error
  })
}

suite("remote MySQL integration", () => {
  beforeAll(async () => {
    const config = configuration()
    api = await import("../packages/feature-database/src/services/database")
    try {
      const added = await api.addDatabaseConnection(
        {
          name: "Remote MySQL integration",
          driver: "mysql",
          host: config.host,
          port: config.port,
          database: config.database,
          username: config.username,
          ssl: true,
          writeEnabled: true,
        },
        config.password,
        false,
      )
      profile = added.profile
      await createFixture()
    } catch (error) {
      await cleanupFixture()
      throw error
    }
  }, 60_000)

  afterAll(async () => {
    const error = await cleanupFixture()
    if (error) throw error
  }, 60_000)

  test("connects to the configured MySQL 8.4 database over TLS", async () => {
    const identity = await execute("SELECT VERSION() AS version, DATABASE() AS database_name")
    expect(String(identity.rows[0]?.version ?? "")).toMatch(/^8\.4(?:\.|$)/u)
    expect(identity.rows[0]?.database_name).toBe(configuration().database)

    const tls = await execute("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    expect(String(tls.rows[0]?.Value ?? tls.rows[0]?.value ?? "")).not.toBe("")
  }, 30_000)

  test("browses only the owned catalog fixture and its relationships", async () => {
    if (!api || !profile) throw new Error("Remote MySQL fixture is not connected.")
    const usersTable = table(names.users)
    const catalog = await api.listDatabaseTables(profile.id)
    expect(catalog.tables).toEqual(
      expect.arrayContaining([
        usersTable,
        expect.objectContaining({ name: names.activeUsers, type: "view" }),
      ]),
    )

    const page = await api.loadTablePage(profile.id, usersTable, 0, 10, true, {
      search: "ALI",
      sort: { column: "email", direction: "desc" },
    })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]).toMatchObject({ name: "Alice", email: "alice@example.test" })

    const structure = await api.loadDatabaseTableStructure(profile.id, usersTable)
    expect(structure.ddl.toUpperCase()).toContain("CREATE TABLE")
    expect(structure.constraints.map((constraint) => constraint.type)).toEqual(
      expect.arrayContaining(["PRIMARY KEY", "UNIQUE", "CHECK", "FOREIGN KEY"]),
    )
    expect(structure.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `${prefix}_users_name_idx`, unique: false }),
      ]),
    )
    expect(structure.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ direction: "outgoing", relatedTable: names.teams }),
        expect.objectContaining({ direction: "incoming", relatedTable: names.orders }),
      ]),
    )
  }, 30_000)

  test("isolates CRUD work and rolls back a failing batch", async () => {
    if (!api || !profile) throw new Error("Remote MySQL fixture is not connected.")
    const usersTable = table(names.users)
    const columns = await api.loadDatabaseTableColumns(profile.id, usersTable)
    await expect(
      api.applyTableMutations(profile.id, [
        {
          table: usersTable,
          columns,
          mutation: { kind: "update", rowKey: { id: 1 }, values: { name: "Should rollback" } },
          originalRow: { id: 1, name: "Alice" },
        },
        {
          table: usersTable,
          columns,
          mutation: { kind: "insert", values: { name: "Missing email" } },
          originalRow: null,
        },
      ]),
    ).rejects.toThrow()
    const rolledBack = await execute(`SELECT name FROM ${quote(names.users)} WHERE id = 1`)
    expect(rolledBack.rows[0]).toEqual({ name: "Alice" })

    const email = `${prefix}@example.test`
    await api.applyTableMutations(profile.id, [
      {
        table: usersTable,
        columns,
        mutation: {
          kind: "insert",
          values: { team_id: 1, name: "Remote Insert", email, status: "active" },
        },
        originalRow: null,
      },
    ])
    const inserted = await execute(
      `SELECT id, team_id, name, email, status FROM ${quote(names.users)} ` +
        `WHERE email = '${email}'`,
    )
    const row = inserted.rows[0]
    if (!row) throw new Error("The isolated insert was not found.")

    await api.applyTableMutations(profile.id, [
      {
        table: usersTable,
        columns,
        mutation: { kind: "update", rowKey: { id: row.id }, values: { name: "Remote Updated" } },
        originalRow: row,
      },
    ])
    expect(
      (await execute(`SELECT name FROM ${quote(names.users)} WHERE id = ${Number(row.id)}`))
        .rows[0],
    ).toEqual({ name: "Remote Updated" })

    const updated = { ...row, name: "Remote Updated" }
    await api.applyTableMutations(profile.id, [
      {
        table: usersTable,
        columns,
        mutation: { kind: "delete", rowKey: { id: row.id } },
        originalRow: updated,
      },
    ])
    const remaining = await execute(
      `SELECT COUNT(*) AS count FROM ${quote(names.users)} WHERE id = ${Number(row.id)}`,
    )
    expect(Number(remaining.rows[0]?.count)).toBe(0)
  }, 30_000)

  test("preserves exact decimal values on the remote native driver", async () => {
    if (!api || !profile) throw new Error("Remote MySQL fixture is not connected.")
    const exactTable = table(names.exactAmounts)
    const columns = await api.loadDatabaseTableColumns(profile.id, exactTable)
    const amountColumn = columns.find((column) => column.field === "amount")
    if (!amountColumn) throw new Error("Missing remote decimal fixture column.")

    const expected = "9007199254740993.010000000000000001"
    await api.applyTableMutations(profile.id, [
      {
        table: exactTable,
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
    const result = await execute(
      `SELECT CAST(amount AS CHAR) AS amount FROM ${quote(names.exactAmounts)} WHERE id = 1`,
    )
    expect(result.rows).toEqual([{ amount: expected }])
  }, 30_000)
})
