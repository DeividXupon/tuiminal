import { expect, test } from "bun:test"
import { renderedTabColumn } from "../scripts/benchmarks/tui-tabs"

test("tab benchmarks locate clean and decorated header labels at the same column", () => {
  for (const first of [" ", "+", ":", "."]) {
    for (const second of [" ", "+", ":", "."]) {
      const frame = ` ◆ TUIMINAL  ◇ Git [Alt+2]  ◆${first}Runner${second}[Alt+3] \nbody`
      expect(renderedTabColumn(frame, "3", "Runner")).toBe(28)
      expect(renderedTabColumn(frame, "3", "Runner", true)).toBe(28)
    }
  }
})

test("tab benchmarks require the selected marker and exact label and shortcut", () => {
  const frame = " ◇ Git:[Alt+2]  ◆:Runner.[Alt+3] "
  expect(renderedTabColumn(frame, "2", "Git")).toBe(1)
  expect(renderedTabColumn(frame, "2", "Git", true)).toBe(-1)
  expect(renderedTabColumn(frame, "2", "Runner", true)).toBe(-1)
  expect(renderedTabColumn(frame, "3", "Git", true)).toBe(-1)
  for (const invalid of [
    "◆XRunner [Alt+3]",
    "◆ RunnerX[Alt+3]",
    "◆ Run.er [Alt+3]",
    "◆ Runner [Alt:3]",
    "◆ Runner [Alt+30]",
    "◇ Runner [Alt+3]",
    "◆  Runner [Alt+3]",
    "◆ Runner[Alt+3]",
    "header\n◆ Runner [Alt+3]",
  ]) {
    expect(renderedTabColumn(invalid, "3", "Runner", true)).toBe(-1)
  }
})
