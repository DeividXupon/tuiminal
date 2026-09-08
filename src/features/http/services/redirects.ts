import type { HttpPreparedRequest, HttpRedirectHop } from "../model/types"
import type { HttpCookieJar } from "./cookies"
import {
  allowsInsecureTls,
  HttpInsecureTlsApprovalError,
  type HttpInsecureTlsAuthorizer,
} from "../model/tls-policy"

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const CROSS_ORIGIN_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
])

export class HttpRedirectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HttpRedirectError"
  }
}

function redirectedMethod(status: number, method: string) {
  if (status === 303 && method !== "HEAD") return "GET"
  if ((status === 301 || status === 302) && method === "POST") return "GET"
  return method
}

function redirectHeaders(
  headers: Array<[string, string]>,
  crossOrigin: boolean,
  dropsBody: boolean,
) {
  return headers.filter(([name]) => {
    const normalized = name.toLowerCase()
    if (crossOrigin && CROSS_ORIGIN_HEADERS.has(normalized)) return false
    if (dropsBody && (normalized === "content-type" || normalized === "content-length"))
      return false
    return true
  })
}

function validateRedirectHop(
  request: HttpPreparedRequest,
  url: string,
  visited: Set<string>,
  authorizeInsecureTls: HttpInsecureTlsAuthorizer,
) {
  if (visited.has(url)) throw new HttpRedirectError("A requisição entrou em um loop de redirects.")
  visited.add(url)
  const insecureTls = request.tlsVerification === "insecure" && new URL(url).protocol === "https:"
  if (insecureTls && !allowsInsecureTls(authorizeInsecureTls, url)) {
    throw new HttpInsecureTlsApprovalError(url)
  }
  return insecureTls
}

function redirectFetchInit(
  request: HttpPreparedRequest,
  method: string,
  headers: Array<[string, string]>,
  body: BodyInit | undefined,
  signal: AbortSignal,
  insecureTls: boolean,
): BunFetchRequestInit {
  return {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    redirect: "manual",
    signal,
    ...(request.proxyUrl ? { proxy: request.proxyUrl } : {}),
    ...(insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
  }
}

export async function fetchWithHttpRedirects(
  request: HttpPreparedRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  maximumRedirects = 10,
  cookieJar?: HttpCookieJar,
  authorizeInsecureTls: HttpInsecureTlsAuthorizer = false,
) {
  const activeCookieJar = request.useCookieJar === false ? undefined : cookieJar
  let url = request.url
  let method = request.method
  let headers = request.headers
  let body = request.body
  const visited = new Set<string>()
  const redirects: HttpRedirectHop[] = []

  while (true) {
    const insecureTls = validateRedirectHop(request, url, visited, authorizeInsecureTls)
    const cookie = activeCookieJar?.header(url)
    const requestHeaders =
      cookie && !headers.some(([name]) => name.toLowerCase() === "cookie")
        ? [...headers, ["Cookie", cookie] as [string, string]]
        : headers
    const response = await fetcher(
      url,
      redirectFetchInit(request, method, requestHeaders, body, signal, insecureTls),
    )
    activeCookieJar?.store(url, response.headers)
    const location = response.headers.get("location")
    if (!request.followRedirects || !location || !REDIRECT_STATUSES.has(response.status)) {
      return { response, redirects }
    }
    if (redirects.length >= maximumRedirects) {
      await response.body?.cancel()
      throw new HttpRedirectError(`O limite de ${maximumRedirects} redirects foi excedido.`)
    }
    const nextUrl = new URL(location, url).toString()
    const crossOrigin = new URL(nextUrl).origin !== new URL(url).origin
    redirects.push({ status: response.status, url, location: nextUrl, crossOrigin })
    await response.body?.cancel()
    const nextMethod = redirectedMethod(response.status, method)
    const dropsBody = nextMethod !== method
    headers = redirectHeaders(headers, crossOrigin, dropsBody)
    method = nextMethod
    if (dropsBody) body = undefined
    url = nextUrl
  }
}
