import { expect, test } from "bun:test"
import {
  connectionEnvironmentCompletion,
  expandConnectionEnvironment,
  resolveConnectionDraft,
} from "../packages/feature-database/src/model/connection-environment"
import { preserveConnectionReferences } from "../packages/feature-database/src/services/connection-environment"
import type { DatabaseConnectionDraft } from "../packages/feature-database/src/model/types"
import { translateUi } from "../packages/core/src/i18n/index"

const draft: DatabaseConnectionDraft = {
  name: "Fixture",
  driver: "postgres",
  host: "{DB_HOST}",
  portExpression: "{DB_PORT}",
  database: "app_{DB_NAME}",
  username: "{DB_USER}",
  ssl: false,
  writeEnabled: false,
}
const environment = {
  DB_HOST: "fixture.invalid",
  DB_PORT: "5432",
  DB_NAME: "test",
  DB_USER: "fixture",
}

test("connection references resolve once, preserving literal and empty values", () => {
  expect(
    expandConnectionEnvironment("{A}/{B}/{EMPTY}", { A: "{B}", B: "$() `test`", EMPTY: "" }),
  ).toBe("{B}/$() `test`/")
  expect(() => expandConnectionEnvironment("{MISSING}", {})).toThrow("MISSING")
  expect(() => expandConnectionEnvironment("{toString}", {})).toThrow("toString")
  expect(expandConnectionEnvironment("literal {123} and {unfinished", {})).toBe(
    "literal {123} and {unfinished",
  )
})

test("network fields resolve and metadata preserves references without expanded values", () => {
  const resolved = resolveConnectionDraft(draft, environment)
  expect(resolved).toMatchObject({
    host: "fixture.invalid",
    port: 5432,
    database: "app_test",
    username: "fixture",
  })
  const saved = preserveConnectionReferences(draft, resolved)
  expect(saved).toEqual(draft)
  expect(JSON.stringify(saved)).not.toContain("fixture.invalid")
  expect(resolveConnectionDraft(saved, { ...environment, DB_PORT: "5433" }).port).toBe(5433)
})

test.each(["wrong", "5432oops", "1.5", "", "Infinity"])(
  "rejects invalid port expression %s",
  (DB_PORT) => {
    expect(() => resolveConnectionDraft(draft, { ...environment, DB_PORT })).toThrow("porta")
  },
)

test("SQLite and MCP resolve only fields belonging to their driver", () => {
  expect(
    resolveConnectionDraft(
      { ...draft, driver: "sqlite", filename: "{ROOT}/fixture.sqlite" },
      { ROOT: "/tmp" },
    ),
  ).toMatchObject({ filename: "/tmp/fixture.sqlite" })
  expect(
    resolveConnectionDraft(
      { ...draft, driver: "mcp-mysql", command: "{ROOT}/fixture" },
      { ROOT: "/tmp" },
    ),
  ).toMatchObject({ command: "/tmp/fixture" })
})

test("completion filters names and replaces the whole reference at the cursor", () => {
  const names = ["DB_USER", "DB_HOST", "OTHER"]
  expect(connectionEnvironmentCompletion("prefix/{DB", 10, names)).toEqual({
    start: 7,
    end: 10,
    suggestions: ["DB_HOST", "DB_USER"],
  })
  expect(connectionEnvironmentCompletion("{DB_HOST}/suffix", 3, names)).toEqual({
    start: 0,
    end: 9,
    suggestions: ["DB_HOST", "DB_USER"],
  })
  expect(connectionEnvironmentCompletion("{UNKNOWN", 8, names)).toBeNull()
  expect(connectionEnvironmentCompletion("{DB_HOST}", 9, names)).toBeNull()
})

test("missing variable diagnostics are translated without translating its name", () => {
  expect(translateUi("Variável de ambiente não definida: DB_HOST", "en")).toBe(
    "Environment variable is not defined: DB_HOST",
  )
})
