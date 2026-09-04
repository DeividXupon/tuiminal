import { describe, expect, test } from "bun:test"
import {
  resizeHttpSplitRatio,
  resolveHttpLayout,
  resolveHttpWorkspaceLayout,
} from "../src/features/http/model/layout"

describe("HTTP adaptive layout", () => {
  test.each([
    [160, 40, "panorama"],
    [110, 30, "workbench"],
    [80, 24, "focus"],
    [60, 17, "minimum"],
  ] as const)("resolves %ix%i as %s", (width, height, mode) => {
    expect(resolveHttpLayout({ width, height }).mode).toBe(mode)
  })

  test("keeps every simultaneous pane inside the content canvas", () => {
    const layout = resolveHttpLayout({ width: 140, height: 30, contentHeight: 18 })
    expect(layout.navigation.height).toBe(18)
    expect(layout.request.left + layout.request.width).toBeLessThan(layout.response.left)
    expect(layout.response.left + layout.response.width).toBe(140)
  })

  test("uses one full pane and a two-row omnibar at the minimum size", () => {
    const layout = resolveHttpLayout({ width: 42, height: 12, contentHeight: 5 })
    expect(layout.omnibarRows).toBe(2)
    expect(layout.simultaneousPanes).toBe(false)
    expect(layout.request).toEqual({ left: 0, top: 0, width: 42, height: 5 })
    expect(layout.response).toEqual(layout.request)
  })

  test("reserves app chrome and framed padding before sizing the panes", () => {
    const result = resolveHttpWorkspaceLayout({
      terminalWidth: 100,
      terminalHeight: 30,
      appHeaderRows: 2,
      outerPadding: 1,
      spacing: 1,
    })
    expect(result.layout.response.left + result.layout.response.width).toBe(98)
    expect(result.layout.response.height).toBeLessThan(26)
  })

  test("resizes the split in stable clamped increments", () => {
    expect(resizeHttpSplitRatio(0.4, 1)).toBe(0.45)
    expect(resizeHttpSplitRatio(0.69, 1)).toBe(0.7)
    expect(resizeHttpSplitRatio(0.25, -1)).toBe(0.25)
  })

  test.each([
    [60, 16],
    [72, 18],
    [80, 24],
    [96, 24],
    [120, 30],
    [160, 40],
  ] as const)(
    "keeps the complete workspace inside %ix%i in framed and compact layouts",
    (width, height) => {
      for (const chrome of [
        { appHeaderRows: 2, outerPadding: 1, spacing: 1 },
        { appHeaderRows: 1, outerPadding: 0, spacing: 0 },
      ]) {
        const { layout, bodyHeight } = resolveHttpWorkspaceLayout({
          terminalWidth: width,
          terminalHeight: height,
          ...chrome,
        })
        const availableWidth = width - chrome.outerPadding * 2
        expect(bodyHeight).toBeGreaterThanOrEqual(4)
        for (const pane of [layout.navigation, layout.request, layout.response]) {
          expect(pane.left).toBeGreaterThanOrEqual(0)
          expect(pane.top).toBeGreaterThanOrEqual(0)
          expect(pane.width).toBeGreaterThan(0)
          expect(pane.height).toBeGreaterThan(0)
          expect(pane.left + pane.width).toBeLessThanOrEqual(availableWidth)
          expect(pane.top + pane.height).toBeLessThanOrEqual(bodyHeight)
        }
      }
    },
  )
})
