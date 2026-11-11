import { describe, expect, test } from "bun:test"
import {
  resizeHttpSplitRatio,
  resolveHttpLayout,
  resolveHttpWorkspaceLayout,
} from "../packages/feature-http/src/model/layout"

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

  test.each([
    [160, 40],
    [110, 30],
    [80, 24],
  ] as const)("starts request and response at equal size in %ix%i", (width, height) => {
    const layout = resolveHttpLayout({ width, height })
    const requestSize = layout.mode === "panorama" ? layout.request.width : layout.request.height
    const responseSize = layout.mode === "panorama" ? layout.response.width : layout.response.height
    expect(Math.abs(requestSize - responseSize)).toBeLessThanOrEqual(1)
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

  test.each([96, 120, 132, 140, 160, 220])(
    "widens focused navigation at %i columns while reserving usable editors",
    (width) => {
      for (const splitRatio of [0.25, 0.5, 0.7]) {
        const options = { width, height: 30, contentHeight: 20, splitRatio }
        const resting = resolveHttpLayout(options)
        const focused = resolveHttpLayout({ ...options, navigationFocused: true })
        expect(focused.mode).toBe(resting.mode)
        expect(focused.navigation.width).toBeGreaterThan(resting.navigation.width)
        expect(focused.navigation.width).toBeLessThanOrEqual(56)
        expect(focused.request.width).toBeGreaterThanOrEqual(42)
        expect(focused.response.width).toBeGreaterThanOrEqual(42)
        expect(focused.navigation.height).toBe(resting.navigation.height)
        expect(focused.navigation.width).toBeLessThan(focused.request.left)
        expect(focused.response.left + focused.response.width).toBe(width)
        expect(resolveHttpLayout({ ...options, navigationFocused: false })).toEqual(resting)
      }
    },
  )

  test.each([72, 80, 95])("widens the focused overlay within %i columns", (width) => {
    const resting = resolveHttpLayout({ width, height: 24 })
    const focused = resolveHttpLayout({ width, height: 24, navigationFocused: true })
    expect(focused.navigation.width).toBeGreaterThan(resting.navigation.width)
    expect(focused.navigation.width).toBeLessThanOrEqual(width - 4)
    expect(focused.request).toEqual(resting.request)
    expect(focused.response).toEqual(resting.response)
  })

  test("keeps full-width navigation unchanged on minimum terminals", () => {
    const options = { width: 52, height: 24 }
    expect(resolveHttpLayout({ ...options, navigationFocused: true })).toEqual(
      resolveHttpLayout(options),
    )
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
      for (const chrome of [false, true].flatMap((navigationFocused) => [
        { appHeaderRows: 2, outerPadding: 1, spacing: 1, navigationFocused },
        { appHeaderRows: 1, outerPadding: 0, spacing: 0, navigationFocused },
      ])) {
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
