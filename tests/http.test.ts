import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { executePreparedHttpRequest } from "../packages/feature-http/src/services/fetch-transport"
import {
  HttpRequestValidationError,
  HTTP_REQUEST_LIMITS,
  normalizeHttpProxyUrl,
  normalizeHttpUrl,
  prepareHttpRequest,
} from "../packages/feature-http/src/services/request-builder"
import {
  classifyResponseBody,
  readLimitedResponseBody,
  responseBodyText,
  sanitizeTerminalText,
} from "../packages/feature-http/src/services/response-reader"
import {
  fetchWithHttpRedirects,
  HttpRedirectError,
} from "../packages/feature-http/src/services/redirects"
import {
  HTTP_COOKIE_LIMITS,
  HttpCookieJar,
  HttpCookieJarStore,
} from "../packages/feature-http/src/services/cookies"
import { downloadCompleteHttpResponse } from "../packages/feature-http/src/services/download"
import { createHttpVariableContext } from "../packages/feature-http/src/model/variables"
import { createHttpPreparedRequestPreview } from "../packages/feature-http/src/services/request-preview"
import { applyHttpWorkspaceConfig } from "../packages/feature-http/src/storage/config"
import {
  httpInsecureTlsApproval,
  HttpInsecureTlsApprovalError,
} from "../packages/feature-http/src/model/tls-policy"

