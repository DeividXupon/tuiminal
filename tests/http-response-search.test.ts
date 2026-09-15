import { describe, expect, spyOn, test } from "bun:test"
import { findHttpTextMatches } from "../packages/feature-http/src/model/response"

describe("HTTP response search", () => {
  test("keeps absolute offsets and one-based positions through empty and CRLF lines", () => {
    expect(findHttpTextMatches("A\r\n\nβ A A\nA", "a")).toEqual([
      { start: 0, end: 1, line: 1, column: 1 },
      { start: 6, end: 7, line: 3, column: 3 },
      { start: 8, end: 9, line: 3, column: 5 },
      { start: 10, end: 11, line: 4, column: 1 },
    ])
  })

  test("a multiline match belongs to its starting line and is non-overlapping", () => {
    expect(findHttpTextMatches("a\nb\na\nb", "A\nB")).toEqual([
      { start: 0, end: 3, line: 1, column: 1 },
      { start: 4, end: 7, line: 3, column: 1 },
    ])
    expect(findHttpTextMatches("aaaaa", "aa")).toEqual([
      { start: 0, end: 2, line: 1, column: 1 },
      { start: 2, end: 4, line: 1, column: 3 },
    ])
    expect(findHttpTextMatches("a\nb", "\n")).toEqual([{ start: 1, end: 2, line: 1, column: 2 }])
  })

  test("empty and absent queries have no matches", () => {
    expect(findHttpTextMatches("a\nb", "")).toEqual([])
    expect(findHttpTextMatches("a\nb", "missing")).toEqual([])
  })

  test("many matches do not allocate a split of each preceding response prefix", () => {
    const source = "Alpha βeta\n".repeat(4_000)
    const split = spyOn(String.prototype, "split")
    let matches: ReturnType<typeof findHttpTextMatches>
    let splitCount: number
    try {
      matches = findHttpTextMatches(source, "alpha")
      splitCount = split.mock.calls.length
    } finally {
      split.mockRestore()
    }
    expect(matches).toHaveLength(4_000)
    expect(matches[0]).toEqual({ start: 0, end: 5, line: 1, column: 1 })
    expect(matches.at(-1)).toEqual({ start: 43_989, end: 43_994, line: 4_000, column: 1 })
    expect(splitCount).toBe(0)
  })
})
