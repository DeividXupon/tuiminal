import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { createScratchRequest } from "../src/features/http/model/workspace"
import { executePreparedHttpRequest } from "../src/features/http/services/fetch-transport"
import {
  HttpRequestValidationError,
  normalizeHttpUrl,
  prepareHttpRequest,
} from "../src/features/http/services/request-builder"
import {
  classifyResponseBody,
  readLimitedResponseBody,
  responseBodyText,
  sanitizeTerminalText,
} from "../src/features/http/services/response-reader"

describe("HTTP request preparation", () => {
  test("normalizes hostnames and only accepts HTTP protocols", () => {
    expect(normalizeHttpUrl(" localhost:8000/api ").toString()).toBe("http://localhost:8000/api")
    expect(normalizeHttpUrl("https://example.com/path").toString()).toBe("https://example.com/path")
    expect(() => normalizeHttpUrl(" ")).toThrow("Informe uma URL")
    expect(() => normalizeHttpUrl("file:///tmp/data.json")).toThrow("HTTP ou HTTPS")
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
      expect.objectContaining({ kind: "timeout" }),
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
})