describe("HTTP request preparation", () => {
  test("normalizes hostnames and only accepts HTTP protocols", () => {
    expect(normalizeHttpUrl(" localhost:8000/api ").toString()).toBe("http://localhost:8000/api")
    expect(normalizeHttpUrl("https://example.com/path").toString()).toBe("https://example.com/path")
    expect(() => normalizeHttpUrl(" ")).toThrow("Informe uma URL")
    expect(() => normalizeHttpUrl("file:///tmp/data.json")).toThrow("HTTP ou HTTPS")
  })

  test("rejects oversized URLs, headers, fields, and bodies before transport", () => {
    const tooManyHeaders = createScratchRequest("headers", "https://example.test")
    tooManyHeaders.headers = Array.from(
      { length: HTTP_REQUEST_LIMITS.headers + 1 },
      (_, index) => ({
        id: `header-${index}`,
        enabled: true,
        name: `X-Header-${index}`,
        value: "value",
        sensitivity: "normal" as const,
      }),
    )
    expect(() => prepareHttpRequest(tooManyHeaders, "headers", 0)).toThrow("200 headers")

    const longUrl = createScratchRequest(
      "url",
      `https://example.test/${"x".repeat(HTTP_REQUEST_LIMITS.urlBytes)}`,
    )
    expect(() => prepareHttpRequest(longUrl, "url", 0)).toThrow("16 KB")

    const body = createScratchRequest("body", "https://example.test")
    body.method = "POST"
    body.body = { kind: "text", text: "x".repeat(HTTP_REQUEST_LIMITS.bodyBytes + 1), form: [] }
    expect(() => prepareHttpRequest(body, "body", 0)).toThrow("8 MB")
  })

  test("normalizes and resolves an explicit proxy without exposing private credentials", () => {
    expect(normalizeHttpProxyUrl("proxy.test:8080")).toBe("http://proxy.test:8080/")
    expect(() => normalizeHttpProxyUrl("ftp://proxy.test")).toThrow("HTTP ou HTTPS")
    const request = createScratchRequest("proxy", "https://example.test")
    request.options.proxy = "{{proxyUrl}}"
    const variables = createHttpVariableContext([
      {
        origin: "private",
        values: { proxyUrl: "http://proxy-user:proxy-secret@proxy.test:8080" },
        secret: true,
      },
    ])
    const prepared = prepareHttpRequest(request, "proxy-execution", 0, variables)
    expect(prepared.proxyUrl).toBe("http://proxy-user:proxy-secret@proxy.test:8080/")
    const preview = createHttpPreparedRequestPreview({
      sourceRequest: request,
      effectiveRequest: request,
      revision: 0,
      variables,
    })
    expect(preview.ok).toBe(true)
    expect(JSON.stringify(preview)).not.toContain("proxy-secret")
    if (preview.ok) expect(preview.proxy).toBe("http://redacted:redacted@proxy.test:8080/")
  })

  test("builds params, auth, headers, body, and execution ownership", () => {
    const request = createScratchRequest("request-1", "localhost:3000/users/:id")
    request.method = "post"
    request.path = [{ id: "path", enabled: true, name: "id", value: "a/b", sensitivity: "normal" }]
    request.query = [
      { id: "query", enabled: true, name: "page", value: "2", sensitivity: "normal" },
    ]
    request.headers = [
      { id: "header", enabled: true, name: "X-Test", value: "yes", sensitivity: "normal" },
    ]
    request.auth = { kind: "bearer", token: "secret" }
    request.body = { kind: "json", text: '{"ok":true}', form: [] }

    const prepared = prepareHttpRequest(request, "execution-1", 7)

    expect(prepared).toMatchObject({
      executionId: "execution-1",
      requestId: "request-1",
      requestRevision: 7,
      method: "POST",
      body: '{"ok":true}',
    })
    expect(prepared.url).toBe("http://localhost:3000/users/a%2Fb?page=2")
    expect(prepared.headers).toEqual([
      ["X-Test", "yes"],
      ["Authorization", "Bearer secret"],
      ["Content-Type", "application/json"],
    ])
  })

  test("validates method, headers, JSON, and API key names", () => {
    const request = createScratchRequest("request-2", "example.com")
    request.method = "bad method"
    expect(() => prepareHttpRequest(request, "execution", 0)).toThrow(HttpRequestValidationError)

    request.method = "POST"
    request.headers = [
      { id: "bad", enabled: true, name: "Bad Header", value: "x", sensitivity: "normal" },
    ]
    expect(() => prepareHttpRequest(request, "execution", 0)).toThrow("header inválido")

    request.headers = []
    request.body = { kind: "json", text: "{", form: [] }
    expect(() => prepareHttpRequest(request, "execution", 0)).toThrow("JSON não é válido")

    request.body = { kind: "none", text: "", form: [] }
    request.auth = { kind: "api-key", placement: "header", name: "", value: "secret" }
    expect(() => prepareHttpRequest(request, "execution", 0)).toThrow("nome da API key")
  })

  test("rejects invalid request automation before transport", () => {
    const request = createScratchRequest("request-automation", "example.com")
    request.assertions = [{ id: "invalid", expression: "expect magic" }]
    expect(() => prepareHttpRequest(request, "execution", 0)).toThrow("Assertion inválida")
    request.assertions = []
    request.chain = { extract: [{ name: "token", jsonPath: "$[", secret: true }] }
    expect(() => prepareHttpRequest(request, "execution", 0)).toThrow("JSONPath inválido")
  })

  test("serializes enabled form fields and API keys without flattening headers", () => {
    const request = createScratchRequest("request-form", "example.com/submit")
    request.method = "POST"
    request.body = {
      kind: "form",
      text: "",
      form: [
        { id: "one", enabled: true, name: "tag", value: "a b", sensitivity: "normal" },
        { id: "two", enabled: true, name: "tag", value: "c", sensitivity: "normal" },
        { id: "off", enabled: false, name: "skip", value: "x", sensitivity: "normal" },
      ],
    }
    request.auth = { kind: "api-key", placement: "query", name: "key", value: "secret" }

    const prepared = prepareHttpRequest(request, "form-execution", 0)
    expect(prepared.url).toBe("http://example.com/submit?key=secret")
    expect(prepared.body).toBe("tag=a+b&tag=c")
    expect(prepared.headers).toContainEqual(["Content-Type", "application/x-www-form-urlencoded"])
  })

  test("accepts extension methods represented by a valid HTTP token", () => {
    const request = createScratchRequest("custom-method", "example.com/resource")
    request.method = "PROPFIND"
    expect(prepareHttpRequest(request, "custom", 0).method).toBe("PROPFIND")
  })

  test("previews the exact prepared request with origins and without private values", () => {
    const request = createScratchRequest(
      "preview",
      "https://example.test/users/{{token}}?trace={{token}}",
    )
    request.method = "POST"
    request.headers = [
      {
        id: "trace",
        enabled: true,
        name: "X-Trace",
        value: "Bearer {{token}}",
        sensitivity: "normal",
      },
    ]
    request.auth = { kind: "bearer", token: "{{token}}" }
    request.body = { kind: "json", text: '{"token":"{{token}}"}', form: [] }
    const variables = createHttpVariableContext([
      { origin: "private", values: { token: "opaque/credential" }, secret: true },
    ])
    const effectiveRequest = applyHttpWorkspaceConfig(request, {
      version: 1,
      headers: { Accept: "application/json" },
      options: { timeoutMs: 5_000 },
      history: { persistMetadata: false, persistBodies: false },
    })

    const preview = createHttpPreparedRequestPreview({
      sourceRequest: request,
      effectiveRequest,
      revision: 2,
      variables,
    })

    expect(preview.ok).toBe(true)
    expect(JSON.stringify(preview)).not.toContain("opaque")
    expect(JSON.stringify(preview)).not.toContain("credential")
    if (!preview.ok) throw new Error(preview.error)
    expect(preview.url).toContain("%3Credacted%3E")
    expect(preview.headers).toEqual([
      { id: "trace", name: "X-Trace", value: "<redacted>", origin: "request", masked: true },
      {
        id: "preview-workspace-header-0",
        name: "Accept",
        value: "application/json",
        origin: "workspace",
        masked: false,
      },
      {
        id: "preview-prepared-2",
        name: "Authorization",
        value: "<redacted>",
        origin: "auth",
        masked: true,
      },
      {
        id: "preview-prepared-3",
        name: "Content-Type",
        value: "application/json",
        origin: "automatic",
        masked: false,
      },
    ])
    expect(preview.variables).toEqual([
      { name: "token", value: "<redacted>", origin: "private", masked: true },
    ])
    expect(preview.body.content).toBe('{"token":"<redacted>"}')
    expect(preview.timeoutMs).toBe(5_000)
  })
})

