import { isIP } from "node:net"
import { domainToASCII } from "node:url"
import { parse as parseDomain } from "tldts"
import { httpEnvironmentScopeDirectory } from "../model/environment-scope"
import type { HttpRequestDefinition } from "../model/types"

type HeadersWithCookies = Headers & { getSetCookie?: () => string[] }

export const HTTP_COOKIE_LIMITS = {
  cookieBytes: 4_096,
  cookiesPerDomain: 50,
  cookiesTotal: 300,
  headerBytes: 8_192,
  setCookieHeaders: 100,
  lifetimeMs: 400 * 24 * 60 * 60 * 1_000,
} as const

export type HttpCookie = {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
  expiresAt?: number
  sameSite?: "strict" | "lax" | "none"
}

export type HttpCookieJarResolver = (request: HttpRequestDefinition) => HttpCookieJar

export function httpCookieJarScopeKey(
  request: HttpRequestDefinition,
  environmentName: string | null,
) {
  const path = request.source.kind === "file" ? request.source.path : null
  const directory = httpEnvironmentScopeDirectory(path)
  return `${directory || "__project_root__"}\n${environmentName ?? "__no_environment__"}`
}

export class HttpCookieJarStore {
  private readonly jars = new Map<string, HttpCookieJar>()

  forRequest(request: HttpRequestDefinition, environmentName: string | null) {
    const key = httpCookieJarScopeKey(request, environmentName)
    const existing = this.jars.get(key)
    if (existing) return existing
    const jar = new HttpCookieJar()
    this.jars.set(key, jar)
    return jar
  }

  clear() {
    for (const jar of this.jars.values()) jar.clear()
    this.jars.clear()
  }
}

export function readHttpSetCookieHeaders(headers: Headers) {
  const values = (headers as HeadersWithCookies).getSetCookie?.()
  if (values?.length) return values
  const value = headers.get("set-cookie")
  return value ? [value] : []
}

function defaultCookiePath(pathname: string) {
  if (!pathname.startsWith("/") || pathname === "/") return "/"
  const lastSlash = pathname.lastIndexOf("/")
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash)
}

function canonicalRequestHostname(url: URL) {
  const hostname = url.hostname.toLowerCase()
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname
}

function canonicalCookieDomain(value: string) {
  const withoutDot = value.replace(/^\./u, "").toLowerCase()
  if (!withoutDot || withoutDot.endsWith(".") || isIP(withoutDot)) return null
  const ascii = domainToASCII(withoutDot).toLowerCase()
  if (
    !ascii ||
    ascii.length > 253 ||
    ascii.split(".").some((label) => !label || label.length > 63)
  ) {
    return null
  }
  return ascii
}

function publicSuffix(domain: string) {
  const result = parseDomain(domain, { allowPrivateDomains: true, extractHostname: false })
  return Boolean(
    (result.isIcann || result.isPrivate) &&
      result.domain === null &&
      result.publicSuffix === domain,
  )
}

function domainMatches(hostname: string, domain: string, hostOnly: boolean) {
  return hostOnly ? hostname === domain : hostname === domain || hostname.endsWith(`.${domain}`)
}

function pathMatches(pathname: string, cookiePath: string) {
  if (pathname === cookiePath) return true
  if (!pathname.startsWith(cookiePath)) return false
  return cookiePath.endsWith("/") || pathname[cookiePath.length] === "/"
}

function normalizedSameSite(value: string): NonNullable<HttpCookie["sameSite"]> | undefined {
  const normalized = value.toLowerCase()
  return normalized === "strict" || normalized === "lax" || normalized === "none"
    ? normalized
    : undefined
}

function boundedExpiry(expiresAt: number | undefined, now: number) {
  if (expiresAt === undefined || expiresAt <= now) return expiresAt
  return Math.min(expiresAt, now + HTTP_COOKIE_LIMITS.lifetimeMs)
}

function validCookiePrefix(
  cookie: HttpCookie,
  responseUrl: URL,
  domainAttribute: boolean,
  pathAttribute: boolean,
) {
  const secureOrigin = responseUrl.protocol === "https:"
  if (cookie.secure && !secureOrigin) return false
  if (cookie.sameSite === "none" && !cookie.secure) return false
  if (cookie.name.startsWith("__Secure-") && (!cookie.secure || !secureOrigin)) return false
  if (!cookie.name.startsWith("__Host-")) return true
  return cookie.secure && secureOrigin && !domainAttribute && pathAttribute && cookie.path === "/"
}

function validCookieValue(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f || character === ";") return false
  }
  return true
}

type CookieParseState = {
  cookie: HttpCookie
  domainAttribute: boolean
  pathAttribute: boolean
  maxAgeExpiresAt?: number
}

function applyCookieDomain(value: string, state: CookieParseState, responseUrl: URL) {
  if (!value) return true
  const domain = canonicalCookieDomain(value)
  if (
    !domain ||
    publicSuffix(domain) ||
    !domainMatches(canonicalRequestHostname(responseUrl), domain, false)
  ) {
    return false
  }
  state.cookie.domain = domain
  state.cookie.hostOnly = false
  state.domainAttribute = true
  return true
}

