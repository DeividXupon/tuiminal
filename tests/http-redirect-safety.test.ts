import { expect, test } from "bun:test"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"
import { fetchWithHttpRedirects } from "../packages/feature-http/src/services/redirects"
import { HttpCookieJar } from "../packages/feature-http/src/services/cookies"
import { HttpRedirectApprovalQueue } from "../packages/feature-http/src/services/redirect-approvals"
import { parseHttpRedirectFlags } from "../packages/feature-http/src/cli/redirect-flags"
import type { HttpRedirectApproval } from "../packages/feature-http/src/model/redirect-policy"
import { HTTP_REDIRECT_MESSAGES } from "../packages/core/src/i18n/http-redirect-catalog"
import { translateUi } from "../packages/core/src/i18n"

const secret = "FAKE_REDIRECT_CREDENTIAL_72"

test("custom authentication headers never follow an origin change", async () => {
  const request = createScratchRequest("custom", "https://one.test/start")
  request.auth = {
    kind: "api-key",
    placement: "header",
    name: "X-Custom-Credential",
    value: secret,
  }
  const calls: Headers[] = []
  const fetcher = (async (_url, init) => {
    calls.push(new Headers(init?.headers))
    return calls.length === 1
      ? new Response(null, { status: 302, headers: { location: "https://two.test/end" } })
      : new Response("ok")
  }) as typeof fetch
  await fetchWithHttpRedirects(
    prepareHttpRequest(request, "custom", 0),
    new AbortController().signal,
    fetcher,
  )
  expect(calls[0]?.get("x-custom-credential")).toBe(secret)
  expect(calls[1]?.get("x-custom-credential")).toBeNull()
})

test("a 307 never forwards a POST body to another origin without consent", async () => {
  const request = createScratchRequest("post", "https://one.test/start")
  request.method = "POST"
  request.body = { kind: "text", text: secret, form: [] }
  const calls: string[] = []
  const fetcher = (async (url) => {
    calls.push(String(url))
    return calls.length === 1
      ? new Response(null, { status: 307, headers: { location: "https://two.test/end" } })
      : new Response("ok")
  }) as typeof fetch
  await expect(
    fetchWithHttpRedirects(
      prepareHttpRequest(request, "post", 0),
      new AbortController().signal,
      fetcher,
    ),
  ).rejects.toThrow("autorização")
  expect(calls).toEqual(["https://one.test/start"])
})

for (const status of [301, 302, 303, 307, 308]) {
  for (const target of [
    "https://two.test/end",
    "https://one.test:444/end",
    "https://sub.one.test/end",
  ]) {
    test(`${status} removes private values and header provenance before ${target}`, async () => {
      const request = createScratchRequest("origins", "https://one.test/start")
      request.headers = [
        { id: "a", name: "X-Ordinary", value: "{{value}}", enabled: true, sensitivity: "normal" },
        {
          id: "b",
          name: " X-Empty-Private ",
          value: "",
          enabled: true,
          sensitivity: "literal-secret",
        },
        { id: "c", name: "X-Trace", value: "public", enabled: true, sensitivity: "normal" },
      ]
      const calls: Headers[] = []
      const fetcher = (async (_url, init) => {
        calls.push(new Headers(init?.headers))
        return calls.length === 1
          ? new Response(null, { status, headers: { location: target } })
          : new Response("ok")
      }) as typeof fetch
      const prepared = prepareHttpRequest(
        request,
        "origins",
        0,
        new Map([["value", { value: secret, secret: true, origin: "private" }]]),
      )
      await fetchWithHttpRedirects(prepared, new AbortController().signal, fetcher)
      expect(calls[1]?.has("x-ordinary")).toBe(false)
      expect(calls[1]?.has("x-empty-private")).toBe(false)
      expect(calls[1]?.get("x-trace")).toBe("public")
      expect(calls[0]?.get("x-ordinary")).toBe(secret)
    })
  }
}

for (const status of [301, 302, 303, 307, 308]) {
  test(`same-origin ${status} preserves auth and applies the expected POST/body transition`, async () => {
    const request = createScratchRequest("same", "https://one.test/start")
    request.method = "POST"
    request.auth = { kind: "bearer", token: secret }
    request.body = { kind: "text", text: "payload", form: [] }
    const calls: RequestInit[] = []
    const fetcher = (async (_url, init) => {
      calls.push(init ?? {})
      return calls.length === 1
        ? new Response(null, { status, headers: { location: "https://ONE.test:443/end" } })
        : new Response("ok")
    }) as typeof fetch
    await fetchWithHttpRedirects(
      prepareHttpRequest(request, "same", 0),
      new AbortController().signal,
      fetcher,
    )
    expect(new Headers(calls[1]?.headers).get("authorization")).toBe(`Bearer ${secret}`)
    expect(calls[1]?.method).toBe(status >= 307 ? "POST" : "GET")
    expect(calls[1]?.body).toBe(status >= 307 ? "payload" : undefined)
    if (status < 307) expect(new Headers(calls[1]?.headers).has("content-type")).toBe(false)
  })
}