describe("HTTP response reading", () => {
  test("classifies content and formats JSON without mutating raw content", () => {
    expect(classifyResponseBody("application/problem+json")).toBe("json")
    expect(classifyResponseBody("application/octet-stream")).toBe("binary")
    const response = {
      executionId: "execution",
      requestId: "request",
      requestRevision: 0,
      url: "http://example.com",
      status: 200,
      statusText: "OK",
      headers: [],
      body: new TextEncoder().encode('{"answer":42}'),
      bodyKind: "json" as const,
      contentType: "application/json",
      capturedBytes: 13,
      truncated: false,
      encoding: "utf-8",
      redirects: [],
      timings: { headersMs: 1, downloadMs: 1, totalMs: 2 },
    }
    expect(responseBodyText(response, false)).toBe('{"answer":42}')
    expect(responseBodyText(response, true)).toContain('\n  "answer": 42\n')
  })

  test("caps captured bytes and marks the snapshot as truncated", async () => {
    const response = new Response("0123456789")
    const result = await readLimitedResponseBody(response, 4)
    expect(new TextDecoder().decode(result.body)).toBe("0123")
    expect(result.truncated).toBe(true)
  })

  test("neutralizes terminal control characters before rendering", () => {
    expect(sanitizeTerminalText("safe\u001b[2J\u0000text\nnext")).toBe("safe␛[2J�text\nnext")
  })
})

