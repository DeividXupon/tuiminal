import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import {
  createHttpErrorHistoryEntry,
  createHttpSuccessHistoryEntry,
} from "../packages/feature-http/src/model/history"
import {
  combineHttpPrivacy,
  createHttpPrivacyContext,
  requestHttpPrivacy,
} from "../packages/feature-http/src/model/secrets"
import { runHttpCollectionCase } from "../packages/feature-http/src/services/collection-runner"
import { formatHttpRunReport } from "../packages/feature-http/src/cli/report"
import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../packages/feature-http/src/model/workspace"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"
import { executePreparedHttpRequest } from "../packages/feature-http/src/services/fetch-transport"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "../packages/feature-http/src/storage/config"
import {
  loadHttpHistory,
  persistHttpHistoryEntry,
} from "../packages/feature-http/src/storage/history"

const secret = "ALPHA_FAKE_HTTP_PRIVATE_VALUE_42"
const roots: string[] = []
let server: ReturnType<typeof Bun.serve> | undefined
const config = {
  ...DEFAULT_HTTP_WORKSPACE_CONFIG,
  history: { persistMetadata: true, persistBodies: true },
}

async function temporaryRoot() {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-private-history-"))
  roots.push(root)
  return root
}

async function historySource(root: string) {
  return readFile(resolve(root, ".tuiminal/http/history.json"), "utf8")
}

function present<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("Expected HTTP fixture value")
  return value
}

afterEach(async () => {
  await server?.stop(true)
  server = undefined
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })))
})

test.each([false, true])(
  "a private value under an ordinary query/path name never reaches persistent history (bodies=%s)",
  async (persistBodies) => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-private-history-"))
    roots.push(root)
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/start")
          return new Response(null, {
            status: 302,
            headers: { location: `/done/${secret}?q=${secret}` },
          })
        return new Response(JSON.stringify({ value: secret }), {
          headers: { "content-type": "application/json", "x-debug": secret },
        })
      },
    })
    const request = createScratchRequest("private")
    request.url = `http://127.0.0.1:${server.port}/start?q={{private_value}}`
    const variables = new Map([
      ["private_value", { value: secret, origin: "private" as const, secret: true }],
    ])
    const response = await executePreparedHttpRequest(
      prepareHttpRequest(request, "private-run", 0, variables, root),
    )
    const document = present(createHttpWorkspaceState(request).documents[0])
    const entry = createHttpSuccessHistoryEntry(document, response, "local")
    const config = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies },
    }
    await persistHttpHistoryEntry(root, config, entry)
    const source = await readFile(resolve(root, ".tuiminal/http/history.json"), "utf8")
    expect(source).not.toContain(secret)
    expect(source).not.toContain(Buffer.from(secret).toString("base64"))
    const loaded = await loadHttpHistory(root, config)
    expect(loaded[0]?.response?.body).toBeUndefined()
    expect(loaded[0]?.bodyDiscarded).toBe(true)
    expect(JSON.stringify(entry.response?.headers)).not.toContain(secret)
    // The active response stays exact and available in memory for inspection/export.
    expect(new TextDecoder().decode(response.body)).toContain(secret)
  },
)

test("privacy redacts common encodings without serializing a secret bag", () => {
  const value = 'FAKE ação/with space&"value+tail'
  const privacy = createHttpPrivacyContext([value])
  const encoded = encodeURIComponent(value)
  const mixed = encoded.replace(/%[0-9A-F]{2}/g, (part, index) =>
    index % 2 ? part.toLowerCase() : part,
  )
  for (const form of [
    value,
    encoded,
    mixed,
    encodeURIComponent(encoded),
    encoded.replaceAll("%20", "+"),
    JSON.stringify(value).slice(1, -1),
  ]) {
    expect(privacy.redactText(`before ${form} after`)).toBe("before <redacted> after")
    expect(privacy.redactUrl(`https://example.test/${form}?q=${form}`)).not.toContain(form)
  }
  expect(JSON.stringify({ privacy })).toBe("{}")
  expect(Object.values(privacy)).not.toContain(value)
  expect(createHttpPrivacyContext(["broken\ud800secret"]).redactText("broken\ud800secret")).toBe(
    "<redacted>",
  )
})

