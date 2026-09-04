import { describe, expect, test } from "bun:test"
import {
  diffHttpText,
  evaluateHttpJsonPath,
  findHttpTextMatches,
  foldHttpJson,
  withHttpLineNumbers,
} from "../src/features/http/model/response"
import {
  httpResponseOpenCommand,
  isSafeHttpResponseOpenType,
} from "../src/features/http/services/open-response"

describe("HTTP response inspection", () => {
  test("opens only explicitly safe binary types without a shell", () => {
    expect(isSafeHttpResponseOpenType("image/png")).toBe(true)
    expect(isSafeHttpResponseOpenType("application/pdf; charset=binary")).toBe(true)
    expect(isSafeHttpResponseOpenType("application/octet-stream")).toBe(false)
    expect(httpResponseOpenCommand("/tmp/a file.pdf", "darwin")).toEqual([
      "open",
      "/tmp/a file.pdf",
    ])
  })
  test("finds case-insensitive occurrences with one-based line and column", () => {
    expect(findHttpTextMatches("Alpha\nbeta ALPHA", "alpha")).toEqual([
      { start: 0, end: 5, line: 1, column: 1 },
      { start: 11, end: 16, line: 2, column: 6 },
    ])
  })

  test("adds stable line numbers without changing line content", () => {
    expect(withHttpLineNumbers("one\ntwo\nthree")).toBe("1 │ one\n2 │ two\n3 │ three")
  })

  test("folds nested JSON at a selected depth and leaves invalid JSON untouched", () => {
    const source = '{"user":{"profile":{"name":"Ada"}},"tags":["one","two"]}'
    expect(foldHttpJson(source, 1)).toContain('"user": "{…} 1 campos"')
    expect(foldHttpJson(source, 1)).toContain('"tags": "[…] 2 itens"')
    expect(foldHttpJson("{", 1)).toBe("{")
  })

  test("evaluates deterministic property and array JSON paths", () => {
    const source = '{"users":[{"full-name":"Ada"},{"full-name":"Lin"}]}'
    expect(evaluateHttpJsonPath(source, '$.users[1]["full-name"]')).toBe("Lin")
    expect(evaluateHttpJsonPath(source, "$.missing.value")).toBeUndefined()
    expect(() => evaluateHttpJsonPath(source, "$.users[*]")).toThrow("JSON path inválido")
  })

  test("produces a bounded line diff", () => {
    expect(diffHttpText("one\ntwo\nthree", "one\nchanged\nthree")).toEqual([
      { kind: "same", text: "one" },
      { kind: "add", text: "changed" },
      { kind: "remove", text: "two" },
      { kind: "same", text: "three" },
    ])
  })
})