describe("HTTP cookie jar", () => {
  test("respects host, domain, path, secure, expiry, and deletion", () => {
    const jar = new HttpCookieJar()
    const headers = new Headers()
    headers.append("set-cookie", "host=one; Path=/api; HttpOnly")
    headers.append("set-cookie", "shared=two; Domain=example.com; Path=/; Secure; SameSite=Lax")
    headers.append("set-cookie", "gone=no; Max-Age=0; Path=/")
    jar.store("https://api.example.com/api/login", headers, 1_000)

    expect(jar.header("https://api.example.com/api/users", 1_001)).toBe("host=one; shared=two")
    expect(jar.header("http://api.example.com/api/users", 1_001)).toBe("host=one")
    expect(jar.header("https://www.example.com/api/users", 1_001)).toBe("shared=two")
    expect(jar.header("https://api.example.com/other", 1_001)).toBe("shared=two")
    expect(jar.list(1_001)).toHaveLength(2)

    jar.store(
      "https://api.example.com/api/login",
      new Headers({ "set-cookie": "host=; Max-Age=0; Path=/api" }),
      1_002,
    )
    expect(jar.header("https://api.example.com/api/users", 1_003)).toBe("shared=two")
  })

  test("gives Max-Age precedence over a later Expires attribute", () => {
    const jar = new HttpCookieJar()
    jar.store(
      "https://api.example.com/",
      new Headers({
        "set-cookie": "session=alive; Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      }),
      1_000,
    )

    expect(jar.header("https://api.example.com/", 2_000)).toBe("session=alive")
    expect(jar.header("https://api.example.com/", 62_000)).toBe("")
  })

  test("rejects ICANN and private public suffixes while accepting a registrable parent", () => {
    const jar = new HttpCookieJar()
    const rejected = new Headers()
    rejected.append("set-cookie", "tld=one; Domain=com; Path=/")
    rejected.append("set-cookie", "country=two; Domain=co.uk; Path=/")
    rejected.append("set-cookie", "private=three; Domain=github.io; Path=/")
    jar.store("https://shop.example.com/", rejected)
    jar.store("https://shop.example.co.uk/", rejected)
    jar.store("https://user.github.io/", rejected)
    expect(jar.list()).toHaveLength(0)

    jar.store(
      "https://api.example.com/",
      new Headers({ "set-cookie": "shared=ok; Domain=example.com; Path=/" }),
    )
    expect(jar.header("https://www.example.com/")).toBe("shared=ok")
  })

  test("enforces secure cookie prefixes and protects secure cookies from HTTP overwrite", () => {
    const jar = new HttpCookieJar()
    const headers = new Headers()
    headers.append("set-cookie", "__Secure-missing=bad; Path=/")
    headers.append("set-cookie", "__Host-domain=bad; Secure; Domain=example.com; Path=/")
    headers.append("set-cookie", "__Host-path=bad; Secure; Path=/api")
    headers.append("set-cookie", "__Host-implicit=bad; Secure")
    headers.append("set-cookie", "none=bad; SameSite=None; Path=/")
    headers.append("set-cookie", "__Secure-good=one; Secure; Path=/")
    headers.append("set-cookie", "__Host-good=two; Secure; Path=/")
    jar.store("https://api.example.com/", headers)

    expect(jar.header("https://api.example.com/")).toBe("__Secure-good=one; __Host-good=two")
    jar.store(
      "http://api.example.com/",
      new Headers({ "set-cookie": "__Secure-good=overwritten; Path=/" }),
    )
    expect(jar.header("https://api.example.com/")).toContain("__Secure-good=one")
    jar.store(
      "http://api.example.com/",
      new Headers({ "set-cookie": "insecure=bad; Secure; Path=/" }),
    )
    expect(jar.header("https://api.example.com/")).not.toContain("insecure")
  })

  test("normalizes IDNs, rejects Domain on IPs, and bounds lifetime, count, and headers", () => {
    const jar = new HttpCookieJar()
    const now = 10_000
    jar.store(
      "https://shop.bücher.example/",
      new Headers({ "set-cookie": "idn=ok; Domain=bücher.example; Path=/" }),
      now,
    )
    jar.store(
      "http://127.0.0.1/",
      new Headers({ "set-cookie": "ip-domain=bad; Domain=127.0.0.1; Path=/" }),
      now,
    )
    jar.store("http://127.0.0.1/", new Headers({ "set-cookie": "ip-host=ok; Path=/" }), now)
    jar.store(
      "https://ttl.example.test/",
      new Headers({ "set-cookie": "ttl=ok; Max-Age=999999999; Path=/" }),
      now,
    )
    jar.store(
      "https://oversized.example.test/",
      new Headers({ "set-cookie": `large=${"x".repeat(HTTP_COOKIE_LIMITS.cookieBytes)}; Path=/` }),
      now,
    )
    for (let index = 0; index < HTTP_COOKIE_LIMITS.cookiesPerDomain + 5; index += 1) {
      jar.store(
        "https://bounded.example.test/",
        new Headers({ "set-cookie": `c${index}=${"x".repeat(180)}; Path=/` }),
        now,
      )
    }

    expect(jar.header("https://shop.xn--bcher-kva.example/", now)).toBe("idn=ok")
    expect(jar.header("http://127.0.0.1/", now)).toBe("ip-host=ok")
    expect(jar.list(now).find((cookie) => cookie.name === "ttl")?.expiresAt).toBe(
      now + HTTP_COOKIE_LIMITS.lifetimeMs,
    )
    expect(jar.list(now).some((cookie) => cookie.name === "large")).toBe(false)
    expect(jar.list(now).filter((cookie) => cookie.domain === "bounded.example.test")).toHaveLength(
      HTTP_COOKIE_LIMITS.cookiesPerDomain,
    )
    expect(Buffer.byteLength(jar.header("https://bounded.example.test/", now))).toBeLessThanOrEqual(
      HTTP_COOKIE_LIMITS.headerBytes,
    )
  })

  test("isolates equal environment names by request directory", () => {
    const store = new HttpCookieJarStore()
    const left = createScratchRequest("left")
    const leftPeer = createScratchRequest("left-peer")
    const right = createScratchRequest("right")
    left.source = { kind: "file", path: "services/a/api.http", blockId: "a", sourceHash: "a" }
    leftPeer.source = {
      kind: "file",
      path: "services/a/other.http",
      blockId: "b",
      sourceHash: "b",
    }
    right.source = { kind: "file", path: "services/b/api.http", blockId: "c", sourceHash: "c" }

    expect(store.forRequest(left, "local")).toBe(store.forRequest(leftPeer, "local"))
    expect(store.forRequest(left, "local")).not.toBe(store.forRequest(right, "local"))
    expect(store.forRequest(left, "local")).not.toBe(store.forRequest(left, "production"))
  })

  test("applies matching cookies while following redirects without leaking explicit cookies", async () => {
    const jar = new HttpCookieJar()
    const seen: Array<{ url: string; cookie: string | null }> = []
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      seen.push({ url, cookie: headers.get("cookie") })
      if (url === "https://api.example.test/start") {
        return new Response(null, {
          status: 302,
          headers: {
            location: "/next",
            "set-cookie": "session=abc; Path=/; HttpOnly",
          },
        })
      }
      if (url === "https://api.example.test/next") {
        return new Response(null, { status: 302, headers: { location: "https://other.test/end" } })
      }
      return new Response("ok")
    }) as typeof fetch
    const request = {
      executionId: "cookies",
      requestId: "cookies",
      requestRevision: 0,
      method: "GET",
      url: "https://api.example.test/start",
      headers: [["Authorization", "Bearer secret"]] as Array<[string, string]>,
      timeoutMs: 1_000,
      followRedirects: true,
    }

    await fetchWithHttpRedirects(request, new AbortController().signal, fetcher, 10, jar)
    expect(seen).toEqual([
      { url: "https://api.example.test/start", cookie: null },
      { url: "https://api.example.test/next", cookie: "session=abc" },
      { url: "https://other.test/end", cookie: null },
    ])
  })

  test("does not read or update the jar when the request disables cookies", async () => {
    const jar = new HttpCookieJar()
    jar.store(
      "https://api.example.test/start",
      new Headers({ "set-cookie": "existing=one; Path=/" }),
    )
    let sentCookie: string | null = "not-called"
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      sentCookie = new Headers(init?.headers).get("cookie")
      return new Response("ok", { headers: { "set-cookie": "ignored=two; Path=/" } })
    }) as typeof fetch
    const request = {
      executionId: "no-cookies",
      requestId: "no-cookies",
      requestRevision: 0,
      method: "GET",
      url: "https://api.example.test/start",
      headers: [] as Array<[string, string]>,
      timeoutMs: 1_000,
      followRedirects: true,
      useCookieJar: false,
    }

    await fetchWithHttpRedirects(request, new AbortController().signal, fetcher, 10, jar)
    expect(sentCookie).toBeNull()
    expect(jar.header("https://api.example.test/start")).toBe("existing=one")
    expect(jar.list()).toHaveLength(1)
  })

  test("applies the explicit proxy to every redirect hop", async () => {
    const seen: Array<{ url: string; proxy: string | undefined }> = []
    const fetcher = (async (input: string | URL | Request, init?: BunFetchRequestInit) => {
      const url = String(input)
      const proxy = init?.proxy
      seen.push({ url, proxy: typeof proxy === "string" ? proxy : proxy?.toString() })
      return url.endsWith("/start")
        ? new Response(null, { status: 302, headers: { location: "/end" } })
        : new Response("ok")
    }) as typeof fetch
    const request = {
      executionId: "proxy",
      requestId: "proxy",
      requestRevision: 0,
      method: "GET",
      url: "https://api.example.test/start",
      headers: [] as Array<[string, string]>,
      timeoutMs: 1_000,
      followRedirects: true,
      proxyUrl: "http://proxy.test:8080/",
    }

    await fetchWithHttpRedirects(request, new AbortController().signal, fetcher)
    expect(seen).toEqual([
      { url: "https://api.example.test/start", proxy: "http://proxy.test:8080/" },
      { url: "https://api.example.test/end", proxy: "http://proxy.test:8080/" },
    ])
  })
})