function applyCookieAttribute(
  segment: string,
  state: CookieParseState,
  responseUrl: URL,
  now: number,
) {
  const [rawName, ...rawValue] = segment.trim().split("=")
  const attribute = rawName?.toLowerCase()
  const value = rawValue.join("=").trim()
  if (attribute === "domain") return applyCookieDomain(value, state, responseUrl)
  if (attribute === "path" && value.startsWith("/")) {
    state.cookie.path = value
    state.pathAttribute = true
    return true
  }
  if (attribute === "secure") state.cookie.secure = true
  else if (attribute === "httponly") state.cookie.httpOnly = true
  else if (attribute === "expires") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) state.cookie.expiresAt = parsed
  } else if (attribute === "max-age" && /^-?\d+$/u.test(value)) {
    const seconds = Number(value)
    if (Number.isFinite(seconds)) {
      state.maxAgeExpiresAt = seconds <= 0 ? 0 : now + seconds * 1_000
    }
  } else if (attribute === "samesite") {
    const sameSite = normalizedSameSite(value)
    if (sameSite) state.cookie.sameSite = sameSite
  }
  return true
}

function parseCookie(source: string, responseUrl: URL, now: number): HttpCookie | null {
  if (Buffer.byteLength(source, "utf8") > HTTP_COOKIE_LIMITS.cookieBytes) return null
  const segments = source.split(";")
  const first = segments.shift()?.trim() ?? ""
  const separator = first.indexOf("=")
  if (separator <= 0) return null
  const name = first.slice(0, separator).trim()
  const value = first.slice(separator + 1)
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)) return null
  if (!validCookieValue(value)) return null
  const state: CookieParseState = {
    cookie: {
      name,
      value,
      domain: canonicalRequestHostname(responseUrl),
      path: defaultCookiePath(responseUrl.pathname),
      secure: false,
      httpOnly: false,
      hostOnly: true,
    },
    domainAttribute: false,
    pathAttribute: false,
  }
  for (const segment of segments) {
    if (!applyCookieAttribute(segment, state, responseUrl, now)) return null
  }
  // RFC 6265 gives Max-Age precedence even when Expires appears later.
  if (state.maxAgeExpiresAt !== undefined) state.cookie.expiresAt = state.maxAgeExpiresAt
  const expiresAt = boundedExpiry(state.cookie.expiresAt, now)
  if (expiresAt === undefined) delete state.cookie.expiresAt
  else state.cookie.expiresAt = expiresAt
  return validCookiePrefix(state.cookie, responseUrl, state.domainAttribute, state.pathAttribute)
    ? state.cookie
    : null
}

function cookieBytes(cookie: HttpCookie) {
  return Buffer.byteLength(`${cookie.name}=${cookie.value}`, "utf8")
}

export class HttpCookieJar {
  private readonly cookies = new Map<string, HttpCookie>()

  private key(cookie: Pick<HttpCookie, "name" | "domain" | "path">) {
    return `${cookie.domain}\n${cookie.path}\n${cookie.name}`
  }

  store(url: string, headers: Headers, now = Date.now()) {
    const responseUrl = new URL(url)
    const secureOrigin = responseUrl.protocol === "https:"
    for (const value of readHttpSetCookieHeaders(headers).slice(
      0,
      HTTP_COOKIE_LIMITS.setCookieHeaders,
    )) {
      const cookie = parseCookie(value, responseUrl, now)
      if (!cookie) continue
      const key = this.key(cookie)
      const existing = this.cookies.get(key)
      if (!secureOrigin && existing?.secure) continue
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        this.cookies.delete(key)
        continue
      }
      this.cookies.delete(key)
      this.cookies.set(key, cookie)
      this.enforceLimits(cookie.domain)
    }
    this.removeExpired(now)
  }

  header(url: string, now = Date.now()) {
    this.removeExpired(now)
    const requestUrl = new URL(url)
    const hostname = canonicalRequestHostname(requestUrl)
    const matches = [...this.cookies.values()]
      .filter(
        (cookie) =>
          (!cookie.secure || requestUrl.protocol === "https:") &&
          domainMatches(hostname, cookie.domain, cookie.hostOnly) &&
          pathMatches(requestUrl.pathname, cookie.path),
      )
      .sort((left, right) => right.path.length - left.path.length)
    const parts: string[] = []
    let bytes = 0
    for (const cookie of matches) {
      const part = `${cookie.name}=${cookie.value}`
      const nextBytes = cookieBytes(cookie) + (parts.length ? 2 : 0)
      if (bytes + nextBytes > HTTP_COOKIE_LIMITS.headerBytes) continue
      parts.push(part)
      bytes += nextBytes
    }
    return parts.join("; ")
  }

  list(now = Date.now()) {
    this.removeExpired(now)
    return [...this.cookies.values()].map((cookie) => ({ ...cookie }))
  }

  clear() {
    this.cookies.clear()
  }

  private enforceLimits(domain: string) {
    const domainKeys = [...this.cookies]
      .filter(([, cookie]) => cookie.domain === domain)
      .map(([key]) => key)
    for (const key of domainKeys.slice(0, -HTTP_COOKIE_LIMITS.cookiesPerDomain)) {
      this.cookies.delete(key)
    }
    while (this.cookies.size > HTTP_COOKIE_LIMITS.cookiesTotal) {
      const oldest = this.cookies.keys().next().value
      if (oldest === undefined) break
      this.cookies.delete(oldest)
    }
  }

  private removeExpired(now: number) {
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) this.cookies.delete(key)
    }
  }
}
