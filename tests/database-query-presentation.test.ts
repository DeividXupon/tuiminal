import { afterEach, expect, test } from "bun:test"
import { COLORS, getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import {
  queryCellForeground,
  queryCompletionPresentation,
  queryRowColors,
} from "../packages/feature-database/src/rendering/query-presentation"

const settings = getUiSettings()
afterEach(() => updateUiSettings(settings))

test.each(["prime", "nord"] as const)(
  "query presentation reads current %s colors and preserves cell priority",
  (palette) => {
    updateUiSettings({ palette })
    expect(queryRowColors("insert", 0)).toEqual({
      background: COLORS.databaseInsertedBg,
      accent: COLORS.runner,
    })
    expect(queryRowColors("delete", 1)).toEqual({
      background: COLORS.databaseDeletedBg,
      accent: COLORS.danger,
    })
    expect(queryRowColors("update", 0)).toEqual({
      background: COLORS.databaseEditedBg,
      accent: COLORS.warning,
    })
    expect(queryRowColors(undefined, 0)).toEqual({ background: COLORS.panel, accent: COLORS.text })
    expect(queryRowColors(undefined, 1)).toEqual({
      background: COLORS.panelRaised,
      accent: COLORS.text,
    })
    expect(queryCellForeground(true, true, true, "changed", "selected")).toBe("selected")
    expect(queryCellForeground(false, true, true, "changed", "selected")).toBe("changed")
    expect(queryCellForeground(false, false, true, "changed", "selected")).toBe(COLORS.text)
    expect(queryCellForeground(false, false, false, "changed", "selected")).toBe(COLORS.muted)
    expect(queryCompletionPresentation("table")).toEqual({ icon: "▦", accent: COLORS.database })
  },
)

test("SQL completion kinds keep their distinct icons and syntax accents", () => {
  expect(queryCompletionPresentation("keyword")).toEqual({ icon: "K", accent: "#c792ea" })
  expect(queryCompletionPresentation("function")).toEqual({ icon: "ƒ", accent: "#82aaff" })
  expect(queryCompletionPresentation("column")).toEqual({ icon: "◇", accent: "#80cbc4" })
})
