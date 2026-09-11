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
import { COLORS } from "../src/core/settings/theme"
import { buildHttpJsonDocument } from "../src/features/http/ui/http-json-document"

describe("HTTP response inspection", () => {
  test("renders formatted JSON tokens with semantic colors and a selected block", () => {
    const document = buildHttpJsonDocument(
      {
        selectedPath: "",
        selectedLine: 0,
        nodes: [{ path: "", parentPath: null, line: 0, childCount: 1, collapsed: false }],
        lines: [
          {
            path: "",
            tokens: [
              { text: "▾ ", kind: "marker" },
              { text: "{", kind: "punctuation" },
            ],
          },
          {
            path: null,
            tokens: [
              { text: '  "answer"', kind: "property" },
              { text: ": ", kind: "punctuation" },
              { text: "42", kind: "number" },
            ],
          },
          { path: null, tokens: [{ text: "}", kind: "punctuation" }] },
        ],
      },
      { palette: COLORS, lineNumbers: false, focused: true },
    )
    expect(document.chunks.map((chunk) => chunk.text).join("")).toBe('▾ {\n  "answer": 42\n}')
    expect(
      new Set(document.chunks.flatMap((chunk) => (chunk.fg ? [chunk.fg] : []))).size,
    ).toBeGreaterThan(2)
    expect(new Set(document.chunks.flatMap((chunk) => (chunk.bg ? [chunk.bg] : []))).size).toBe(2)
  })

  test("opens only allowlisted raster signatures without a shell", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    expect(isSafeHttpResponseOpenType("image/png", png)).toBe(true)
    expect(isSafeHttpResponseOpenType("image/jpeg; charset=binary", jpeg)).toBe(true)
    expect(isSafeHttpResponseOpenType("image/png", new TextEncoder().encode("<svg>"))).toBe(false)
    expect(
      isSafeHttpResponseOpenType(
        "image/svg+xml",
        new TextEncoder().encode("<svg onload='alert(1)'>"),
      ),
    ).toBe(false)
    expect(
      isSafeHttpResponseOpenType("application/pdf", new TextEncoder().encode("%PDF-1.7")),
    ).toBe(false)
    expect(isSafeHttpResponseOpenType("application/octet-stream", png)).toBe(false)
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
