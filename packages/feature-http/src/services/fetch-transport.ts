import type {
  HttpFailureKind,
  HttpPreparedRequest,
  HttpPrivacyContext,
  HttpResponseSnapshot,
} from "../model/types"
import {
  classifyResponseBody,
  DEFAULT_HTTP_CAPTURE_LIMIT,
  readLimitedResponseBody,
} from "./response-reader"
import { fetchWithHttpRedirects, HttpRedirectError } from "./redirects"
import type { HttpCookieJar } from "./cookies"
import { HttpInsecureTlsApprovalError, type HttpInsecureTlsAuthorizer } from "../model/tls-policy"
import { redactHttpUrlSecrets, redactKnownHttpSecrets } from "../model/secrets"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"

export type HttpExecutionErrorKind = Extract<
  HttpFailureKind,
  "cancelled" | "timeout" | "dns" | "network" | "tls" | "redirect"
>

export class HttpExecutionError extends Error {
  constructor(
    readonly kind: HttpExecutionErrorKind,
    message: string,
    readonly privacy?: HttpPrivacyContext,
  ) {
    super(message)
    this.name = "HttpExecutionError"
  }
}

type HeadersWithCookies = Headers & { getSetCookie?: () => string[] }

function responseHeaders(headers: Headers) {
  const result = Array.from(headers.entries()).filter(([name]) => name !== "set-cookie")
  const cookies = (headers as HeadersWithCookies).getSetCookie?.() ?? []
  for (const cookie of cookies) result.push(["set-cookie", cookie])
  return result
}

function declaredLength(headers: Headers) {
  const value = headers.get("content-length")
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function networkErrorKind(error: unknown): "dns" | "network" | "tls" {
  const details: string[] = []
  let current: unknown = error
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current instanceof Error) details.push(current.message, current.name)
    if (typeof current === "object") {
      const candidate = current as { code?: unknown; cause?: unknown }
      if (typeof candidate.code === "string") details.push(candidate.code)
      current = candidate.cause
    } else break
  }
  const detail = details.join(" ")
  if (/ENOTFOUND|EAI_AGAIN|dns|getaddrinfo/i.test(detail)) return "dns"
  if (/CERT|TLS|SSL|handshake|self.signed/i.test(detail)) return "tls"
  return "network"
}

function decodedProxyCredentials(proxyUrl: string) {
  try {
    const proxy = new URL(proxyUrl)
    return [proxy.username, proxy.password]
      .filter(Boolean)
      .map((value) => decodeURIComponent(value))
  } catch {
    return []
  }
}

function safeNetworkErrorDetail(
  error: unknown,
  request: HttpPreparedRequest,
  privacy?: HttpPrivacyContext,
) {
  const raw = error instanceof Error ? error.message : String(error)
  const detail = privacy?.redactText(raw) ?? raw
  if (!request.proxyUrl) return detail
  const credentials = decodedProxyCredentials(request.proxyUrl)
  return redactKnownHttpSecrets(
    detail.replaceAll(request.proxyUrl, redactHttpUrlSecrets(request.proxyUrl, credentials)),
    credentials,
  )
}

export function formatHttpTimeoutError(timeoutMs: number) {
  if (timeoutMs < 1_000) {
    return `O tempo limite de ${Math.max(1, Math.round(timeoutMs))} ms foi excedido.`
  }
  const seconds = timeoutMs / 1_000
  const formatted = Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(2).replace(/0+$/, "")
  return `O tempo limite de ${formatted} segundos foi excedido.`
}

export async function executePreparedHttpRequest(
  request: HttpPreparedRequest,
  signal?: AbortSignal,
  captureLimit = DEFAULT_HTTP_CAPTURE_LIMIT,
  cookieJar?: HttpCookieJar,
  authorizeInsecureTls: HttpInsecureTlsAuthorizer = false,
  authorizeRedirect?: HttpRedirectAuthorizer,
): Promise<HttpResponseSnapshot> {
  const timeoutSignal = AbortSignal.timeout(request.timeoutMs)
  const transport = new AbortController()
  const combinedSignal = AbortSignal.any([
    transport.signal,
    timeoutSignal,
    ...(signal ? [signal] : []),
  ])
  const startedAt = performance.now()
  let executionPrivacy = request.privacy

  try {
    const { response, redirects, privacy } = await fetchWithHttpRedirects(
      request,
      combinedSignal,
      fetch,
      10,
      cookieJar,
      authorizeInsecureTls,
      (privacy) => {
        executionPrivacy = privacy
      },
      authorizeRedirect,
    )
    const headersAt = performance.now()
    const { body, truncated } = await readLimitedResponseBody(response, captureLimit)
    const finishedAt = performance.now()
    const contentType = response.headers.get("content-type") ?? ""
    const declaredBytes = declaredLength(response.headers)

    return {
      privacy,
      executionId: request.executionId,
      requestId: request.requestId,
      requestRevision: request.requestRevision,
      url: response.url || request.url,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders(response.headers),
      body,
      bodyKind: classifyResponseBody(contentType),
      contentType,
      ...(declaredBytes === undefined ? {} : { declaredBytes }),
      capturedBytes: body.length,
      truncated,
      downloadedBytes: body.length,
      encoding: contentType.match(/charset=([^;\s]+)/i)?.[1] ?? "utf-8",
      redirects,
      timings: {
        headersMs: headersAt - startedAt,
        downloadMs: finishedAt - headersAt,
        totalMs: finishedAt - startedAt,
      },
    }
  } catch (error) {
    if (signal?.aborted)
      throw new HttpExecutionError("cancelled", "Requisição cancelada.", executionPrivacy)
    if (timeoutSignal.aborted) {
      throw new HttpExecutionError(
        "timeout",
        formatHttpTimeoutError(request.timeoutMs),
        executionPrivacy,
      )
    }
    if (error instanceof HttpRedirectError) {
      throw new HttpExecutionError(
        "redirect",
        safeNetworkErrorDetail(error, request, executionPrivacy),
        executionPrivacy,
      )
    }
    if (error instanceof HttpInsecureTlsApprovalError) throw error
    const detail = safeNetworkErrorDetail(error, request, executionPrivacy)
    throw new HttpExecutionError(
      networkErrorKind(error),
      `Não foi possível concluir a requisição: ${detail}`,
      executionPrivacy,
    )
  } finally {
    // On Bun, cancelling the reader alone may leave a continuous fetch receiving
    // bytes. Retire this request's native transport after capture or failure.
    transport.abort()
  }
}
