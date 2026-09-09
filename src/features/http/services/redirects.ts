import type { HttpPreparedRequest, HttpPrivacyContext, HttpRedirectHop } from "../model/types"
import type { HttpCookieJar } from "./cookies"
import { combineHttpPrivacy, httpHeadersPrivacy } from "../model/secrets"
import { httpHeaderSensitivity } from "../model/key-value"
import {
  httpRedirectRisks,
  httpRedirectUrl,
  redirectedHttpHeaders,
  redirectedHttpMethod,
  HttpRedirectError,
  type HttpRedirectAuthorizer,
} from "../model/redirect-policy"
import { authorizeHttpRedirect } from "./redirect-authorization"
import { HttpRedirectCookiePolicy } from "./redirect-cookies"
export { HttpRedirectError } from "../model/redirect-policy"
import {
  allowsInsecureTls,
  HttpInsecureTlsApprovalError,
  type HttpInsecureTlsAuthorizer,
} from "../model/tls-policy"

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
function privateRedirectUrl(url: URL, privacy: HttpPrivacyContext) {
  return (
    privacy.redactText(url.href) !== url.href ||
    [...url.searchParams].some(([name, value]) => value && httpHeaderSensitivity(name) !== "normal")
  )
}

async function approveHop(
  request: HttpPreparedRequest,
  from: URL,
  to: URL,
  method: string,
  body: BodyInit | undefined,
  hop: number,
  privacy: HttpPrivacyContext,
  signal: AbortSignal,
  tlsAuthorizer: HttpInsecureTlsAuthorizer,
  authorize?: HttpRedirectAuthorizer,
) {
  const insecureTls = request.tlsVerification === "insecure" && to.protocol === "https:"
  const needsTls = insecureTls && !allowsInsecureTls(tlsAuthorizer, to.href)
  if (needsTls && !authorize) throw new HttpInsecureTlsApprovalError(to.href)
  const risks = httpRedirectRisks({
    from,
    to,
    body: body !== undefined && body !== "",
    privateUrl: privateRedirectUrl(to, privacy),
    insecureTls: needsTls,
  })
  await authorizeHttpRedirect(
    Object.freeze({
      executionId: request.executionId,
      requestId: request.requestId,
      hop,
      fromOrigin: from.origin,
      toOrigin: to.origin,
      method,
      displayUrl: privacy.redactUrl(to.href),
      risks: Object.freeze(risks),
    }),
    signal,
    authorize,
  )
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
  onPrivacy?: (privacy: HttpPrivacyContext) => void,
  authorizeRedirect?: HttpRedirectAuthorizer,
) {
  const activeCookieJar = request.useCookieJar === false ? undefined : cookieJar
  let url = request.url
  let method = request.method
  let headers = request.headers
  let body = request.body
  const visited = new Set<string>()
  const redirects: HttpRedirectHop[] = []
  let privacy = combineHttpPrivacy(request.privacy, httpHeadersPrivacy(request.headers))
  let previousUrl = url
  const cookiePolicy = new HttpRedirectCookiePolicy()
  cookiePolicy.learn(httpRedirectUrl(url).origin, privacy)

  while (true) {
    const target = httpRedirectUrl(url)
    const previous = httpRedirectUrl(previousUrl)
    if (visited.has(target.href))
      throw new HttpRedirectError("A requisição entrou em um loop de redirects.")
    visited.add(target.href)
    const insecureTls = await approveHop(
      request,
      previous,
      target,
      method,
      body,
      redirects.length,
      privacy,
      signal,
      authorizeInsecureTls,
      authorizeRedirect,
    )
    const cookie = cookiePolicy.header(target.origin, activeCookieJar?.header(url))
    const requestHeaders =
      cookie && !headers.some(([name]) => name.toLowerCase() === "cookie")
        ? [...headers, ["Cookie", cookie] as [string, string]]
        : headers
    privacy = combineHttpPrivacy(privacy, httpHeadersPrivacy(requestHeaders))
    cookiePolicy.learn(target.origin, httpHeadersPrivacy(requestHeaders))
    onPrivacy?.(privacy)
    const response = await fetcher(
      url,
      redirectFetchInit(request, method, requestHeaders, body, signal, insecureTls),
    )
    const responsePrivacy = combineHttpPrivacy(
      httpHeadersPrivacy([...response.headers.entries()]),
      httpHeadersPrivacy(response.headers.getSetCookie().map((value) => ["set-cookie", value])),
    )
    privacy = combineHttpPrivacy(privacy, responsePrivacy)
    cookiePolicy.learn(target.origin, responsePrivacy)
    onPrivacy?.(privacy)
    activeCookieJar?.store(url, response.headers)
    const location = response.headers.get("location")
    if (!request.followRedirects || !location || !REDIRECT_STATUSES.has(response.status)) {
      return { response, redirects, privacy }
    }
    if (redirects.length >= maximumRedirects) {
      await response.body?.cancel()
      throw new HttpRedirectError(`O limite de ${maximumRedirects} redirects foi excedido.`)
    }
    let nextUrl: URL
    try {
      nextUrl = httpRedirectUrl(location, url)
    } finally {
      await response.body?.cancel()
    }
    const crossOrigin = nextUrl.origin !== target.origin
    redirects.push({ status: response.status, url, location: nextUrl.href, crossOrigin })
    const nextMethod = redirectedHttpMethod(response.status, method)
    const dropsBody = nextMethod !== method
    headers = redirectedHttpHeaders(
      headers,
      crossOrigin,
      dropsBody,
      privacy,
      request.credentialHeaderNames,
    )
    method = nextMethod
    if (dropsBody) body = undefined
    previousUrl = url
    url = nextUrl.href
  }
}
