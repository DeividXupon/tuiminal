import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import type { DatabaseColumn, DatabaseTable } from "../src/features/database/model/types"

import {
  databaseEditableQueryTable,
  databaseQueryResultColumns,
  databaseQueryResultRowKey,
} from "../src/features/database/model/query-edit"

const tables: [DatabaseTable, DatabaseTable] = [
  { schema: "public", name: "users", type: "table" as const },
  { schema: "audit", name: "events", type: "table" as const },
]

const columns: [DatabaseColumn, DatabaseColumn, DatabaseColumn] = [
  { field: "tenant_id", type: "INTEGER", nullable: false, key: "PRI", defaultValue: null },
  { field: "id", type: "INTEGER", nullable: false, key: "PRI", defaultValue: null },
  { field: "name", type: "TEXT", nullable: false, key: "", defaultValue: null },
]

describe("editable SQL query results", () => {
  test("resolves one unambiguous base table", () => {
    expect(
      databaseEditableQueryTable(
        'SELECT id, name FROM "public"."users" WHERE name = \'FROM JOIN\' ORDER BY id',
        tables,
      ),
    ).toEqual(tables[0])
    expect(databaseEditableQueryTable("SELECT * FROM events e LIMIT 20", tables)).toEqual(tables[1])
  })

  test("keeps joins, CTEs, unions, subqueries, and unknown tables read-only", () => {
    expect(
      databaseEditableQueryTable("SELECT * FROM users JOIN events ON events.id = users.id", tables),
    ).toBeNull()
    expect(
      databaseEditableQueryTable(
        "WITH selected AS (SELECT * FROM users) SELECT * FROM selected",
        tables,
      ),
    ).toBeNull()
    expect(
      databaseEditableQueryTable("SELECT * FROM users UNION SELECT * FROM events", tables),
    ).toBeNull()
    expect(
      databaseEditableQueryTable("SELECT * FROM (SELECT * FROM users) nested", tables),
    ).toBeNull()
    expect(databaseEditableQueryTable("SELECT * FROM missing", tables)).toBeNull()
  })

  test("never treats a computed or renamed primary key as the underlying row identity", () => {
    const database = new Database(":memory:")
    try {
      database.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
      database.exec("INSERT INTO users VALUES (1, 'Ada'), (2, 'Grace')")
      const sql = "SELECT id + 1 AS id, name FROM users WHERE id = 1"
      const row = database.query(sql).get() as Record<string, unknown>
      expect(row).toEqual({ id: 2, name: "Ada" })
      expect(databaseQueryResultRowKey(row, [columns[1], columns[2]])).toEqual({ id: 2 })
      expect(databaseEditableQueryTable(sql, tables)).toBeNull()
      expect(
        databaseEditableQueryTable("SELECT tenant_id AS id, name FROM users", tables),
      ).toBeNull()
    } finally {
      database.close()
    }
  })

  test("keeps derived, grouped, and duplicate-eliminated results read-only", () => {
    for (const sql of [
      "SELECT id, upper(name) AS name FROM users",
      "SELECT 2 AS id, name FROM users",
      "SELECT *, row_number() OVER () AS id FROM users",
      "SELECT id, count(*) AS name FROM users GROUP BY id",
      "SELECT id, name FROM users GROUP BY id",
      "SELECT DISTINCT id, name FROM users",
      "SELECT id, name FROM users HAVING count(*) > 1",
      "SELECT id, name FROM users; SELECT 2 AS id",
    ]) {
      expect(databaseEditableQueryTable(sql, tables)).toBeNull()
    }
  })

  test("preserves direct qualified projections, stars, and unchanged column aliases", () => {
    for (const sql of [
      "SELECT id, name FROM users WHERE id > 1 ORDER BY name LIMIT 20",
      'SELECT u."id", u.name FROM "public"."users" AS u',
      "SELECT u.* FROM users u",
      "SELECT public.users.id, public.users.name FROM public.users",
      "SELECT ALL id AS id, name name FROM users",
      "SELECT /* projection */ id, name FROM /* relation */ users; -- end",
      "SELECT id, name FROM users WHERE name = $tag$FROM JOIN$tag$",
    ]) {
      expect(databaseEditableQueryTable(sql, tables)).toEqual(tables[0])
    }
  })

  test("retains quoted identifier boundaries and rejects incomplete syntax", () => {
    const unusualTable: DatabaseTable = { schema: "main", name: "from,join", type: "table" }
    expect(
      databaseEditableQueryTable('SELECT "id,group" FROM "from,join"', [unusualTable], "sqlite"),
    ).toEqual(unusualTable)
    expect(databaseEditableQueryTable("SELECT [id] FROM [users]", tables)).toEqual(tables[0])
    expect(databaseEditableQueryTable("SELECT `id` FROM `users`", tables)).toEqual(tables[0])
    for (const sql of [
      "SELECT id. FROM users",
      "SELECT id AS FROM users",
      "SELECT id FROM users AS",
      "SELECT id FROM users /* unterminated",
      "SELECT id FROM users WHERE name = 'unterminated",
      "SELECT id FROM users WHERE name = $tag$unterminated",
      "SELECT id, name FROM users, events",
    ]) {
      expect(databaseEditableQueryTable(sql, tables)).toBeNull()
    }
  })

  test("does not strip executable comments or dialect-dependent operators from projections", () => {
    for (const sql of [
      "SELECT id /*! + 1 */ AS id, name FROM users",
      "SELECT id /*M! + 1 */ AS id, name FROM users",
      "SELECT id /* outer /* inner */ + 1 AS id /* end */ FROM users",
      "SELECT id--1 AS id\n FROM users",
      "SELECT id#1 AS id\n FROM users",
      "SELECT current_user AS id FROM users",
      "SELECT different.id, name FROM users",
    ]) {
      expect(databaseEditableQueryTable(sql, tables)).toBeNull()
    }
  })

  test("blocks a MySQL double-quoted literal from identifying a different text primary key", () => {
    const database = new Database(":memory:")
    try {
      database.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)")
      database.exec("INSERT INTO users VALUES ('user-1', 'Ada'), ('id', 'Grace')")
      const mysqlSql = 'SELECT "id" AS "id", name FROM users WHERE id = \'user-1\''
      // In MySQL without ANSI_QUOTES, "id" is a string. Use its explicit literal
      // equivalent in this SQLite fixture, whose double quotes mean identifiers.
      const row = database
        .query("SELECT 'id' AS id, name FROM users WHERE id = 'user-1'")
        .get() as Record<string, unknown>
      const key = databaseQueryResultRowKey(row, [{ ...columns[1], type: "TEXT" }])
      expect(row).toEqual({ id: "id", name: "Ada" })
      expect(key).toEqual({ id: "id" })
      expect(database.query("SELECT name FROM users WHERE id = ?").get(String(key?.id))).toEqual({
        name: "Grace",
      })
      expect(databaseEditableQueryTable(mysqlSql, tables, "mysql")).toBeNull()
      expect(databaseEditableQueryTable(mysqlSql, tables, "mcp-mysql")).toBeNull()
      expect(databaseEditableQueryTable(mysqlSql, tables)).toBeNull()
    } finally {
      database.close()
    }
  })

  test("keeps double-quoted direct columns editable on PostgreSQL and SQLite", () => {
    for (const driver of ["postgres", "sqlite"] as const) {
      for (const sql of [
        'SELECT "id", "name" FROM "users"',
        'SELECT "id" AS "id", name FROM users',
        'SELECT u."id", u."name" FROM users AS u',
      ]) {
        expect(databaseEditableQueryTable(sql, tables, driver)).toEqual(tables[0])
      }
    }
  })

  test("preserves unambiguous MySQL columns, qualified references, and unchanged aliases", () => {
    for (const sql of [
      "SELECT id, name FROM users",
      "SELECT `id`, `name` FROM `users`",
      'SELECT id AS "id", name FROM users',
      'SELECT u."id", u.name FROM users u',
      'SELECT "u"."id", "u".name FROM users "u"',
      'SELECT * FROM users WHERE name = "Ada"',
    ]) {
      expect(databaseEditableQueryTable(sql, tables, "mysql")).toEqual(tables[0])
    }
    for (const sql of ['SELECT "id", name FROM users', 'SELECT "id" id, name FROM users']) {
      expect(databaseEditableQueryTable(sql, tables, "mysql")).toBeNull()
    }
  })

  test("requires every primary-key value before allowing row mutations", () => {
    expect(databaseQueryResultRowKey({ tenant_id: 4, id: 9, name: "Ada" }, columns)).toEqual({
      tenant_id: 4,
      id: 9,
    })
    expect(databaseQueryResultRowKey({ id: 9, name: "Ada" }, columns)).toBeNull()
    expect(databaseQueryResultRowKey({ tenant_id: 4, id: "<mascarado>" }, columns)).toBeNull()
    expect(databaseQueryResultRowKey({ id: 9 }, columns.slice(2))).toBeNull()
  })

  test("maps returned fields to schema metadata without making aliases writable", () => {
    expect(databaseQueryResultColumns(["id", "display_name"], columns)).toEqual([
      columns[1],
      {
        field: "display_name",
        type: "resultado",
        nullable: true,
        key: "",
        defaultValue: null,
      },
    ])
  })
})
