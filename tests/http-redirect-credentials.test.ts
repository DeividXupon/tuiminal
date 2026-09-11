import { describe, expect, test } from "bun:test"
import {
  createHttpVariableContext,
  httpTemplateReferencesSecret,
} from "../src/features/http/model/variables"
import { createScratchRequest } from "../src/features/http/model/workspace"
import { executePreparedHttpRequest } from "../src/features/http/services/fetch-transport"
import { fetchWithHttpRedirects } from "../src/features/http/services/redirects"
import { prepareHttpRequest } from "../src/features/http/services/request-builder"

function credentialRequest(url: string) {
  const request = createScratchRequest("redirect-credentials", url)
  request.auth = {
    kind: "api-key",
    placement: "header",
    name: "X-Custom-Credential",
    value: "custom-auth-value",
  }
  request.headers = [
    {
      id: "private",
      enabled: true,
      name: "X-Private-Value",
      value: "{{publicAlias}}",
      sensitivity: "normal",
    },
    {
      id: "literal",
      enabled: true,
      name: "X-Literal-Value",
      value: "literal-credential",
      sensitivity: "literal-secret",
    },
    {
      id: "reference",
      enabled: true,
      name: "X-Reference-Value",
      value: "{{reference}}",
      sensitivity: "secret-ref",
    },
    {
      id: "named",
      enabled: true,
      name: "X-Session-Token",
      value: "named-credential",
      sensitivity: "normal",
    },
    {
      id: "safe",
      enabled: true,
      name: "X-Trace",
      value: "{{trace}}",
      sensitivity: "normal",
    },
  ]
  const variables = createHttpVariableContext([
    { origin: "private", secret: true, values: { credential: "private-credential" } },
    {
      origin: "public",
      values: {
        publicAlias: "Bearer {{credential}}",
        reference: "reference-credential",
        trace: "public-trace",
      },
    },
  ])
  return prepareHttpRequest(request, "redirect-credentials", 0, variables)
}

const credentialHeaders = {
  "x-custom-credential": "custom-auth-value",
  "x-private-value": "Bearer private-credential",
  "x-literal-value": "literal-credential",
  "x-reference-value": "reference-credential",
  "x-session-token": "named-credential",
  "x-trace": "public-trace",
}

describe("HTTP redirect credential isolation", () => {
  test("tracks nested private references even when values are empty and stops on cycles", () => {
    const variables = createHttpVariableContext([
      { origin: "private", secret: true, values: { credential: "" } },
      {
        origin: "public",
        values: {
          outer: "Bearer {{inner}}",
          inner: "{{credential}}",
          cycleA: "{{cycleB}}",
          cycleB: "{{cycleA}}",
        },
      },
    ])
    expect(httpTemplateReferencesSecret("{{outer}}", variables)).toBe(true)
    expect(httpTemplateReferencesSecret("{{cycleA}} {{outer}}", variables)).toBe(true)
    expect(httpTemplateReferencesSecret("{{cycleA}}", variables)).toBe(false)
    expect(httpTemplateReferencesSecret("public value {{missing}}", variables)).toBe(false)
    expect(httpTemplateReferencesSecret("{{credential}}")).toBe(false)
  })

  test("does not strip public headers because unused private values happen to overlap", async () => {
    const request = createScratchRequest("public-headers", "https://one.test/start")
    request.method = "POST"
    request.body = { ...request.body, kind: "json", text: "{}" }
    request.headers = [
      {
        id: "version",
        enabled: true,
        name: "X-Api-Version",
        value: "v1",
        sensitivity: "normal",
      },
      {
        id: "disabled-secret",
        enabled: false,
        name: "X-Disabled",
        value: "json",
        sensitivity: "literal-secret",
      },
    ]
    const variables = createHttpVariableContext([
      {
        origin: "private",
        secret: true,
        values: {
          unusedPin: "1",
          unusedName: "application",
        },
      },
    ])
    const prepared = prepareHttpRequest(request, "public-headers", 0, variables)
    const seen: Array<Record<string, string>> = []
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(Object.fromEntries(new Headers(init?.headers)))
      return seen.length === 1
        ? new Response(null, { status: 307, headers: { location: "https://two.test/next" } })
        : new Response("ok")
    }) as typeof fetch
    await fetchWithHttpRedirects(
      prepared,
      new AbortController().signal,
      fetcher,
      10,
      undefined,
      false,
      undefined,
      () => true,
    )
    expect(seen).toEqual([
      { "x-api-version": "v1", "content-type": "application/json" },
      { "x-api-version": "v1", "content-type": "application/json" },
    ])
    expect(prepared.credentialHeaderNames).toEqual([])
  })

  test("preserves credentials on the original origin and removes them before another port", async () => {
    const seen: Array<Record<string, string>> = []
    const target = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        seen.push(Object.fromEntries(request.headers.entries()))
        return Response.json({ ok: true })
      },
    })
    const source = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        seen.push(Object.fromEntries(request.headers.entries()))
        const location = new URL(request.url).pathname === "/start" ? "/next" : target.url.href
        return new Response(null, { status: 307, headers: { location } })
      },
    })
    try {
      const request = credentialRequest(new URL("/start", source.url).href)
      const snapshot = await executePreparedHttpRequest(request)
      expect(snapshot.status).toBe(200)
      expect(snapshot.redirects.map((hop) => hop.crossOrigin)).toEqual([false, true])
      expect(seen).toHaveLength(3)
      expect(seen[0]).toMatchObject(credentialHeaders)
      expect(seen[1]).toMatchObject(credentialHeaders)
      expect(seen[2]?.["x-trace"]).toBe("public-trace")
      for (const name of Object.keys(credentialHeaders).filter((name) => name !== "x-trace")) {
        expect(seen[2]?.[name]).toBeUndefined()
      }
    } finally {
      await source.stop(true)
      await target.stop(true)
    }
  })

  test.each(["https://two.test/next", "http://one.test/next"])(
    "does not restore credentials after a redirect through %s",
    async (destination) => {
      const request = credentialRequest("https://one.test/start")
      const seen: Array<Array<[string, string]>> = []
      const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
        seen.push([...new Headers(init?.headers).entries()])
        if (seen.length > 2) return new Response("ok")
        return new Response(null, {
          status: 302,
          headers: { location: seen.length === 1 ? destination : "https://one.test/final" },
        })
      }) as typeof fetch

      await fetchWithHttpRedirects(
        request,
        new AbortController().signal,
        fetcher,
        10,
        undefined,
        false,
        undefined,
        () => true,
      )
      expect(Object.fromEntries(seen[0] ?? [])).toEqual(credentialHeaders)
      expect(seen[1]).toEqual([["x-trace", "public-trace"]])
      expect(seen[2]).toEqual([["x-trace", "public-trace"]])
      expect(
        Object.fromEntries(request.headers.map(([name, value]) => [name.toLowerCase(), value])),
      ).toEqual(credentialHeaders)
    },
  )
})
