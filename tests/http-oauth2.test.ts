import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { defaultHttpOAuth2, parseHttpOAuth2 } from "../packages/feature-http/src/model/oauth2"
import { postmanOAuth2, remoteOAuth2 } from "../packages/feature-http/src/model/oauth2-postman"
import {
  exchangeOAuthToken,
  oauthEndpoint,
} from "../packages/feature-http/src/services/oauth2-endpoints"
import { authorizeOAuth2 } from "../packages/feature-http/src/services/oauth2-authorization"
import {
  clearHttpOAuthSessions,
  HttpOAuthSession,
  httpOAuthSession,
} from "../packages/feature-http/src/services/oauth2-session"

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(async () => {
  clearHttpOAuthSessions()
  for (const server of servers.splice(0)) await server.stop(true)
})
function provider(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler })
  servers.push(server)
  return {
    ...defaultHttpOAuth2(),
    clientId: "fixture-id",
    clientSecret: "fixture-secret",
    tokenUrl: `${server.url}token`,
  }
}
function token(name = "fixture-access", extra = {}) {
  return Response.json({ access_token: name, token_type: "Bearer", expires_in: 3600, ...extra })
}

describe("OAuth2 token lifecycle", () => {
  test("encodes Basic credentials and obtains client credentials once per scope", async () => {
    let calls = 0
    const config = provider(async (request) => {
      calls++
      expect(request.headers.get("authorization")).toBe(
        `Basic ${Buffer.from("id%3A+test:secret%26+test").toString("base64")}`,
      )
      expect(Object.fromEntries(new URLSearchParams(await request.text()))).toEqual({
        grant_type: "client_credentials",
        scope: "read write",
        audience: "api",
      })
      return token()
    })
    Object.assign(config, {
      clientId: "id: test",
      clientSecret: "secret& test",
      scope: "read write",
      audience: "api",
    })
    const first = httpOAuthSession(config, new Map(), "/fixture", "dev")
    expect(await first.getToken()).toBe("fixture-access")
    expect(await first.getToken()).toBe("fixture-access")
    expect(httpOAuthSession(config, new Map(), "/fixture", "dev")).toBe(first)
    expect(httpOAuthSession(config, new Map(), "/fixture", "prod")).not.toBe(first)
    expect(calls).toBe(1)
    expect(JSON.stringify(first.snapshot())).not.toContain("fixture-access")
  })
  test("renews expired tokens, rotates refresh tokens and retains omitted refresh tokens", async () => {
    const grants: Record<string, string>[] = []
    const config = provider(async (request) => {
      grants.push(Object.fromEntries(new URLSearchParams(await request.text())))
      return token(
        `access-${grants.length}`,
        grants.length === 1
          ? { expires_in: 0.001, refresh_token: "refresh-one" }
          : grants.length === 2
            ? { refresh_token: "refresh-two" }
            : {},
      )
    })
    const session = new HttpOAuthSession({ ...config, clientAuthentication: "body" })
    await session.getToken()
    expect(await session.getToken()).toBe("access-2")
    await session.getToken("refresh")
    await session.getToken("refresh")
    expect(grants.map((grant) => grant.grant_type)).toEqual([
      "client_credentials",
      "refresh_token",
      "refresh_token",
      "refresh_token",
    ])
    expect(grants.map((grant) => grant.refresh_token)).toEqual([
      undefined,
      "refresh-one",
      "refresh-two",
      "refresh-two",
    ])
    expect(grants[0]?.client_secret).toBe("fixture-secret")
  })
  test("coalesces acquisition and cancels only the retired consumer", async () => {
    let release!: () => void
    const received = Promise.withResolvers<void>()
    let calls = 0
    const config = provider(async () => {
      calls++
      received.resolve()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return token()
    })
    const session = new HttpOAuthSession(config)
    const controller = new AbortController()
    const first = session.getToken("use", controller.signal).catch((error: Error) => error.message)
    const second = session.getToken()
    await received.promise
    controller.abort()
    expect(await first).toContain("cancelada")
    release()
    expect(await second).toBe("fixture-access")
    expect(calls).toBe(1)
  })
  test("forget prevents stale publication and failed acquisition can be retried", async () => {
    const received = Promise.withResolvers<void>()
    let release!: () => void
    let calls = 0
    const config = provider(async () => {
      calls++
      if (calls === 1) {
        received.resolve()
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return token("stale")
      }
      if (calls === 2) return new Response("fixture-secret", { status: 401 })
      return token("fresh")
    })
    const session = new HttpOAuthSession(config)
    const pending = session.getToken().catch(() => null)
    await received.promise
    session.forget()
    release()
    expect(await pending).toBeNull()
    expect(session.snapshot().authorized).toBe(false)
    await expect(session.getToken()).rejects.toThrow("falha ao obter token")
    expect(session.snapshot().error).not.toContain("fixture-secret")
    expect(await session.getToken()).toBe("fresh")
    expect(session.snapshot().error).toBe("")
  })
  test("rejects unsafe endpoints, redirects and malformed tokens without exposing responses", async () => {
    for (const url of [
      "http://example.test/token",
      "https://user:secret@example.test",
      "https://example.test/?client_secret=secret",
    ])
      expect(() => oauthEndpoint(url)).toThrow()
    for (const response of [
      () => Response.json({ access_token: "bad\r\nheader", token_type: "Bearer" }),
      () => Response.json({ access_token: "fixture-secret", token_type: "MAC" }),
      () => new Response("x".repeat(131073)),
      () => Response.redirect("https://example.test", 302),
    ]) {
      const config = provider(response)
      const message = await exchangeOAuthToken(config, { grant_type: "client_credentials" }).then(
        () => "unexpected",
        (error: Error) => error.message,
      )
      expect(message).toStartWith("OAuth2:")
      expect(message).not.toContain("fixture-secret")
    }
  })
})

