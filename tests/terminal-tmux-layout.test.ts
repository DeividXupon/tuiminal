import { expect, test } from "bun:test"
import {
  fitTmuxLayout,
  formatTmuxLayout,
  parseTmuxLayout,
  tmuxLayoutPanes,
} from "../packages/feature-terminal/src/model/tmux-layout"

test("a single agent uses the viewport dimensions rather than the original terminal dimensions", () => {
  const original = parseTmuxLayout("0000,160x40,0,0,6")
  const fitted = fitTmuxLayout(original, new Map([["%6", { columns: 94, rows: 29 }]]))
  expect([fitted.width, fitted.height]).toEqual([94, 29])
  expect([original.width, original.height]).toEqual([160, 40])
  expect(parseTmuxLayout(formatTmuxLayout(fitted))).toEqual({
    width: 94,
    height: 29,
    pane: "%6",
    children: [],
  })
})

test("multiple mirrored panes retain their split and fit the smallest shared dimension", () => {
  const original = parseTmuxLayout("0000,201x40,0,0{100x40,0,0,6,100x40,101,0,9}")
  const fitted = fitTmuxLayout(
    original,
    new Map([
      ["%6", { columns: 80, rows: 24 }],
      ["%9", { columns: 40, rows: 15 }],
    ]),
  )
  expect([fitted.width, fitted.height]).toEqual([121, 15])
  expect(fitted.children.map((pane) => [pane.width, pane.height])).toEqual([
    [80, 15],
    [40, 15],
  ])
  expect(tmuxLayoutPanes(fitted)).toEqual(["%6", "%9"])
  expect(formatTmuxLayout(fitted)).toEndWith("121x15,0,0{80x15,0,0,6,40x15,81,0,9}")
})

test("vertical and nested splits retain offsets and never exceed mirrored pane constraints", () => {
  const original = parseTmuxLayout(
    "0000,201x61,0,0{100x61,0,0[100x30,0,0,6,100x30,0,31,9],100x61,101,0,12}",
  )
  const fitted = fitTmuxLayout(
    original,
    new Map([
      ["%6", { columns: 80, rows: 12 }],
      ["%9", { columns: 100, rows: 20 }],
      ["%12", { columns: 50, rows: 25 }],
    ]),
  )
  expect([fitted.width, fitted.height]).toEqual([131, 25])
  const left = fitted.children[0]!
  expect(left.width).toBe(80)
  expect(left.children[0]!.height).toBeLessThanOrEqual(12)
  expect(left.children[1]!.height).toBeLessThanOrEqual(20)
  expect(left.children[0]!.height + left.children[1]!.height + 1).toBe(25)
  expect(tmuxLayoutPanes(parseTmuxLayout(formatTmuxLayout(fitted)))).toEqual(["%6", "%9", "%12"])
})

test("malformed layouts are rejected before a source window can be changed", () => {
  for (const input of [
    "",
    "0000,0x20,0,0,6",
    "0000,80x20,0,0{40x20,0,0,6",
    "0000,80x20,0,0,6garbage",
  ])
    expect(() => parseTmuxLayout(input)).toThrow()
})

test("a zoomed agent sets the window viewport while hidden siblings keep their size limits", () => {
  const original = parseTmuxLayout("0000,201x40,0,0{100x40,0,0,6,100x40,101,0,9}")
  const fitted = fitTmuxLayout(original, new Map([["%9", { columns: 60, rows: 20 }]]), new Map(), {
    columns: 94,
    rows: 18,
  })
  expect([fitted.width, fitted.height]).toEqual([94, 18])
  expect(fitted.children[1]!.width).toBeLessThanOrEqual(60)
  expect(fitted.children[1]!.height).toBeLessThanOrEqual(20)
  expect(fitted.children[0]!.width + fitted.children[1]!.width + 1).toBe(94)
  const stacked = parseTmuxLayout("0000,100x61,0,0[100x30,0,0,6,100x30,0,31,9]")
  const shared = fitTmuxLayout(stacked, new Map([["%9", { columns: 60, rows: 20 }]]), new Map(), {
    columns: 94,
    rows: 50,
  })
  expect(shared.width).toBe(60)
  expect(shared.children[1]!.width).toBe(60)
})
