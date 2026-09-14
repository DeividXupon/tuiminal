import { describe, expect, test } from "bun:test"
import {
  nextSqlTabIndex,
  resizeSqlEditorRatio,
  sqlSplitEditorHeight,
  toggleSqlWorkspaceMode,
} from "../packages/feature-database/src/model/sql-workspace"

describe("SQL workspace layout", () => {
  test("resizes only through stable ratio steps", () => {
    expect(resizeSqlEditorRatio(40, 1)).toBe(50)
    expect(resizeSqlEditorRatio(40, -1)).toBe(30)
    expect(resizeSqlEditorRatio(70, 1)).toBe(70)
    expect(sqlSplitEditorHeight(80, 70)).toBe(49)
    expect(sqlSplitEditorHeight(44, 30)).toBe(10)
  })

  test("maximizes the focused pane and restores the split", () => {
    expect(toggleSqlWorkspaceMode("split", "editor")).toBe("editor")
    expect(toggleSqlWorkspaceMode("split", "result")).toBe("result")
    expect(toggleSqlWorkspaceMode("editor", "editor")).toBe("split")
  })

  test("cycles SQL tabs in both directions", () => {
    expect(nextSqlTabIndex(2, 3, 1)).toBe(0)
    expect(nextSqlTabIndex(0, 3, -1)).toBe(2)
    expect(nextSqlTabIndex(0, 0, 1)).toBe(-1)
  })
})