async function callbackUri() {
  const temporary = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const uri = `${temporary.url}callback`
  await temporary.stop(true)
  return uri
}

describe("Authorization Code with PKCE", () => {
  test("validates state without consuming login and exchanges a one-use S256 code", async () => {
    let authorization!: URL
    const config = provider(async (request) => {
      const body = new URLSearchParams(await request.text())
      expect(body.get("grant_type")).toBe("authorization_code")
      expect(body.get("code")).toBe("synthetic-code")
      expect(body.get("client_id")).toBe(config.clientId)
      expect(body.has("client_secret")).toBe(false)
      const challenge = authorization.searchParams.get("code_challenge")
      if (!challenge) throw new Error("Missing PKCE challenge")
      expect(
        createHash("sha256")
          .update(body.get("code_verifier") ?? "")
          .digest("base64url"),
      ).toBe(challenge)
      return token()
    })
    const ready = Promise.withResolvers<string>()
    const controller = new AbortController()
    const redirectUri = await callbackUri()
    const pending = authorizeOAuth2(
      {
        ...config,
        grantType: "authorization_code",
        clientAuthentication: "none",
        authorizationUrl: config.tokenUrl.replace("token", "authorize"),
        redirectUri,
      },
      ready.resolve,
      controller.signal,
    )
    try {
      authorization = new URL(await ready.promise)
      expect(authorization.searchParams.get("code_challenge_method")).toBe("S256")
      expect(authorization.searchParams.has("client_secret")).toBe(false)
      expect((await fetch(`${redirectUri}?state=wrong&code=synthetic-code`)).status).toBe(400)
      expect(
        (
          await fetch(
            `${redirectUri}?state=${authorization.searchParams.get("state")}&code=synthetic-code`,
          )
        ).status,
      ).toBe(200)
      expect((await pending).accessToken).toBe("fixture-access")
      await expect(fetch(redirectUri)).rejects.toThrow()
    } finally {
      controller.abort()
      await pending.catch(() => {})
    }
  })
  test("cancels the callback listener and supports a new login on the same port", async () => {
    const config = provider(() => token())
    const redirectUri = await callbackUri()
    const auth = {
      ...config,
      grantType: "authorization_code" as const,
      authorizationUrl: config.tokenUrl,
      redirectUri,
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController()
      const ready = Promise.withResolvers<string>()
      const pending = authorizeOAuth2(auth, ready.resolve, controller.signal)
      await ready.promise
      controller.abort()
      await expect(pending).rejects.toThrow("cancelada")
      await expect(fetch(redirectUri)).rejects.toThrow()
    }
    await expect(new HttpOAuthSession(auth).getToken()).rejects.toThrow("aba Autenticação")
  })
})

test("OAuth configuration roundtrips Postman and drops issued tokens", () => {
  const auth = { ...defaultHttpOAuth2(), clientId: "{{id}}", clientSecret: "{{secret}}" }
  expect(postmanOAuth2(remoteOAuth2(auth).oauth2)).toEqual(auth)
  const publicAuth = {
    ...auth,
    grantType: "authorization_code" as const,
    clientAuthentication: "none" as const,
    clientSecret: "",
  }
  expect(postmanOAuth2(remoteOAuth2(publicAuth).oauth2)).toEqual(publicAuth)
  expect(
    parseHttpOAuth2({ ...auth, accessToken: "private-token", refreshToken: "private-refresh" }),
  ).toEqual(auth)
  expect(postmanOAuth2([{ key: "grant_type", value: "password" }])).toBeUndefined()
})
