import { describe, expect, test } from "bun:test"
import {
  sqlStatementAtOffset,
  sqlStatementRanges,
} from "../src/features/database/model/sql-statements"

describe("SQL statement selection", () => {
  test("selects the statement containing the cursor", () => {
    const sql = "SELECT 1;\n\nSELECT 2;\nUPDATE users SET active = 1;"
    expect(sqlStatementAtOffset(sql, sql.indexOf("2"))).toMatchObject({
      sql: "SELECT 2",
      index: 1,
      total: 3,
    })
    expect(sqlStatementAtOffset(sql, sql.indexOf("UPDATE"))).toMatchObject({
      sql: "UPDATE users SET active = 1",
      index: 2,
      total: 3,
    })
  })

  test("ignores semicolons inside strings, comments, and dollar quotes", () => {
    const ranges = sqlStatementRanges(
      "SELECT ';' AS value; -- ;\nSELECT $$a;b$$; /* ; */ SELECT 3;",
    )
    expect(ranges.map((range) => range.sql)).toEqual([
      "SELECT ';' AS value",
      "-- ;\nSELECT $$a;b$$",
      "/* ; */ SELECT 3",
    ])
  })

  test("chooses the following statement from whitespace between commands", () => {
    const sql = "SELECT 1;\n\n  SELECT 2"
    expect(sqlStatementAtOffset(sql, sql.indexOf("\n\n") + 1)?.sql).toBe("SELECT 2")
    expect(sqlStatementAtOffset(sql, sql.indexOf(";") + 1)?.sql).toBe("SELECT 1")
    expect(sqlStatementAtOffset("-- comment only", 4)).toBeNull()
  })
})
