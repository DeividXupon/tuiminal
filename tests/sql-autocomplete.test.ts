import { describe, expect, test } from "bun:test"
import type { DatabaseColumn, DatabaseTable } from "../src/features/database/model/types"

import {
  getSqlCompletionContext,
  sqlAutocompleteTableKey,
} from "../src/features/database/model/sql-autocomplete"

const users: DatabaseTable = { schema: "public", name: "users", type: "table" }
const orders: DatabaseTable = { schema: "public", name: "order", type: "table" }
const tables = [users, orders]
const userColumns: DatabaseColumn[] = [
  { field: "id", type: "integer", nullable: false, key: "PRI", defaultValue: null },
  { field: "name", type: "varchar", nullable: false, key: "", defaultValue: null },
]
const columnsByTable = new Map([
  [sqlAutocompleteTableKey(users), userColumns],
  [sqlAutocompleteTableKey(orders), []],
])

describe("SQL autocomplete", () => {
  test("suggests tables in relation contexts", () => {
    const sql = "SELECT * FROM use"
    const context = getSqlCompletionContext({
      sql,
      cursorOffset: sql.length,
      driver: "postgres",
      tables,
      columnsByTable,
    })

    expect(context?.items[0]).toMatchObject({
      kind: "table",
      label: "users",
      insertText: "users",
    })
  })

  test("suggests columns for a table alias", () => {
    const sql = "SELECT u.na FROM users AS u"
    const context = getSqlCompletionContext({
      sql,
      cursorOffset: "SELECT u.na".length,
      driver: "postgres",
      tables,
      columnsByTable,
    })

    expect(context?.items[0]).toMatchObject({
      kind: "column",
      label: "name",
      insertText: "name",
    })
  })

  test("quotes reserved identifiers for the selected dialect", () => {
    const sql = "SELECT * FROM ord"
    const context = getSqlCompletionContext({
      sql,
      cursorOffset: sql.length,
      driver: "postgres",
      tables,
      columnsByTable,
    })
    const order = context?.items.find((item) => item.label === "order")

    expect(order?.insertText).toBe('"order"')
  })

  test("does not offer completions inside strings or comments", () => {
    for (const sql of ["SELECT 'use", "SELECT 1 -- use"]) {
      const context = getSqlCompletionContext({
        sql,
        cursorOffset: sql.length,
        driver: "postgres",
        tables,
        columnsByTable,
        force: true,
      })
      expect(context?.items).toEqual([])
    }
  })
})