describe("HTTP transport", () => {
  let server: Server
  let baseUrl = ""

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      if (request.url === "/slow") {
        setTimeout(() => response.end("late"), 100)
        return
      }
      if (request.url === "/chunked") {
        response.writeHead(200, { "content-type": "text/plain" })
        response.write("one-")
        setTimeout(() => response.end("two"), 5)
        return
      }
      if (request.url === "/binary") {
        response.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-length": "5",
          "set-cookie": ["session=one; Path=/", "theme=dark; Path=/"],
        })
        response.end(Buffer.from([0, 1, 2, 3, 255]))
        return
      }
      if (request.url === "/large") {
        response.writeHead(200, {
          "content-type": "text/plain",
          "content-length": "32",
        })
        response.end("0123456789abcdefghijklmnopqrstuv")
        return
      }
      if (request.url === "/download") {
        response.writeHead(200, { "content-type": "application/octet-stream" })
        response.write(Buffer.from([0, 1, 2]))
        response.end(Buffer.from([3, 254, 255]))
        return
      }
      if (request.url === "/slow-download") {
        response.writeHead(200, { "content-type": "application/octet-stream" })
        const timer = setInterval(() => response.write(Buffer.alloc(1_024)), 5)
        request.on("close", () => clearInterval(timer))
        return
      }
      if (request.url === "/partial-download") {
        response.writeHead(200, { "content-type": "application/octet-stream" })
        response.write(Buffer.alloc(1_024))
        response.socket?.destroy()
        return
      }
      if (request.url === "/failed-download") {
        response.writeHead(404, { "content-type": "text/plain" })
        response.end("not found")
        return
      }
      if (request.url === "/broken") {
        request.socket.destroy()
        return
      }
      let body = ""
      for await (const chunk of request) body += chunk.toString()
      response.writeHead(201, { "content-type": "application/json", "x-reply": "ok" })
      response.end(JSON.stringify({ body: JSON.parse(body), method: request.method }))
    })
    server.listen(0, "127.0.0.1")
    await new Promise<void>((resolve) => server.once("listening", resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
    server.closeAllConnections()
  })

  test("returns a bounded response snapshot tied to the execution", async () => {
    const request = createScratchRequest("request-3", `${baseUrl}/echo`)
    request.method = "POST"
    request.body = { kind: "json", text: '{"name":"Tuiminal"}', form: [] }
    const result = await executePreparedHttpRequest(prepareHttpRequest(request, "execution-3", 4))

    expect(result).toMatchObject({
      executionId: "execution-3",
      requestId: "request-3",
      requestRevision: 4,
      status: 201,
      bodyKind: "json",
      truncated: false,
    })
    expect(responseBodyText(result)).toContain('"name": "Tuiminal"')
  })

  test("distinguishes cancellation from timeout", async () => {
    const request = createScratchRequest("request-4", `${baseUrl}/slow`)
    const prepared = prepareHttpRequest(request, "execution-4", 0)
    const controller = new AbortController()
    const pending = executePreparedHttpRequest(prepared, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" })

    prepared.timeoutMs = 5
    await expect(executePreparedHttpRequest(prepared)).rejects.toEqual(
      expect.objectContaining({
        kind: "timeout",
        message: "O tempo limite de 5 ms foi excedido.",
      }),
    )
  })

  test("reads chunked bodies without depending on content length", async () => {
    const request = createScratchRequest("request-chunked", `${baseUrl}/chunked`)
    const result = await executePreparedHttpRequest(prepareHttpRequest(request, "chunked", 0))

    expect(responseBodyText(result, false)).toBe("one-two")
    expect(result.declaredBytes).toBeUndefined()
    expect(result.capturedBytes).toBe(7)
    expect(result.truncated).toBe(false)
  })

  test("preserves repeated cookies and classifies binary bodies", async () => {
    const request = createScratchRequest("request-binary", `${baseUrl}/binary`)
    const result = await executePreparedHttpRequest(prepareHttpRequest(request, "binary", 0))

    expect(result.bodyKind).toBe("binary")
    expect(result.declaredBytes).toBe(5)
    expect([...result.body]).toEqual([0, 1, 2, 3, 255])
    expect(result.headers.filter(([name]) => name === "set-cookie")).toEqual([
      ["set-cookie", "session=one; Path=/"],
      ["set-cookie", "theme=dark; Path=/"],
    ])
  })

  test("distinguishes declared, captured, and truncated response bytes", async () => {
    const request = createScratchRequest("request-large", `${baseUrl}/large`)
    const result = await executePreparedHttpRequest(
      prepareHttpRequest(request, "large", 0),
      undefined,
      10,
    )

    expect(result.declaredBytes).toBe(32)
    expect(result.capturedBytes).toBe(10)
    expect(result.truncated).toBe(true)
    expect(responseBodyText(result, false)).toBe("0123456789")
  })

  test("reports a local socket failure as a network error", async () => {
    const request = createScratchRequest("request-broken", `${baseUrl}/broken`)
    await expect(
      executePreparedHttpRequest(prepareHttpRequest(request, "broken", 0)),
    ).rejects.toEqual(expect.objectContaining({ kind: "network" }))
  })

  test("routes through an explicit HTTP proxy", async () => {
    let requestedUrl = ""
    const proxy = createServer((request, response) => {
      requestedUrl = request.url ?? ""
      response.writeHead(200, { "content-type": "text/plain" })
      response.end("proxied")
    })
    proxy.listen(0, "127.0.0.1")
    await new Promise<void>((done) => proxy.once("listening", done))
    try {
      const request = createScratchRequest("proxy-real", "http://unresolved.invalid/probe")
      request.options.proxy = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
      const result = await executePreparedHttpRequest(prepareHttpRequest(request, "proxy-real", 0))
      expect(responseBodyText(result, false)).toBe("proxied")
      expect(requestedUrl).toBe("http://unresolved.invalid/probe")
    } finally {
      await new Promise<void>((done, reject) =>
        proxy.close((error) => (error ? reject(error) : done())),
      )
    }
  })

  test("never exposes explicit proxy credentials in transport errors", async () => {
    const request = createScratchRequest("proxy-error", "http://example.test/probe")
    request.options.proxy = "http://proxy-user:proxy-secret@127.0.0.1:1"
    let caught: unknown
    try {
      await executePreparedHttpRequest(prepareHttpRequest(request, "proxy-error", 0))
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ kind: "network" })
    expect(String((caught as Error).message)).not.toContain("proxy-user")
    expect(String((caught as Error).message)).not.toContain("proxy-secret")
  })

  test.skipIf(!Bun.which("openssl"))(
    "keeps self-signed TLS strict until the target is explicitly approved",
    async () => {
      const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-tls-"))
      const keyPath = resolve(root, "key.pem")
      const certPath = resolve(root, "cert.pem")
      const generated = Bun.spawn(
        [
          "openssl",
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          keyPath,
          "-out",
          certPath,
          "-subj",
          "/CN=localhost",
          "-days",
          "1",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1",
        ],
        { stdout: "ignore", stderr: "ignore" },
      )
      expect(await generated.exited).toBe(0)
      const tlsServer = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        tls: { key: Bun.file(keyPath), cert: Bun.file(certPath) },
        fetch: () => new Response("self-signed-ok"),
      })
      try {
        const request = createScratchRequest(
          "self-signed",
          `https://127.0.0.1:${tlsServer.port}/probe`,
        )
        await expect(
          executePreparedHttpRequest(prepareHttpRequest(request, "strict-tls", 0)),
        ).rejects.toMatchObject({ kind: "tls" })

        request.options.tlsVerification = "insecure"
        const insecure = prepareHttpRequest(request, "insecure-tls", 0)
        await expect(executePreparedHttpRequest(insecure)).rejects.toBeInstanceOf(
          HttpInsecureTlsApprovalError,
        )
        const result = await executePreparedHttpRequest(
          insecure,
          undefined,
          undefined,
          undefined,
          true,
        )
        expect(responseBodyText(result, false)).toBe("self-signed-ok")
      } finally {
        tlsServer.stop(true)
        await rm(root, { recursive: true })
      }
    },
  )

  test("streams a complete GET response to a protected project file", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-download-"))
    try {
      const request = prepareHttpRequest(
        createScratchRequest("download", `${baseUrl}/download`),
        "download-execution",
        0,
      )
      const result = await downloadCompleteHttpResponse({
        root,
        requestName: "Binary response",
        request,
        signal: new AbortController().signal,
        now: new Date("2026-09-04T12:00:00.000Z"),
      })
      expect(result.bytes).toBe(6)
      expect(new Uint8Array(await readFile(result.path))).toEqual(
        new Uint8Array([0, 1, 2, 3, 254, 255]),
      )
      expect((await stat(result.path)).mode & 0o777).toBe(0o600)
    } finally {
      await rm(root, { recursive: true })
    }
  })

  test("removes a partial download on cancellation and refuses to repeat POST", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-download-cancel-"))
    try {
      const get = prepareHttpRequest(
        createScratchRequest("slow-download", `${baseUrl}/slow-download`),
        "slow-download-execution",
        0,
      )
      const controller = new AbortController()
      const pending = downloadCompleteHttpResponse({
        root,
        requestName: "Slow binary",
        request: get,
        signal: controller.signal,
      })
      await Bun.sleep(25)
      controller.abort()
      await expect(pending).rejects.toBeDefined()
      expect(
        await readdir(resolve(root, "tuiminal-exports/http")).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
          throw error
        }),
      ).toEqual([])

      const postRequest = createScratchRequest("post-download", `${baseUrl}/download`)
      postRequest.method = "POST"
      const post = prepareHttpRequest(postRequest, "post-download-execution", 0)
      await expect(
        downloadCompleteHttpResponse({
          root,
          requestName: "Unsafe repeat",
          request: post,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("requests GET")
    } finally {
      await rm(root, { recursive: true })
    }
  })

  test("rejects unexpected status, stream failure, and disk errors without a final file", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-download-failure-"))
    try {
      const failedStatus = prepareHttpRequest(
        createScratchRequest("failed-download", `${baseUrl}/failed-download`),
        "failed-download-execution",
        0,
      )
      await expect(
        downloadCompleteHttpResponse({
          root,
          requestName: "Missing response",
          request: failedStatus,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("status HTTP 404")

      const partial = prepareHttpRequest(
        createScratchRequest("partial-download", `${baseUrl}/partial-download`),
        "partial-download-execution",
        0,
      )
      await expect(
        downloadCompleteHttpResponse({
          root,
          requestName: "Partial response",
          request: partial,
          signal: new AbortController().signal,
        }),
      ).rejects.toBeDefined()
      expect(
        await readdir(resolve(root, "tuiminal-exports/http")).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
          throw error
        }),
      ).toEqual([])

      const blockedRoot = await mkdtemp(resolve(tmpdir(), "tuiminal-http-download-disk-"))
      try {
        await mkdir(resolve(blockedRoot, "tuiminal-exports"))
        await writeFile(resolve(blockedRoot, "tuiminal-exports/http"), "not a directory")
        await expect(
          downloadCompleteHttpResponse({
            root: blockedRoot,
            requestName: "Disk failure",
            request: prepareHttpRequest(
              createScratchRequest("download", `${baseUrl}/download`),
              "disk-failure-execution",
              0,
            ),
            signal: new AbortController().signal,
          }),
        ).rejects.toBeDefined()
        expect(await readdir(resolve(blockedRoot, "tuiminal-exports"))).toEqual(["http"])
      } finally {
        await rm(blockedRoot, { recursive: true })
      }
    } finally {
      await rm(root, { recursive: true })
    }
  })
})

