type HeadersWithCookies = Headers & { getSetCookie?: () => string[] }

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

function applyCookieAttribute(cookie: HttpCookie, segment: string, responseUrl: URL, now: number) {
  const [rawName, ...rawValue] = segment.trim().split("=")
  const attribute = rawName?.toLowerCase()
  const value = rawValue.join("=").trim()
  if (attribute === "domain" && value) {
    const domain = value.replace(/^\./, "").toLowerCase()
    if (!domainMatches(responseUrl.hostname.toLowerCase(), domain, false)) return false
    cookie.domain = domain
    cookie.hostOnly = false
  } else if (attribute === "path" && value.startsWith("/")) cookie.path = value
  else if (attribute === "secure") cookie.secure = true
  else if (attribute === "httponly") cookie.httpOnly = true
  else if (attribute === "expires") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) cookie.expiresAt = parsed
  } else if (attribute === "max-age" && /^-?\d+$/.test(value)) {
    const seconds = Number(value)
    cookie.expiresAt = seconds <= 0 ? 0 : now + seconds * 1_000
  } else if (attribute === "samesite") {
    const sameSite = normalizedSameSite(value)
    if (sameSite) cookie.sameSite = sameSite
  }
  return true
}

function parseCookie(source: string, responseUrl: URL, now: number): HttpCookie | null {
  const segments = source.split(";")
  const first = segments.shift()?.trim() ?? ""
  const separator = first.indexOf("=")
  if (separator <= 0) return null
  const name = first.slice(0, separator).trim()
  if (!name || /[\s;,=]/.test(name)) return null
  const cookie: HttpCookie = {
    name,
    value: first.slice(separator + 1),
    domain: responseUrl.hostname.toLowerCase(),
    path: defaultCookiePath(responseUrl.pathname),
    secure: false,
    httpOnly: false,
    hostOnly: true,
  }
  let maxAgeExpiresAt: number | undefined
  for (const segment of segments) {
    if (!applyCookieAttribute(cookie, segment, responseUrl, now)) return null
    const [rawName, ...rawValue] = segment.trim().split("=")
    const value = rawValue.join("=").trim()
    if (rawName?.toLowerCase() === "max-age" && /^-?\d+$/.test(value)) {
      const seconds = Number(value)
      maxAgeExpiresAt = seconds <= 0 ? 0 : now + seconds * 1_000
    }
  }
  // RFC 6265 gives Max-Age precedence even when Expires appears later.
  if (maxAgeExpiresAt !== undefined) cookie.expiresAt = maxAgeExpiresAt
  return cookie
}

export class HttpCookieJar {
  private readonly cookies = new Map<string, HttpCookie>()

  private key(cookie: Pick<HttpCookie, "name" | "domain" | "path">) {
    return `${cookie.domain}\n${cookie.path}\n${cookie.name}`
  }

  store(url: string, headers: Headers, now = Date.now()) {
    const responseUrl = new URL(url)
    for (const value of readHttpSetCookieHeaders(headers)) {
      const cookie = parseCookie(value, responseUrl, now)
      if (!cookie) continue
      const key = this.key(cookie)
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) this.cookies.delete(key)
      else this.cookies.set(key, cookie)
    }
    this.removeExpired(now)
  }

  header(url: string, now = Date.now()) {
    this.removeExpired(now)
    const requestUrl = new URL(url)
    return [...this.cookies.values()]
      .filter(
        (cookie) =>
          (!cookie.secure || requestUrl.protocol === "https:") &&
          domainMatches(requestUrl.hostname.toLowerCase(), cookie.domain, cookie.hostOnly) &&
          pathMatches(requestUrl.pathname, cookie.path),
      )
      .sort((left, right) => right.path.length - left.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ")
  }

  list(now = Date.now()) {
    this.removeExpired(now)
    return [...this.cookies.values()].map((cookie) => ({ ...cookie }))
  }

  clear() {
    this.cookies.clear()
  }

  private removeExpired(now: number) {
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) this.cookies.delete(key)
    }
  }
}
