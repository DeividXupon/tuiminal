import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import {
  httpChainingRequests,
  planHttpRequestChain,
} from "../packages/feature-http/src/model/chaining"
import {
  evaluateHttpExtraction,
  previewHttpExtractions,
} from "../packages/feature-http/src/model/chain-extractions"
import { validateHttpRequestAutomation } from "../packages/feature-http/src/model/automation"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
import { createHttpPrivacyContext } from "../packages/feature-http/src/model/secrets"
import { runHttpCollectionCase } from "../packages/feature-http/src/services/collection-runner"
import { formatHttpRunReport } from "../packages/feature-http/src/cli/report"
import { responseTableFixture } from "./fixtures/http-response-table"
import type { HttpChainExtraction } from "../packages/feature-http/src/model/types"

let server: ReturnType<typeof Bun.serve> | undefined
let root: string | undefined
afterEach(async () => {
  await server?.stop(true)
  server = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture")
  return value
}
const fileItems = (path: string, source: string) => {
  const file = parseHttpFile(source, path)
  return file.requests.map((block) => ({
    filePath: path,
    request: requestFromHttpFile(file, block),
  }))
}

test("chaining resolves exact IDs and scopes legacy names to the current file", () => {
  const a = fileItems(
    "a.http",
    "### Login\n# @name login\nGET https://a.test\n### User\n# @name user\n# @depends login\nGET https://a.test/user\n",
  )
  const b = fileItems("b.http", "### Login\n# @name login\nGET https://b.test\n")
  expect(planHttpRequestChain([...b, ...a], "a.http#user").map((item) => item.request.id)).toEqual([
    "a.http#login",
    "a.http#user",
  ])
  const user = required(a[1]).request
  required(user.chain).dependsOn = "b.http#login"
  expect(planHttpRequestChain([...a, ...b], user.id).map((item) => item.request.id)).toEqual([
    "b.http#login",
    "a.http#user",
  ])
  required(user.chain).dependsOn = "missing"
  expect(() => planHttpRequestChain([...a, ...b], user.id)).toThrow("Dependência não encontrada")
})

test("chaining rejects ambiguous names and cycles before executing requests", () => {
  const a = { ...createScratchRequest("a"), name: "Login" }
  const b = { ...createScratchRequest("b"), name: "Login" }
  const user = { ...createScratchRequest("user"), chain: { dependsOn: "Login", extract: [] } }
  const items = () => httpChainingRequests([], [a, b, user])
  expect(() => planHttpRequestChain(items(), "user")).toThrow("Dependência ambígua")
  user.chain.dependsOn = "a"
  a.chain = { dependsOn: "user", extract: [] }
  expect(() => planHttpRequestChain(items(), "user")).toThrow("Ciclo de dependência")
})

test("chaining uses open drafts over the persisted request without losing other requests", () => {
  const saved = fileItems("api.http", "### Login\n# @name login\nGET https://a.test\n")
  const edited = { ...required(saved[0]).request, url: "https://edited.test" }
  const scratch = createScratchRequest("scratch", "https://scratch.test")
  const pool = httpChainingRequests(saved, [edited, scratch])
  expect(pool.map((item) => item.request.url)).toEqual([edited.url, scratch.url])
  expect(required(saved[0]).request.url).toBe("https://a.test")
})

test("header, status and disabled extraction settings round-trip without changing legacy directives", () => {
  const request = createScratchRequest("extract", "https://example.test")
  request.chain = {
    extract: [
      { name: "token", jsonPath: "$.token", secret: true },
      { name: "location", source: "header", jsonPath: "Location", secret: false },
      { name: "code", source: "status", jsonPath: "", secret: false },
      { name: "disabled", jsonPath: "$[", secret: false, enabled: false },
      { name: "spaced", jsonPath: '$["full name"]', secret: false },
      { name: "explicit", jsonPath: "$.id", secret: false, enabled: true, source: "jsonpath" },
    ],
  }
  const source = serializeHttpRequestBlock(request)
  expect(source).toContain("# @extract-secret token = $.token")
  const file = parseHttpFile(source, "api.http")
  expect(file.requests[0]?.editable).toBe(true)
  expect(requestFromHttpFile(file, required(file.requests[0])).chain).toEqual(request.chain)
  expect(validateHttpRequestAutomation(request)).toBeNull()
  const invalid = parseHttpFile(
    '# @extract-value {"name":"x","jsonPath":"x","secret":false,"source":"script"}\nGET https://example.test\n',
    "bad.http",
  )
  expect(invalid.requests[0]?.editable).toBe(false)
  const futureDirective =
    '# @extract-value {"name":"x","jsonPath":"$.id","secret":false,"future":true}\nGET https://example.test\n'
  const future = parseHttpFile(futureDirective, "future.http")
  expect(future.requests[0]?.editable).toBe(false)
  expect(future.requests[0]?.rawText).toBe(futureDirective)
})

test("extraction previews use the same sources as execution and mask secret aliases", () => {
  const document = responseTableFixture()
  if (document.execution.status !== "success") throw new Error("Missing response")
  const response = {
    ...document.execution.response,
    body: new TextEncoder().encode('{"token":"fixture-secret","name":"Alice","id":7,"items":[]}'),
    privacy: createHttpPrivacyContext(["Alice"]),
  }
  const extractions: HttpChainExtraction[] = [
    { name: "secret", jsonPath: "$.token", secret: true },
    { name: "alias", jsonPath: "$.token", secret: false },
    { name: "name", jsonPath: "$.name", secret: false },
    { name: "id", jsonPath: "$.id", secret: false },
    { name: "cookie", jsonPath: "SET-COOKIE", source: "header", secret: false },
    { name: "code", jsonPath: "", source: "status", secret: false },
    { name: "items", jsonPath: "$.items", secret: false },
  ]
  const previews = previewHttpExtractions(extractions, response)
  expect(JSON.stringify(previews)).not.toContain("fixture-secret")
  expect(JSON.stringify(previews)).not.toContain("Alice")
  expect(JSON.stringify(previews)).not.toContain("one=fixture")
  expect(previews[3]?.value).toBe("7")
  expect(previews[5]?.value).toBe("201")
  expect(previews[6]?.error).toBeTruthy()
  expect(evaluateHttpExtraction(required(extractions[4]), response)).toBe("one=fixture")
})

test("runner reuses header/status variables and ignores disabled extractions", async () => {
  root = mkdtempSync(join(tmpdir(), "tuiminal-chain-"))
  const calls: string[] = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      calls.push(url.pathname)
      if (url.pathname === "/login")
        return new Response('{"token":"fixture-token"}', {
          status: 201,
          headers: { "X-User-Id": "42", Authorization: "fixture-token" },
        })
      return Response.json({
        id: url.searchParams.get("id"),
        code: url.searchParams.get("code"),
        token: request.headers.get("authorization"),
      })
    },
  })
  const login = createScratchRequest("login", `${server.url}login`)
  login.chain = {
    extract: [
      { name: "id", source: "header", jsonPath: "x-user-id", secret: false },
      { name: "code", source: "status", jsonPath: "", secret: false },
      { name: "token", source: "header", jsonPath: "authorization", secret: false },
      { name: "ignored", jsonPath: "$[", secret: false, enabled: false },
    ],
  }
  const user = createScratchRequest("user", `${server.url}user?id={{id}}&code={{code}}`)
  user.chain = { dependsOn: "login", extract: [] }
  user.auth = { kind: "bearer", token: "{{token}}" }
  const result = await runHttpCollectionCase({
    name: "chain",
    items: httpChainingRequests([], [user, login]),
    selector: "user",
    variables: new Map(),
    root,
  })
  expect(calls).toEqual(["/login", "/user"])
  expect(result.items).toHaveLength(2)
  const body = new TextDecoder().decode(result.items[1]?.response?.body)
  expect(JSON.parse(body)).toEqual({ id: "42", code: "201", token: "Bearer fixture-token" })
  expect(formatHttpRunReport([result], "json")).not.toContain("fixture-token")
})
