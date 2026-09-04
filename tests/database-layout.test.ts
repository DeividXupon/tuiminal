import { describe, expect, test } from "bun:test"
import {
  databaseActionRowCount,
  databaseHorizontalKeyDirection,
  databaseHorizontalNavigationAction,
  databasePageChromeRows,
  databaseResultHorizontalNavigationAction,
  databaseSidebarWidth,
  nextDatabaseTableSort,
  preserveDatabasePageSelection,
} from "../src/features/database/model/layout"

describe("database responsive layout", () => {
  test("shrinks the catalog before starving the data pane", () => {
    expect(databaseSidebarWidth(160)).toBe(32)
    expect(databaseSidebarWidth(120)).toBe(32)
    expect(databaseSidebarWidth(80)).toBe(24)
    expect(databaseSidebarWidth(60)).toBe(20)
  })

  test("uses enough action rows for narrow data panes", () => {
    expect(databaseActionRowCount(120, true)).toBe(2)
    expect(databaseActionRowCount(64, true)).toBe(2)
    expect(databaseActionRowCount(49, true)).toBe(3)
    expect(databaseActionRowCount(33, true)).toBe(3)
    expect(databaseActionRowCount(33, false)).toBe(1)
  })

  test("cycles the selected column through ascending, descending, and normal order", () => {
    const ascending = nextDatabaseTableSort(null, "name")
    expect(ascending).toEqual({ column: "name", direction: "asc" })
    const descending = nextDatabaseTableSort(ascending, "name")
    expect(descending).toEqual({ column: "name", direction: "desc" })
    expect(nextDatabaseTableSort(descending, "name")).toBeNull()
    expect(nextDatabaseTableSort(descending, "created_at")).toEqual({
      column: "created_at",
      direction: "asc",
    })
  })

  test("reserves a tab row and a full divider below table history", () => {
    expect(
      databasePageChromeRows({
        hasTableHistory: true,
        actionRowCount: 2,
        compactActions: false,
      }),
    ).toBe(15)
    expect(
      databasePageChromeRows({
        hasTableHistory: false,
        actionRowCount: 2,
        compactActions: false,
      }),
    ).toBe(13)
  })

  test("maps H/L and horizontal arrows to the same directions", () => {
    expect(databaseHorizontalKeyDirection("h")).toBe(-1)
    expect(databaseHorizontalKeyDirection("left")).toBe(-1)
    expect(databaseHorizontalKeyDirection("l")).toBe(1)
    expect(databaseHorizontalKeyDirection("right")).toBe(1)
    expect(databaseHorizontalKeyDirection("j")).toBeNull()
  })

  test("uses horizontal navigation for local movement before crossing pane boundaries", () => {
    expect(
      databaseHorizontalNavigationAction({
        pane: "catalog",
        direction: 1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 0,
        columnCount: 4,
      }),
    ).toBe("next-pane")
    expect(
      databaseHorizontalNavigationAction({
        pane: "grid",
        direction: 1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 1,
        columnCount: 4,
      }),
    ).toBe("next-column")
    expect(
      databaseHorizontalNavigationAction({
        pane: "grid",
        direction: 1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 3,
        columnCount: 4,
      }),
    ).toBe("next-pane")
    expect(
      databaseHorizontalNavigationAction({
        pane: "grid",
        direction: -1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 0,
        columnCount: 4,
      }),
    ).toBe("previous-pane")
    expect(
      databaseHorizontalNavigationAction({
        pane: "inspector",
        direction: -1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 3,
        columnCount: 4,
      }),
    ).toBe("previous-pane")
  })

  test("does not steal arrows when there is no pane in that direction", () => {
    expect(
      databaseHorizontalNavigationAction({
        pane: "catalog",
        direction: -1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 0,
        columnCount: 4,
      }),
    ).toBeNull()
    expect(
      databaseHorizontalNavigationAction({
        pane: "inspector",
        direction: 1,
        hasSelectedTable: true,
        dataView: true,
        selectedColumnIndex: 0,
        columnCount: 4,
      }),
    ).toBeNull()
    expect(
      databaseHorizontalNavigationAction({
        pane: "grid",
        direction: 1,
        hasSelectedTable: true,
        dataView: false,
        selectedColumnIndex: 0,
        columnCount: 4,
      }),
    ).toBeNull()
  })

  test("uses the same contextual movement in SQL result panes", () => {
    expect(
      databaseResultHorizontalNavigationAction({
        pane: "grid",
        direction: 1,
        selectedColumnIndex: 1,
        columnCount: 3,
        inspectorVisible: true,
      }),
    ).toBe("next-column")
    expect(
      databaseResultHorizontalNavigationAction({
        pane: "grid",
        direction: 1,
        selectedColumnIndex: 2,
        columnCount: 3,
        inspectorVisible: true,
      }),
    ).toBe("next-pane")
    expect(
      databaseResultHorizontalNavigationAction({
        pane: "inspector",
        direction: -1,
        selectedColumnIndex: 2,
        columnCount: 3,
        inspectorVisible: true,
      }),
    ).toBe("previous-pane")
    expect(
      databaseResultHorizontalNavigationAction({
        pane: "grid",
        direction: -1,
        selectedColumnIndex: 0,
        columnCount: 3,
        inspectorVisible: true,
      }),
    ).toBeNull()
  })

  test("preserves the absolute selected record when page size changes", () => {
    expect(
      preserveDatabasePageSelection({
        pageIndex: 2,
        rowIndex: 7,
        previousPageSize: 10,
        nextPageSize: 21,
      }),
    ).toEqual({ pageIndex: 1, rowIndex: 6 })
    expect(
      preserveDatabasePageSelection({
        pageIndex: 1,
        rowIndex: 14,
        previousPageSize: 21,
        nextPageSize: 10,
      }),
    ).toEqual({ pageIndex: 3, rowIndex: 5 })
  })
})
