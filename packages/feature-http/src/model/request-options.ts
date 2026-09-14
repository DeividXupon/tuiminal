export const HTTP_TIMEOUT_OPTIONS = [5_000, 10_000, 30_000, 60_000, 120_000] as const

export function nextHttpTimeout(timeoutMs: number) {
  const current = HTTP_TIMEOUT_OPTIONS.indexOf(timeoutMs as (typeof HTTP_TIMEOUT_OPTIONS)[number])
  return HTTP_TIMEOUT_OPTIONS[(current + 1) % HTTP_TIMEOUT_OPTIONS.length] ?? 30_000
}

type RequestOptions = {
  timeoutMs: number
  followRedirects: boolean
  timeoutExplicit?: boolean
  followRedirectsExplicit?: boolean
  noLog?: boolean
}

export function cycleHttpRequestTimeout(options: RequestOptions): RequestOptions {
  if (!options.timeoutExplicit) {
    return { ...options, timeoutMs: HTTP_TIMEOUT_OPTIONS[0], timeoutExplicit: true }
  }
  if (options.timeoutMs === HTTP_TIMEOUT_OPTIONS.at(-1)) {
    return { ...options, timeoutMs: 30_000, timeoutExplicit: false }
  }
  return { ...options, timeoutMs: nextHttpTimeout(options.timeoutMs), timeoutExplicit: true }
}

export function cycleHttpRequestRedirects(options: RequestOptions): RequestOptions {
  if (!options.followRedirectsExplicit) {
    return { ...options, followRedirects: true, followRedirectsExplicit: true }
  }
  if (options.followRedirects) {
    return { ...options, followRedirects: false, followRedirectsExplicit: true }
  }
  return { ...options, followRedirects: true, followRedirectsExplicit: false }
}