test("literal auth, URL userinfo and sensitive fields follow the same history policy", async () => {
  const request = createScratchRequest("literal-auth")
  request.url = `https://fake-user:${secret}@example.test/?password=${secret}`
  request.auth = { kind: "basic", username: "fixture", password: secret }
  request.headers = [
    {
      id: "h",
      enabled: true,
      name: "X-Custom-Credential",
      value: secret,
      sensitivity: "literal-secret",
    },
  ]
  const privacy = requestHttpPrivacy(request)
  expect(privacy.hasSecrets).toBe(true)
  const encoded = Buffer.from(`fixture:${secret}`).toString("base64")
  const document = present(createHttpWorkspaceState(request).documents[0])
  const entry = createHttpErrorHistoryEntry(
    document,
    "literal",
    `failure ${request.url} Basic ${encoded}`,
    null,
    1,
    privacy,
  )
  expect(JSON.stringify(entry)).not.toContain(secret)
  expect(JSON.stringify(entry)).not.toContain("fake-user")
  expect(JSON.stringify(entry)).not.toContain(encoded)
  const root = await temporaryRoot()
  await persistHttpHistoryEntry(root, config, entry)
  expect(await historySource(root)).not.toContain(secret)
})

test("private extractions protect both the login and its dependents, including assertions and reports", async () => {
  const root = await temporaryRoot()
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url)
      return Response.json(
        url.pathname === "/login" ? { token: secret } : { echoed: url.searchParams.get("q") },
      )
    },
  })
  const login = createScratchRequest("login")
  login.name = "Login"
  login.url = `http://127.0.0.1:${server.port}/login`
  login.chain = { extract: [{ name: "login_value", jsonPath: "$.token", secret: true }] }
  login.assertions = [{ id: "a", expression: "jsonpath $.token exists" }]
  const dependent = createScratchRequest("dependent")
  dependent.url = `http://127.0.0.1:${server.port}/data?q={{login_value}}`
  dependent.chain = { dependsOn: "Login", extract: [] }
  dependent.assertions = [{ id: "a", expression: "jsonpath $.echoed exists" }]
  const items = [dependent, login].map((request) => ({ request, filePath: "" }))
  const result = await runHttpCollectionCase({ name: "chain", items, variables: new Map(), root })
  expect(result.items.map((item) => item.requestId)).toEqual(["login", "dependent"])
  for (const item of result.items) {
    expect(item.error).toBeUndefined()
    expect(item.privacy?.hasSecrets).toBe(true)
    const response = present(item.response)
    expect(new TextDecoder().decode(response.body)).toContain(secret)
    const original = present(items.find((candidate) => candidate.request.id === item.requestId))
    const document = present(createHttpWorkspaceState(original.request).documents[0])
    const entry = createHttpSuccessHistoryEntry(document, response, "local")
    expect(JSON.stringify(entry.response?.assertions)).not.toContain(secret)
    await persistHttpHistoryEntry(root, config, entry)
  }
  for (const kind of ["json", "text", "junit"] as const)
    expect(formatHttpRunReport([result], kind)).not.toContain(secret)
  expect(await historySource(root)).not.toContain(secret)
  expect(
    (await loadHttpHistory(root, config)).every(
      (entry) => entry.bodyDiscarded && !entry.response?.body,
    ),
  ).toBe(true)
})

test("redirect cookies and transport diagnostics stay private when a later hop fails", async () => {
  const root = await temporaryRoot()
  const request = createScratchRequest("failure")
  request.url = "http://fixture.test/start"
  const fakeFetch = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: `http://fixture.test/${secret}`,
          "set-cookie": `session=${secret}; Path=/`,
        },
      }),
    )
    .mockRejectedValueOnce(new Error(`fixture transport failed at ${secret}`))
  try {
    const result = await runHttpCollectionCase({
      name: "failure",
      items: [{ request, filePath: "" }],
      variables: new Map(),
      root,
    })
    const item = present(result.items[0])
    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(item.error?.message).toContain("<redacted>")
    expect(item.error?.message).not.toContain(secret)
    expect(item.privacy?.hasSecrets).toBe(true)
    const document = present(createHttpWorkspaceState(request).documents[0])
    const entry = createHttpErrorHistoryEntry(
      document,
      "error",
      present(item.error).message,
      null,
      1,
      item.privacy,
    )
    await persistHttpHistoryEntry(root, config, entry)
    expect(await historySource(root)).not.toContain(secret)
  } finally {
    fakeFetch.mockRestore()
  }
})

