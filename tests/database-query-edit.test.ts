import { describe, expect, test } from "bun:test"
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