describe("HTTP redirect policy", () => {
  test("requires target-scoped approval before disabling TLS verification", async () => {
    const request = createScratchRequest("tls", "https://one.test/start")
    request.options.tlsVerification = "insecure"
    const prepared = prepareHttpRequest(request, "tls", 0)
    const calls: Array<{ url: string; rejectUnauthorized: boolean | undefined }> = []
    const fetcher = (async (url: string | URL | Request, init?: BunFetchRequestInit) => {
      calls.push({
        url: String(url),
        rejectUnauthorized: init?.tls?.rejectUnauthorized,
      })
      return new Response("ok")
    }) as typeof fetch

    await expect(
      fetchWithHttpRedirects(prepared, new AbortController().signal, fetcher),
    ).rejects.toBeInstanceOf(HttpInsecureTlsApprovalError)
    expect(calls).toEqual([])

    await fetchWithHttpRedirects(
      prepared,
      new AbortController().signal,
      fetcher,
      10,
      undefined,
      (url) => httpInsecureTlsApproval(url, "local").target === "https://one.test",
    )
    expect(calls).toEqual([{ url: "https://one.test/start", rejectUnauthorized: false }])
  })

  test("requires a new insecure TLS approval after a cross-origin redirect", async () => {
    const request = createScratchRequest("tls-redirect", "https://one.test/start")
    request.options.tlsVerification = "insecure"
    const prepared = prepareHttpRequest(request, "tls-redirect", 0)
    const calls: string[] = []
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url))
      return new Response(null, {
        status: 302,
        headers: { location: "https://two.test/final" },
      })
    }) as typeof fetch

    await expect(
      fetchWithHttpRedirects(
        prepared,
        new AbortController().signal,
        fetcher,
        10,
        undefined,
        (url) => new URL(url).origin === "https://one.test",
      ),
    ).rejects.toMatchObject({ target: "https://two.test" })
    expect(calls).toEqual(["https://one.test/start"])
  })

  test("scopes insecure TLS approvals by target and environment", () => {
    const local = httpInsecureTlsApproval("https://api.test/one", "local")
    expect(httpInsecureTlsApproval("https://api.test/two", "local").key).toBe(local.key)
    expect(httpInsecureTlsApproval("https://other.test", "local").key).not.toBe(local.key)
    expect(httpInsecureTlsApproval("https://api.test", "production").key).not.toBe(local.key)
  })

  test("tracks hops and strips credentials when the origin changes", async () => {
    const request = createScratchRequest("redirect", "https://one.test/start")
    request.headers = [
      {
        id: "auth",
        enabled: true,
        name: "Authorization",
        value: "secret",
        sensitivity: "literal-secret",
      },
      {
        id: "cookie",
        enabled: true,
        name: "Cookie",
        value: "sid=1",
        sensitivity: "literal-secret",
      },
      { id: "trace", enabled: true, name: "X-Trace", value: "safe", sensitivity: "normal" },
    ]
    const prepared = prepareHttpRequest(request, "redirect", 0)
    const calls: Array<{ url: string; headers: Array<[string, string]> }> = []
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Array<[string, string]> })
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { location: "https://two.test/final" } })
        : new Response("ok", { status: 200 })
    }) as typeof fetch

    const result = await fetchWithHttpRedirects(prepared, new AbortController().signal, fetcher)
    expect(result.redirects).toEqual([
      {
        status: 302,
        url: "https://one.test/start",
        location: "https://two.test/final",
        crossOrigin: true,
      },
    ])
    expect(calls[1]?.headers).toEqual([["X-Trace", "safe"]])
  })

  test("detects redirect loops deterministically", async () => {
    const prepared = prepareHttpRequest(
      createScratchRequest("loop", "https://loop.test/a"),
      "loop",
      0,
    )
    const fetcher = (async (url: string | URL | Request) =>
      new Response(null, {
        status: 302,
        headers: { location: String(url).endsWith("/a") ? "/b" : "/a" },
      })) as typeof fetch
    await expect(
      fetchWithHttpRedirects(prepared, new AbortController().signal, fetcher),
    ).rejects.toBeInstanceOf(HttpRedirectError)
  })
})
