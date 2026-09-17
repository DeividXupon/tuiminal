import { expect, test } from "bun:test"
import { demoTextRuns } from "../scripts/readme-demo-text"

test("documentation captures retain leading indentation and gaps inside icons", () => {
  expect(demoTextRuns("         ▄     ▄██   ")).toEqual([
    { text: "▄", column: 9, width: 1 },
    { text: "▄██", column: 15, width: 3 },
  ])
  expect(demoTextRuns("    ")).toEqual([])
})

test("documentation text positions account for wide graphemes rather than string length", () => {
  expect(demoTextRuns("  表 👨‍💻  ✓")).toEqual([
    { text: "表", column: 2, width: 2 },
    { text: "👨‍💻", column: 5, width: 2 },
    { text: "✓", column: 9, width: 1 },
  ])
})
