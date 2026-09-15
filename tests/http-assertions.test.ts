import { describe, expect, test } from "bun:test"
import { evaluateHttpAssertions } from "../packages/feature-http/src/model/assertions"
import { validateHttpRequestAutomation } from "../packages/feature-http/src/model/automation"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
import type { HttpResponseSnapshot } from "../packages/feature-http/src/model/types"

const response: HttpResponseSnapshot = {
  executionId: "execution",
  requestId: "request",
  requestRevision: 0,
  url: "https://example.test/users/42",
  status: 200,
  statusText: "OK",
  headers: [["content-type", "application/json"]],
  body: new TextEncoder().encode('{"id":42,"name":"Tuiminal"}'),
  bodyKind: "json",
  contentType: "application/json",
  capturedBytes: 27,
  truncated: false,
  encoding: "utf-8",
  redirects: [],
  timings: { headersMs: 1, downloadMs: 1, totalMs: 2 },
}

describe("HTTP assertions", () => {
  test("evaluates status, header, body, JSONPath and invalid expressions", () => {
    const results = evaluateHttpAssertions(
      [
        { id: "status", expression: "status == 200" },
        { id: "header", expression: "header Content-Type contains json" },
        { id: "body", expression: "body contains Tuiminal" },
        { id: "path", expression: "jsonpath $.id == 42" },
        { id: "missing", expression: "jsonpath $.missing exists" },
        { id: "invalid", expression: "something impossible" },
      ],
      response,
    )
    expect(results.map((result) => result.passed)).toEqual([true, true, true, true, false, false])
  })

  test("round-trips assertions and in-memory chaining directives in .http", () => {
    const source = `### User\n# @name user\n# @depends login\n# @extract-secret token = $.token\n# @assert status == 200\nGET https://example.test/users\n`
    const file = parseHttpFile(source, "api.http")
    const request = requestFromHttpFile(file, file.requests[0]!)
    expect(request.chain).toEqual({
      dependsOn: "login",
      extract: [{ name: "token", jsonPath: "$.token", secret: true }],
    })
    expect(request.assertions?.[0]?.expression).toBe("status == 200")
    expect(serializeHttpRequestBlock(request)).toContain("# @extract-secret token = $.token")
    expect(serializeHttpRequestBlock(request)).toContain("# @assert status == 200")
  })

  test("validates editable assertions and extracted variables before save or send", () => {
    const file = parseHttpFile("GET https://example.test\n", "api.http")
    const request = requestFromHttpFile(file, file.requests[0]!)
    request.assertions = [{ id: "assertion", expression: "not supported" }]
    expect(validateHttpRequestAutomation(request)).toContain("Assertion inválida")
    request.assertions = [{ id: "assertion", expression: "status == 204" }]
    request.chain = {
      extract: [{ name: "token", jsonPath: "$.token", secret: true }],
    }
    expect(validateHttpRequestAutomation(request)).toBeNull()
    request.chain.extract.push({ name: "token", jsonPath: "$.other", secret: false })
    expect(validateHttpRequestAutomation(request)).toContain("duplicada")
    request.chain.extract[1] = { name: "other", jsonPath: "$[", secret: false }
    expect(validateHttpRequestAutomation(request)).toContain("JSONPath inválido")
  })
})
