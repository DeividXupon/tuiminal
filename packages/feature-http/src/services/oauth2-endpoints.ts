import type { HttpOAuth2Auth } from "../model/oauth2"
import type { HttpVariableContext } from "../model/types"
import { resolveHttpTemplate } from "../model/variables"

export function oauthEndpoint(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("OAuth2: URL inválida.")
  }
  const loopback = ["127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) =>
      /^(client_secret|access_token|refresh_token|code_verifier|code)$/i.test(key),
    )
  )
    throw new Error("OAuth2: use HTTPS ou HTTP de loopback, sem credenciais na URL.")
  return url
}

export function resolvedOAuth2(
  auth: HttpOAuth2Auth,
  variables: HttpVariableContext,
): HttpOAuth2Auth {
  const resolved = { ...auth }
  for (const field of [
    "authorizationUrl",
    "tokenUrl",
    "clientId",
    "clientSecret",
    "scope",
    "audience",
    "redirectUri",
  ] as const)
    resolved[field] = resolveHttpTemplate(auth[field], variables)
  oauthEndpoint(resolved.tokenUrl)
  if (!resolved.clientId.trim()) throw new Error("OAuth2: informe o Client ID.")
  if (resolved.grantType === "client_credentials" && resolved.clientAuthentication === "none")
    throw new Error("OAuth2: Client Credentials exige autenticação do cliente.")
  return resolved
}

export type OAuthToken = { accessToken: string; refreshToken: string; expiresAt: number | null }
const TOKEN_BYTES = 128 * 1024
async function readTokenResponse(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("OAuth2: resposta de token inválida.")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > TOKEN_BYTES) throw new Error("OAuth2: resposta de token inválida.")
      chunks.push(result.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
const encoded = (value: string) => new URLSearchParams({ v: value }).toString().slice(2)

export async function exchangeOAuthToken(
  auth: HttpOAuth2Auth,
  fields: Record<string, string>,
  signal?: AbortSignal,
): Promise<OAuthToken> {
  const body = new URLSearchParams(fields)
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  })
  if (auth.clientAuthentication === "basic")
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${encoded(auth.clientId)}:${encoded(auth.clientSecret)}`).toString("base64")}`,
    )
  else {
    body.set("client_id", auth.clientId)
    if (auth.clientAuthentication === "body") body.set("client_secret", auth.clientSecret)
  }
  const timeout = AbortSignal.timeout(30_000)
  try {
    signal?.throwIfAborted()
    const response = await fetch(oauthEndpoint(auth.tokenUrl), {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error("OAuth2: falha ao obter token. Verifique as credenciais e o servidor.")
    }
    const value = await readTokenResponse(response)
    signal?.throwIfAborted()
    return validatedToken(value)
  } catch (error) {
    if (signal?.aborted) throw new Error("OAuth2: operação cancelada.")
    if (error instanceof Error && error.message.startsWith("OAuth2:")) throw error
    throw new Error("OAuth2: falha ao obter token. Verifique as credenciais e o servidor.")
  }
}

function validatedToken(value: Record<string, unknown>): OAuthToken {
  if (
    typeof value.access_token !== "string" ||
    !/^[A-Za-z0-9\-._~+/]+=*$/.test(value.access_token) ||
    String(value.token_type).toLowerCase() !== "bearer"
  )
    throw new Error("OAuth2: resposta de token inválida.")
  if (
    value.refresh_token !== undefined &&
    (typeof value.refresh_token !== "string" ||
      !value.refresh_token ||
      /[\r\n\0]/.test(value.refresh_token))
  )
    throw new Error("OAuth2: resposta de token inválida.")
  const seconds = value.expires_in === undefined ? null : Number(value.expires_in)
  if (seconds !== null && (!Number.isFinite(seconds) || seconds <= 0 || seconds > 315_360_000))
    throw new Error("OAuth2: resposta de token inválida.")
  return {
    accessToken: value.access_token,
    refreshToken: String(value.refresh_token ?? ""),
    expiresAt: seconds === null ? null : Date.now() + seconds * 1000,
  }
}
