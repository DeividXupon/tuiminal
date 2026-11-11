import { expect, test } from "bun:test"
import { COLORS } from "../packages/core/src/settings/theme"
import { displayWidth, translateUi } from "../packages/core/src/i18n"
import { httpResponseTableData } from "../packages/feature-http/src/ui/http-response-table-data"
import {
  buildHttpResponseTableDocument,
  findHttpResponseTableMatches,
} from "../packages/feature-http/src/ui/http-response-table-document"
import { httpResponseCopyContent } from "../packages/feature-http/src/ui/http-response-content"
import { responseTableFixture, responseTableCookies } from "./fixtures/http-response-table"

test("tables preserve duplicate headers and find values across wrapped Unicode cells", () => {
  const document = { ...responseTableFixture(), responseView: "headers" as const }
  const data = httpResponseTableData(document, [])
  if (!data) throw new Error("No table")
  expect(data.rows.filter((row) => row[0]?.text === "set-cookie")).toHaveLength(2)
  for (const width of [24, 47, 95]) {
    const rendered = buildHttpResponseTableDocument(data, width, COLORS)
    expect(rendered.plain.split("\n").every((line) => displayWidth(line) <= width)).toBe(true)
    expect(rendered.plain).not.toContain("�")
    const matches = findHttpResponseTableMatches(rendered, "continuous-searchable-identifier")
    expect(matches).toHaveLength(1)
    expect(matches[0]?.copyLine).toContain("long-continuous-searchable-identifier-中文-👩‍💻-ending")
    expect(rendered.plain.split("\n")[(matches[0]?.line ?? 0) - 1]).toBeDefined()
    expect(httpResponseCopyContent(document, [])).toContain(
      "set-cookie: one=fixture\nset-cookie: two=fixture",
    )
  }
})

test("cookie tables and their copied content keep values masked", () => {
  const document = responseTableFixture()
  document.responseView = "more"
  document.responsePresentation.moreView = "cookies"
  const data = httpResponseTableData(document, responseTableCookies)
  expect(JSON.stringify(data)).not.toContain("PRIVATE_COOKIE_FIXTURE")
  expect(httpResponseCopyContent(document, responseTableCookies)).not.toContain(
    "PRIVATE_COOKIE_FIXTURE",
  )
  expect(JSON.stringify(data)).toContain("SameSite: strict")
  expect(JSON.stringify(data)).toContain(`HttpOnly: ${translateUi("sim")}`)
})

test("timing percentages use measured total and zero durations never fabricate a percentage", () => {
  const document = responseTableFixture()
  document.responseView = "timing"
  expect(httpResponseTableData(document, [])?.rows.map((row) => row[2]?.text)).toEqual([
    "25%",
    "75%",
    "100%",
  ])
  if (document.execution.status !== "success") throw new Error("Missing response")
  document.execution.response.timings = { headersMs: 0, downloadMs: 0, totalMs: 0 }
  expect(httpResponseTableData(document, [])?.rows.map((row) => row[2]?.text)).toEqual([
    "—",
    "—",
    "—",
  ])
})

test("large table previews are bounded while copying retains full data", () => {
  const document = responseTableFixture()
  document.responseView = "raw"
  const text = "x".repeat(90_000)
  if (document.execution.status !== "success") throw new Error("Missing response")
  document.execution.response.body = new TextEncoder().encode(text)
  document.execution.response.capturedBytes = text.length
  const data = httpResponseTableData(document, [], text)
  if (!data) throw new Error("No table")
  const rendered = buildHttpResponseTableDocument(data, 60, COLORS)
  expect(rendered.limited).toBe(true)
  expect(rendered.plain.length).toBeLessThanOrEqual(50_000)
  expect(rendered.plain).toContain(
    translateUi("EXIBIÇÃO LIMITADA · Copiar preserva todos os dados desta aba.").split(" · ")[0] ??
      "",
  )
  expect(httpResponseCopyContent(document, [])).toBe(text)
})

test("assertions and diagnostics carry semantic colors without translating user values", () => {
  const document = responseTableFixture()
  document.responseView = "more"
  document.responsePresentation.moreView = "assertions"
  if (document.execution.status !== "success") throw new Error("No response")
  const response = document.execution.response
  response.assertions = [
    { id: "ok", expression: "fixture == sim", actual: "sim", passed: true, message: "" },
    { id: "fail", expression: "fixture == não", actual: "não", passed: false, message: "Mismatch" },
  ]
  const table = httpResponseTableData(document, [])
  expect(table?.rows.map((row) => row[0]?.tone)).toEqual(["success", "danger"])
  expect(table?.rows[0]?.[2]?.text).toBe("sim")
  expect(table?.rows[1]?.[2]?.text).toContain("não")
  response.truncated = true
  document.revision++
  document.responsePresentation.moreView = "console"
  const diagnostics = httpResponseTableData(document, [])
  expect(diagnostics?.rows.map((row) => row[0]?.tone)).toEqual([
    "focus",
    "warning",
    "warning",
    "danger",
  ])
})