test("approval resumes only the pending hop, never resends the first POST", async () => {
  const request = createScratchRequest("once", "https://one.test/start")
  request.method = "POST"
  request.body = { kind: "text", text: secret, form: [] }
  request.auth = { kind: "api-key", placement: "header", name: "X-Custom", value: secret }
  const calls: { url: string; headers: Headers; body: unknown }[] = []
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body })
    return calls.length === 1
      ? new Response(null, {
          status: 307,
          headers: { location: `https://two.test/end?q=${secret}` },
        })
      : new Response("ok")
  }) as typeof fetch
  const entered = Promise.withResolvers<HttpRedirectApproval>()
  const answer = Promise.withResolvers<boolean>()
  const pending = fetchWithHttpRedirects(
    prepareHttpRequest(request, "once", 0),
    new AbortController().signal,
    fetcher,
    10,
    undefined,
    false,
    undefined,
    (approval) => {
      entered.resolve(approval)
      return answer.promise
    },
  )
  const approval = await entered.promise
  expect(approval.risks).toEqual(["body", "private-url"])
  expect(approval.displayUrl).not.toContain(secret)
  expect(calls).toHaveLength(1)
  answer.resolve(true)
  await pending
  expect(calls.map((call) => call.url)).toEqual([request.url, `https://two.test/end?q=${secret}`])
  expect(calls[1]?.body).toBe(secret)
  expect(calls[1]?.headers.has("x-custom")).toBe(false)
})

test("aborting a pending decision cancels it and ignores a late approval", async () => {
  const request = prepareHttpRequest(
    createScratchRequest("abort", "https://one.test/start"),
    "abort",
    0,
  )
  const calls: string[] = []
  const fetcher = (async (url) => {
    calls.push(String(url))
    return new Response(null, { status: 302, headers: { location: "http://one.test/end" } })
  }) as typeof fetch
  const controller = new AbortController()
  const entered = Promise.withResolvers<void>()
  const answer = Promise.withResolvers<boolean>()
  const pending = fetchWithHttpRedirects(
    request,
    controller.signal,
    fetcher,
    10,
    undefined,
    false,
    undefined,
    () => {
      entered.resolve()
      return answer.promise
    },
  )
  await entered.promise
  controller.abort()
  await expect(pending).rejects.toHaveProperty("name", "AbortError")
  answer.resolve(true)
  await Promise.resolve()
  expect(calls).toEqual([request.url])
})

test("TLS approvals on a redirected POST resume without duplicating the original write", async () => {
  const request = createScratchRequest("tls", "https://one.test/start")
  request.method = "POST"
  request.body = { kind: "text", text: "write", form: [] }
  request.options.tlsVerification = "insecure"
  const calls: string[] = []
  const decisions: HttpRedirectApproval[] = []
  const fetcher = (async (url) => {
    calls.push(String(url))
    return calls.length === 1
      ? new Response(null, { status: 303, headers: { location: "https://two.test/end" } })
      : new Response("ok")
  }) as typeof fetch
  await fetchWithHttpRedirects(
    prepareHttpRequest(request, "tls", 0),
    new AbortController().signal,
    fetcher,
    10,
    undefined,
    false,
    undefined,
    (approval) => {
      decisions.push(approval)
      return true
    },
  )
  expect(decisions.map((item) => [item.hop, item.toOrigin, item.risks])).toEqual([
    [0, "https://one.test", ["insecure-tls"]],
    [1, "https://two.test", ["insecure-tls"]],
  ])
  expect(calls).toEqual(["https://one.test/start", "https://two.test/end"])
})

test("origin changes do not reattach source cookies from a shared-domain jar", async () => {
  const jar = new HttpCookieJar()
  jar.store(
    "https://one.example.test/",
    new Headers({ "set-cookie": `session=${secret}; Domain=example.test; Path=/` }),
  )
  const request = prepareHttpRequest(
    createScratchRequest("jar", "https://one.example.test/start"),
    "jar",
    0,
  )
  const headers: Headers[] = []
  const fetcher = (async (_url, init) => {
    headers.push(new Headers(init?.headers))
    return headers.length === 1
      ? new Response(null, { status: 302, headers: { location: "https://two.example.test/end" } })
      : new Response("ok")
  }) as typeof fetch
  await fetchWithHttpRedirects(request, new AbortController().signal, fetcher, 10, jar)
  expect(headers[0]?.get("cookie")).toContain(secret)
  expect(headers[1]?.get("cookie")).toBeNull()
})

