import type { HttpPreparedRequest, HttpResponseSnapshot } from "../model/types"
import {
  classifyResponseBody,
  DEFAULT_HTTP_CAPTURE_LIMIT,
  readLimitedResponseBody,
} from "./response-reader"

export type HttpExecutionErrorKind = "cancelled" | "timeout" | "network"

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

export async function executePreparedHttpRequest(
  request: HttpPreparedRequest,
  signal?: AbortSignal,
  captureLimit = DEFAULT_HTTP_CAPTURE_LIMIT,
): Promise<HttpResponseSnapshot> {
  const timeoutSignal = AbortSignal.timeout(request.timeoutMs)
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const startedAt = performance.now()

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      redirect: request.followRedirects ? "follow" : "manual",
      signal: combinedSignal,
    })
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
    const detail = error instanceof Error ? error.message : String(error)
    throw new HttpExecutionError("network", `Não foi possível concluir a requisição: ${detail}`)
  }
}
