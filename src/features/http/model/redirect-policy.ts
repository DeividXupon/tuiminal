import { httpHeaderSensitivity } from "./key-value"
import type { HttpPrivacyContext } from "./types"

export type HttpRedirectRisk = "body" | "private-url" | "downgrade" | "insecure-tls"
export type HttpRedirectApproval = Readonly<{
  executionId: string
  requestId: string
  hop: number
  fromOrigin: string
  toOrigin: string
  method: string
  displayUrl: string
  risks: readonly HttpRedirectRisk[]
  environmentName?: string | null
}>
export type HttpRedirectAuthorizer = (
  approval: HttpRedirectApproval,
  signal: AbortSignal,
) => boolean | Promise<boolean>

export class HttpRedirectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpRedirectError"
  }
}

export const HTTP_REDIRECT_DENIED =
  "Redirect não autorizado. A requisição anterior já pode ter sido processada; não a reenvie automaticamente."
export const HTTP_REDIRECT_REQUIRED =
  "Este redirect exige autorização explícita para o novo destino. A requisição anterior já pode ter sido processada."

export function httpRedirectUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error()
    url.hash = ""
    return url
  } catch {
    throw new HttpRedirectError(
      "O destino do redirect precisa ser HTTP/HTTPS e não pode conter credenciais na URL.",
    )
  }
}

export function redirectedHttpMethod(status: number, method: string) {
  if (status === 303 && method !== "HEAD") return "GET"
  if ((status === 301 || status === 302) && method === "POST") return "GET"
  return method
}

const BODY_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
  "content-location",
  "transfer-encoding",
])
export function redirectedHttpHeaders(
  headers: Array<[string, string]>,
  crossOrigin: boolean,
  dropsBody: boolean,
  privacy: HttpPrivacyContext,
  authenticationHeaders: readonly string[] = [],
) {
  const authNames = new Set(authenticationHeaders.map((name) => name.trim().toLowerCase()))
  return headers.filter(([name, value]) => {
    const normalized = name.toLowerCase()
    if (dropsBody && BODY_HEADERS.has(normalized)) return false
    if (!crossOrigin) return true
    return (
      !["host", "referer"].includes(normalized) &&
      !authNames.has(normalized) &&
      httpHeaderSensitivity(name) === "normal" &&
      // Header provenance is authoritative. Keep the privacy fallback for an
      // exact known private value without treating an incidental substring
      // overlap (for example `application` in a content type) as a credential.
      privacy.redactText(value) !== "<redacted>"
    )
  })
}

export function httpRedirectRisks({
  from,
  to,
  body,
  privateUrl,
  insecureTls,
}: {
  from: URL
  to: URL
  body: boolean
  privateUrl: boolean
  insecureTls: boolean
}): HttpRedirectRisk[] {
  const risks: HttpRedirectRisk[] = []
  if (from.origin !== to.origin && body) risks.push("body")
  if (from.origin !== to.origin && privateUrl) risks.push("private-url")
  if (from.protocol === "https:" && to.protocol === "http:") risks.push("downgrade")
  if (insecureTls) risks.push("insecure-tls")
  return risks
}