test("later same-origin hops reject source cookies but preserve independently issued target cookies", async () => {
  const jar = new HttpCookieJar()
  jar.store(
    "https://one.example.test/",
    new Headers({
      "set-cookie": `session=${secret}; Domain=example.test; Path=/`,
    }),
  )
  const seen: Headers[] = []
  const fetcher = (async (_url, init) => {
    seen.push(new Headers(init?.headers))
    if (seen.length === 1)
      return new Response(null, {
        status: 302,
        headers: { location: "https://two.example.test/first" },
      })
    if (seen.length === 2)
      return new Response(null, {
        status: 302,
        headers: { location: "/second", "set-cookie": "target=independent; Path=/" },
      })
    return new Response("ok")
  }) as typeof fetch
  await fetchWithHttpRedirects(
    prepareHttpRequest(
      createScratchRequest("jar-chain", "https://one.example.test/"),
      "jar-chain",
      0,
    ),
    new AbortController().signal,
    fetcher,
    10,
    jar,
  )
  expect(seen.map((headers) => headers.get("cookie"))).toEqual([
    `session=${secret}`,
    null,
    "target=independent",
  ])
})

for (const location of [
  "file:///tmp/fixture",
  "ftp://example.test/x",
  `https://user:${secret}@two.test/`,
  "http://[invalid",
]) {
  test(`rejects an unsafe Location and closes its response body`, async () => {
    let cancelled = false
    let calls = 0
    const fetcher = (async (_url: string | URL | Request) => {
      calls++
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
        { status: 302, headers: { location } },
      )
    }) as typeof fetch
    await expect(
      fetchWithHttpRedirects(
        prepareHttpRequest(createScratchRequest("bad", "https://one.test"), "bad", 0),
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow("HTTP/HTTPS")
    expect(calls).toBe(1)
    expect(cancelled).toBe(true)
  })
}

test("CLI redirect consent is exact, per destination and separate for plaintext/private data", async () => {
  const flags = parseHttpRedirectFlags([
    "file.http",
    "--allow-private-redirect-to",
    "http://two.test:8080",
    "--allow-http-redirect-to",
    "http://two.test:8080",
  ])
  expect(flags.args).toEqual(["file.http"])
  const approval: HttpRedirectApproval = {
    executionId: "x",
    requestId: "x",
    hop: 1,
    fromOrigin: "https://one.test",
    toOrigin: "http://two.test:8080",
    method: "POST",
    displayUrl: "http://two.test:8080/",
    risks: ["body", "downgrade"],
  }
  const signal = new AbortController().signal
  expect(await flags.authorize(approval, signal)).toBe(true)
  expect(await flags.authorize({ ...approval, toOrigin: "http://two.test:8081" }, signal)).toBe(
    false,
  )
  const bodyOnly = parseHttpRedirectFlags(["--allow-private-redirect-to", approval.toOrigin])
  expect(await bodyOnly.authorize(approval, signal)).toBe(false)
  for (const value of [
    "https://two.test/path",
    "https://two.test/?q=value",
    "https://user:pass@two.test",
    "https://two.test/#fragment",
    "*",
  ]) {
    expect(() => parseHttpRedirectFlags(["--allow-private-redirect-to", value])).toThrow("origem")
  }
})

test("queued prompts are single-use, cancelled promptly and bounded", async () => {
  const queue = new HttpRedirectApprovalQueue()
  const approval: HttpRedirectApproval = {
    executionId: "queue",
    requestId: "queue",
    hop: 1,
    fromOrigin: "https://one.test",
    toOrigin: "https://two.test",
    method: "POST",
    displayUrl: "https://two.test/",
    risks: ["body"],
  }
  const controller = new AbortController()
  const first = queue.request(approval, controller.signal)
  const firstId = queue.snapshot()?.id
  if (firstId === undefined) throw new Error("Missing fixture prompt")
  const second = queue.request(approval, new AbortController().signal)
  queue.decide(firstId, true)
  expect(await first).toBe(true)
  queue.decide(firstId, true)
  expect(queue.snapshot()?.id).not.toBe(firstId)
  queue.dispose()
  expect(await second).toBe(false)
  expect(queue.snapshot()).toBeNull()
  expect(await queue.request(approval, controller.signal)).toBe(false)
  const bounded = new HttpRedirectApprovalQueue()
  const waiting = Array.from({ length: 16 }, () => bounded.request(approval, controller.signal))
  expect(await bounded.request(approval, controller.signal)).toBe(false)
  controller.abort()
  expect(await Promise.all(waiting)).toEqual(Array(16).fill(false))
  expect(bounded.snapshot()).toBeNull()
})

test("all redirect safety messages are translated in every supported language", () => {
  const languages = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const
  for (const entry of HTTP_REDIRECT_MESSAGES)
    for (const [index, language] of languages.entries()) {
      expect(translateUi(entry[0], language)).toBe(entry[index] ?? "missing")
    }
})
