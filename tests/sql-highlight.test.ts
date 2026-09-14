import { describe, expect, test } from "bun:test"
import {
  getSqlHighlightSpans,
  sqlEditorGutterWidth,
  sqlEditorLineCount,
  type SqlHighlightGroup,
} from "../packages/feature-database/src/rendering/sql-highlight"

function highlightedTokens(sql: string, dialect: "mysql" | "postgres" | "sqlite") {
  const lines = sql.split("\n")
  return getSqlHighlightSpans(sql, dialect).map((span) => ({
    group: span.group,
    text: lines[span.line]?.slice(span.start, span.end) ?? "",
  }))
}

function expectToken(
  tokens: Array<{ group: SqlHighlightGroup; text: string }>,
  text: string,
  group: SqlHighlightGroup,
) {
  expect(tokens).toContainEqual({ text, group })
}

describe("SQL syntax highlighting", () => {
  test("counts editor lines and expands the line-number gutter", () => {
    expect(sqlEditorLineCount("")).toBe(1)
    expect(sqlEditorLineCount("SELECT 1;\nSELECT 2;\n")).toBe(3)
    expect(sqlEditorGutterWidth(Array.from({ length: 9 }, () => "SELECT 1").join("\n"))).toBe(3)
    expect(sqlEditorGutterWidth(Array.from({ length: 10 }, () => "SELECT 1").join("\n"))).toBe(4)
    expect(sqlEditorGutterWidth(Array.from({ length: 100 }, () => "SELECT 1").join("\n"))).toBe(5)
  })

  test("classifies common SQL tokens", () => {
    const tokens = highlightedTokens(
      'SELECT "name", COUNT(*) FROM users WHERE id = $1 AND active = TRUE; -- note',
      "postgres",
    )

    expectToken(tokens, "SELECT", "keyword")
    expectToken(tokens, '"name"', "property")
    expectToken(tokens, "COUNT", "function")
    expectToken(tokens, "$1", "constant")
    expectToken(tokens, "TRUE", "constant")
    expectToken(tokens, "-- note", "comment")
  })

  test("keeps multiline comments and dollar-quoted strings highlighted", () => {
    const tokens = highlightedTokens(
      "/* first\nsecond */ SELECT $tag$hello\nworld$tag$;",
      "postgres",
    )

    expectToken(tokens, "/* first", "comment")
    expectToken(tokens, "second */", "comment")
    expectToken(tokens, "$tag$hello", "string")
    expectToken(tokens, "world$tag$", "string")
  })

  test("supports MySQL hash comments without applying them to SQLite", () => {
    expectToken(highlightedTokens("SELECT 1 # note", "mysql"), "# note", "comment")
    expect(highlightedTokens("SELECT 1 # note", "sqlite")).not.toContainEqual({
      text: "# note",
      group: "comment",
    })
  })
})
