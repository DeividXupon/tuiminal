import { expect, test } from "bun:test"
import {
  affectedRowCount,
  queryResultColumns,
} from "../packages/feature-database/src/model/query-result-metadata"

test("query columns prefer returned row keys and accept driver metadata for empty results", () => {
  expect(queryResultColumns({ columns: ["ignored"] }, [{ id: 1, title: "row" }])).toEqual([
    "id",
    "title",
  ])
  expect(queryResultColumns({ columns: ["id", { name: "title" }, null, { name: 1 }] }, [])).toEqual(
    ["id", "title"],
  )
  expect(queryResultColumns(null, [])).toEqual([])
})

test("affected-row metadata respects driver precedence and finite counts", () => {
  expect(affectedRowCount({ affectedRows: 2, changes: 3 })).toBe(2)
  expect(affectedRowCount({ affectedRows: Number.NaN, changes: 3n })).toBe(3)
  expect(affectedRowCount({ count: 4 })).toBe(4)
  expect(affectedRowCount({ rowCount: 0 })).toBe(0)
  expect(affectedRowCount({ changes: "5" })).toBeNull()
})