test("a cookie learned only from the response keeps echoed bodies off disk", async () => {
  const root = await temporaryRoot()
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(secret, { headers: { "set-cookie": `session=${secret}; Path=/` } }),
  })
  const request = createScratchRequest("cookie")
  request.url = `http://127.0.0.1:${server.port}/`
  const response = await executePreparedHttpRequest(prepareHttpRequest(request, "cookie", 0))
  const document = present(createHttpWorkspaceState(request).documents[0])
  const entry = createHttpSuccessHistoryEntry(document, response, null)
  await persistHttpHistoryEntry(root, config, entry)
  expect((await loadHttpHistory(root, config))[0]?.bodyDiscarded).toBe(true)
  expect(await historySource(root)).not.toContain(Buffer.from(secret).toString("base64"))
  expect(response.headers).toContainEqual(["set-cookie", `session=${secret}; Path=/`])
})

test("secrets from different request scopes survive shadowing without mutating the active response", async () => {
  const firstSecret = "FAKE_PARENT_SECRET"
  const secondSecret = "FAKE_CHILD_SECRET"
  const root = await temporaryRoot()
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(`${firstSecret} ${secondSecret}`),
  })
  const first = createScratchRequest("first")
  first.name = "First"
  first.url = `http://127.0.0.1:${server.port}/?q={{key}}`
  const second = {
    ...createScratchRequest("second"),
    url: first.url,
    chain: { dependsOn: "First", extract: [] },
  }
  const result = await runHttpCollectionCase({
    name: "scopes",
    root,
    items: [first, second].map((request) => ({ request, filePath: "" })),
    variables: new Map(),
    variablesForRequest: (request) =>
      new Map([
        [
          "key",
          {
            origin: "private",
            secret: true,
            value: request.id === "first" ? firstSecret : secondSecret,
          },
        ],
      ]),
  })
  const item = present(result.items[1])
  expect(item.privacy?.redactText(`${firstSecret} ${secondSecret}`)).toBe("<redacted> <redacted>")
  expect(new TextDecoder().decode(present(item.response).body)).toBe(
    `${firstSecret} ${secondSecret}`,
  )
})

test("combining repeated privacy contexts stays flat and does not repeat redaction work", () => {
  const context = createHttpPrivacyContext([secret])
  const spy = spyOn({ redact: context.redactText }, "redact")
  const counted = { ...context, redactText: spy }
  let combined = combineHttpPrivacy(counted)
  for (let index = 0; index < 1_000; index++) combined = combineHttpPrivacy(combined, counted)
  expect(combined.redactText(secret)).toBe("<redacted>")
  expect(spy).toHaveBeenCalledTimes(1)
  expect(JSON.stringify({ combined })).toBe("{}")
})

test("a failed environment resolver never publishes its raw diagnostic", async () => {
  const request = createScratchRequest("resolver")
  const result = await runHttpCollectionCase({
    name: "resolver",
    root: await temporaryRoot(),
    items: [{ request, filePath: "" }],
    variables: new Map(),
    variablesForRequest: () => {
      throw new Error(`fixture resolver: ${secret}`)
    },
  })
  const item = present(result.items[0])
  expect(item.error?.message).toBe(
    "Não foi possível preparar a requisição com o ambiente selecionado.",
  )
  expect(formatHttpRunReport([result], "json")).not.toContain(secret)
})

test("literal API keys in ordinary query names and password form fields are private", () => {
  const request = createScratchRequest("query-auth")
  request.url = "https://example.test/"
  request.auth = { kind: "api-key", name: "q", value: secret, placement: "query" }
  const prepared = prepareHttpRequest(request, "query-auth", 0)
  expect(prepared.url).toContain(`q=${secret}`)
  expect(prepared.privacy?.redactUrl(prepared.url)).not.toContain(secret)
  request.auth = { kind: "none" }
  request.body.form = [
    { id: "f", name: "password", value: secret, enabled: true, sensitivity: "normal" },
  ]
  expect(requestHttpPrivacy(request).redactText(secret)).toBe("<redacted>")
})

test("private assertion reports do not persist an encoded response body as actual", async () => {
  const encodedBody = Buffer.from(JSON.stringify({ private: secret })).toString("base64")
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(encodedBody) })
  const request = createScratchRequest("encoded-response")
  request.url = `http://127.0.0.1:${server.port}/`
  request.assertions = [{ id: "body", expression: "body contains expected" }]
  const result = await runHttpCollectionCase({
    name: "encoded-response",
    root: await temporaryRoot(),
    items: [{ request, filePath: "" }],
    variables: new Map([["private_value", { origin: "private", secret: true, value: secret }]]),
  })
  expect(result.items[0]?.response?.assertions?.[0]?.actual).toBe(encodedBody)
  expect(formatHttpRunReport([result], "json")).not.toContain(encodedBody)
})
