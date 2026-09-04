import type { HttpFailureKind, HttpPreparedRequest, HttpResponseSnapshot } from "../model/types"
import {
  classifyResponseBody,
  DEFAULT_HTTP_CAPTURE_LIMIT,
  readLimitedResponseBody,
} from "./response-reader"
import { fetchWithHttpRedirects, HttpRedirectError } from "./redirects"
import type { HttpCookieJar } from "./cookies"

export type HttpExecutionErrorKind = Extract<
  HttpFailureKind,
  "cancelled" | "timeout" | "dns" | "network" | "tls" | "redirect"
>

export class HttpExecutionError extends Error {
  constructor(
    readonly kind: HttpExecutionErrorKind,
    message: string,
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

export async function executePreparedHttpRequest(
  request: HttpPreparedRequest,
  signal?: AbortSignal,
  captureLimit = DEFAULT_HTTP_CAPTURE_LIMIT,
  cookieJar?: HttpCookieJar,
): Promise<HttpResponseSnapshot> {
  const timeoutSignal = AbortSignal.timeout(request.timeoutMs)
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const startedAt = performance.now()

  try {
    const { response, redirects } = await fetchWithHttpRedirects(
      request,
      combinedSignal,
      fetch,
      10,
      cookieJar,
    )
    const headersAt = performance.now()
    const { body, truncated } = await readLimitedResponseBody(response, captureLimit)
    const finishedAt = performance.now()
    const contentType = response.headers.get("content-type") ?? ""
    const declaredBytes = declaredLength(response.headers)

    return {
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
    if (signal?.aborted) throw new HttpExecutionError("cancelled", "Requisição cancelada.")
    if (timeoutSignal.aborted) {
      throw new HttpExecutionError(
        "timeout",
        `O tempo limite de ${Math.round(request.timeoutMs / 1_000)} segundos foi excedido.`,
      )
    }
    if (error instanceof HttpRedirectError) {
      throw new HttpExecutionError("redirect", error.message)
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new HttpExecutionError(
      networkErrorKind(error),
      `Não foi possível concluir a requisição: ${detail}`,
    )
  }
}
