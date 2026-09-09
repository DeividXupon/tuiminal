import { describe, expect, test } from "bun:test"
import type { DatabaseColumn, DatabaseTable } from "../src/features/database/model/types"

import {
  databaseEditableQueryTable,
  databaseQueryResultColumns,
  databaseQueryResultMatchesTable,
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

  test("requires every primary-key value before allowing row mutations", () => {
    expect(databaseQueryResultRowKey({ tenant_id: 4, id: 9, name: "Ada" }, columns)).toEqual({
      tenant_id: 4,
      id: 9,
    })
    expect(databaseQueryResultRowKey({ id: 9, name: "Ada" }, columns)).toBeNull()
    expect(databaseQueryResultRowKey({ tenant_id: 4, id: "<mascarado>" }, columns)).toBeNull()
    expect(databaseQueryResultRowKey({ id: 9 }, columns.slice(2))).toBeNull()
  })

  test.each([
    "SELECT id + 1 AS id, name FROM users WHERE id = 1",
    "SELECT 2 AS id, name FROM users",
    "SELECT name AS id FROM users",
    "SELECT id, upper(name) AS name FROM users",
    "SELECT DISTINCT id, name FROM users",
    "SELECT id, name FROM users GROUP BY id",
    "SELECT id, count(*) AS name FROM users",
    "SELECT id, (SELECT name FROM users) AS name FROM users",
    "SELECT id, id FROM users",
    "SELECT *, id FROM users",
    "SELECT id AS id, name AS id FROM users",
    "SELECT id FROM users; SELECT id FROM events",
    "SELECT id FROM users u, events e",
    "SELECT id FROM users TABLESAMPLE SYSTEM (10)",
    "SELECT id FROM users /*! UNION SELECT id FROM events */",
    "SELECT id /*! + 1 */ AS id FROM users",
    "SELECT id /*M! + 1 */ AS id FROM users",
    "SELECT id, CURRENT_TIMESTAMP AS name FROM users",
    "SELECT id, row_number() OVER () AS name FROM users",
    "SELECT id FROM users ORDER BY id UNION SELECT id FROM events",
  ])("keeps unproven projections read-only: %s", (sql) => {
    expect(databaseEditableQueryTable(sql, tables)).toBeNull()
  })

  test("supports qualified direct projections and literal/comment boundaries", () => {
    expect(
      databaseEditableQueryTable(
        "SELECT u.id AS id, u.name FROM public.users AS u WHERE name = 'it''s FROM users' -- JOIN ignored\nORDER BY id;",
        tables,
      ),
    ).toEqual(tables[0])
    expect(databaseEditableQueryTable("SELECT u.* FROM users u", tables)).toEqual(tables[0])
    expect(databaseEditableQueryTable("SELECT e.id FROM users u", tables)).toBeNull()
    expect(databaseEditableQueryTable("SELECT id FROM users u unexpected", tables)).toBeNull()
  })

  test("does not resolve a quoted relation to a differently cased or ambiguous table", () => {
    expect(databaseEditableQueryTable('SELECT * FROM "USERS"', tables)).toBeNull()
    expect(
      databaseEditableQueryTable("SELECT * FROM users", [
        ...tables,
        { schema: "audit", name: "users", type: "table" },
      ]),
    ).toBeNull()
  })

  test("uses the connection dialect for identifier quoting", () => {
    expect(databaseEditableQueryTable('SELECT "id" FROM users', tables, "mysql")).toBeNull()
    expect(databaseEditableQueryTable("SELECT `id` FROM `users`", tables, "mysql")).toEqual(
      tables[0],
    )
    expect(databaseEditableQueryTable("SELECT `id` FROM `users`", tables, "postgres")).toBeNull()
    expect(databaseEditableQueryTable('SELECT "id" FROM "users"', tables, "sqlite")).toEqual(
      tables[0],
    )
    expect(databaseEditableQueryTable("SELECT [id] FROM [users]", tables, "sqlite")).toEqual(
      tables[0],
    )
  })

  test("requires all returned columns to match unique schema columns", () => {
    expect(databaseQueryResultMatchesTable(["tenant_id", "id", "name"], columns)).toBe(true)
    expect(databaseQueryResultMatchesTable(["id"], columns)).toBe(true)
    expect(databaseQueryResultMatchesTable(["id", "missing"], columns)).toBe(false)
    expect(databaseQueryResultMatchesTable(["id", "id"], columns)).toBe(false)
    expect(databaseQueryResultMatchesTable([], columns)).toBe(false)
    expect(databaseQueryResultMatchesTable(["id"], [...columns, columns[1]])).toBe(false)
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
