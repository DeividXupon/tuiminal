import { createHash } from "node:crypto"
import type { HttpOAuth2Auth } from "../model/oauth2"
import type { HttpRequestDefinition, HttpVariableContext } from "../model/types"
import { HTTP_WORKING_DIRECTORY } from "./context"
import { authorizeOAuth2 } from "./oauth2-authorization"
import { exchangeOAuthToken, resolvedOAuth2, type OAuthToken } from "./oauth2-endpoints"

type OAuthState = {
  pending: boolean
  authorized: boolean
  expiresAt: number | null
  authorizationUrl: string
  error: string
}
type Pending = { controller: AbortController; promise: Promise<OAuthToken>; consumers: number }

export class HttpOAuthSession {
  private token: OAuthToken | null = null
  private pending: Pending | null = null
  private listeners = new Set<() => void>()
  private state: OAuthState = {
    pending: false,
    authorized: false,
    expiresAt: null,
    authorizationUrl: "",
    error: "",
  }
  constructor(readonly config: HttpOAuth2Auth) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<OAuthState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  forget() {
    this.pending?.controller.abort()
    this.pending = null
    this.token = null
    this.update({
      pending: false,
      authorized: false,
      expiresAt: null,
      authorizationUrl: "",
      error: "",
    })
  }
  private async exchange(mode: "use" | "acquire" | "refresh", signal: AbortSignal) {
    const refreshToken = this.token?.refreshToken
    if (mode !== "acquire" && refreshToken) {
      const token = await exchangeOAuthToken(
        this.config,
        { grant_type: "refresh_token", refresh_token: refreshToken },
        signal,
      )
      return { ...token, refreshToken: token.refreshToken || refreshToken }
    }
    if (this.config.grantType === "client_credentials")
      return exchangeOAuthToken(
        this.config,
        {
          grant_type: "client_credentials",
          ...(this.config.scope ? { scope: this.config.scope } : {}),
          ...(this.config.audience ? { audience: this.config.audience } : {}),
        },
        signal,
      )
    if (mode !== "acquire") throw new Error("OAuth2: autorize esta requisição na aba Autenticação.")
    return authorizeOAuth2(
      this.config,
      (authorizationUrl) => this.update({ authorizationUrl }),
      signal,
    )
  }
  private start(mode: "use" | "acquire" | "refresh") {
    const controller = new AbortController()
    const pending: Pending = {
      controller,
      promise: Promise.resolve().then(() => this.exchange(mode, controller.signal)),
      consumers: 0,
    }
    this.pending = pending
    this.update({ pending: true, authorizationUrl: "", error: "" })
    pending.promise = pending.promise
      .then((token) => {
        pending.controller.signal.throwIfAborted()
        if (this.pending === pending) {
          this.token = token
          this.update({ authorized: true, expiresAt: token.expiresAt })
        }
        return token
      })
      .catch((error: unknown) => {
        if (this.pending === pending)
          this.update({
            error: pending.controller.signal.aborted
              ? "OAuth2: operação cancelada."
              : error instanceof Error
                ? error.message
                : "OAuth2: resposta de token inválida.",
          })
        throw error
      })
      .finally(() => {
        if (this.pending === pending) {
          this.pending = null
          this.update({ pending: false, authorizationUrl: "" })
        }
      })
    return pending
  }
  async getToken(mode: "use" | "acquire" | "refresh" = "use", signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (
      mode === "use" &&
      this.token &&
      (this.token.expiresAt === null || this.token.expiresAt > Date.now() + 1000)
    )
      return this.token.accessToken
    const pending =
      this.pending && !this.pending.controller.signal.aborted ? this.pending : this.start(mode)
    pending.consumers++
    const token = await new Promise<OAuthToken>((resolve, reject) => {
      let completed = false
      const finish = (value?: OAuthToken, error?: unknown) => {
        if (completed) return
        completed = true
        signal?.removeEventListener("abort", abort)
        pending.consumers--
        if (!pending.consumers && this.pending === pending) pending.controller.abort()
        if (error) reject(error)
        else if (value) resolve(value)
      }
      const abort = () => finish(undefined, new Error("OAuth2: operação cancelada."))
      signal?.addEventListener("abort", abort, { once: true })
      pending.promise.then(
        (value) => finish(value),
        (error) => finish(undefined, error),
      )
      if (signal?.aborted) abort()
    })
    return token.accessToken
  }
}

const sessions = new Map<string, HttpOAuthSession>()
export function httpOAuthSession(
  auth: HttpOAuth2Auth,
  variables: HttpVariableContext = new Map(),
  root = HTTP_WORKING_DIRECTORY,
  environmentName: string | null = null,
) {
  const config = resolvedOAuth2(auth, variables)
  const key = createHash("sha256")
    .update(JSON.stringify([root, environmentName, config]))
    .digest("hex")
  const existing = sessions.get(key)
  if (existing) {
    sessions.delete(key)
    sessions.set(key, existing)
    return existing
  }
  if (sessions.size >= 128) {
    const oldest = [...sessions].find(([, session]) => !session.snapshot().pending)
    if (!oldest) throw new Error("OAuth2: muitas autorizações em andamento.")
    oldest[1].forget()
    sessions.delete(oldest[0])
  }
  const session = new HttpOAuthSession(config)
  sessions.set(key, session)
  return session
}

export function clearHttpOAuthSessions() {
  for (const session of sessions.values()) session.forget()
  sessions.clear()
}

export async function authorizeHttpRequest(
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
  root: string,
  environmentName: string | null,
  signal?: AbortSignal,
) {
  if (request.auth.kind !== "oauth2") return request
  const token = await httpOAuthSession(request.auth, variables, root, environmentName).getToken(
    "use",
    signal,
  )
  return { ...request, auth: { kind: "bearer" as const, token } }
}
