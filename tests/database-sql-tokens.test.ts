import { describe, expect, test } from "bun:test"
import { sqlTokens } from "../src/features/database/model/sql-tokens"

describe("conservative SQL tokenization", () => {
  test("keeps quoted text opaque and records exact source spans", () => {
    const sql = `SELECT 'a'';FROM', "odd""name", $$--not a comment$$, $tag$/*literal*/$tag$ /* FROM */ FROM users;`
    const tokens = sqlTokens(sql)
    expect(tokens).not.toBeNull()
    expect(tokens?.filter((token) => token.kind === "word").map((token) => token.value)).toEqual([
      "SELECT",
      "FROM",
      "users",
    ])
    expect(tokens?.find((token) => token.kind === "quoted")?.value).toBe('odd"name')
    for (const token of tokens ?? []) expect(sql.slice(token.start, token.end)).toBe(token.raw)
  })

  test.each([
    "SELECT 'unfinished",
    'SELECT "unfinished',
    "SELECT $$unfinished",
    "SELECT 1 /* unfinished",
    "SELECT 1 /* nested /* inner */ outer */",
    "SELECT 1 /*! + 1 */",
    "SELECT 1 /*M! + 1 */",
    "SELECT 1 --mysql_mode_dependent",
    "SELECT 'mode-dependent\\'literal'",
  ])("does not guess incomplete or dialect-dependent syntax: %s", (sql) => {
    expect(sqlTokens(sql)).toBeNull()
  })

  test("recognizes MySQL hash comments only for MySQL", () => {
    expect(
      sqlTokens("SELECT 1 # hidden\nFROM users", "mysql")?.some(
        (token) => token.value === "hidden",
      ),
    ).toBe(false)
    expect(
      sqlTokens("SELECT 1 # visible", "postgres")?.some((token) => token.value === "visible"),
    ).toBe(true)
  })
})
