import { httpHeaderSensitivity } from "./key-value"
import { combineHttpPrivacy, httpHeadersPrivacy, redactHttpUrlSecrets } from "./secrets"
import type { HttpAssertionResult, HttpHistoryEntry, HttpPrivacyContext } from "./types"

export const HTTP_ENVIRONMENT_PREPARATION_ERROR =
  "Não foi possível preparar a requisição com o ambiente selecionado."

export function redactHttpAssertions(
  assertions: HttpAssertionResult[],
  privacy: HttpPrivacyContext,
) {
  const text = (value: string) => redactHttpDiagnostic(privacy.redactText(value))
  return assertions.map((assertion) => ({
    ...assertion,
    id: text(assertion.id),
    expression: text(assertion.expression),
    // Actual may contain the entire response, including encodings we cannot
    // reliably recognize. Keep it in the active snapshot, never in private reports.
    actual: privacy.hasSecrets ? "<redacted>" : text(assertion.actual),
    message: text(assertion.message),
  }))
}

export function redactHttpHistoryUrl(value: string) {
  const redacted = redactHttpUrlSecrets(value, [])
  try {
    const url = new URL(redacted)
    for (const name of new Set(url.searchParams.keys())) {
      if (/(?:token|key|secret|password|passwd|authorization|session|cookie)/i.test(name)) {
        url.searchParams.set(name, "<redacted>")
      }
    }
    return url.toString()
  } catch {
    return redacted.replace(
      /([?&](?:token|key|secret|password|passwd|authorization|session|cookie)=)[^&\s]*/gi,
      "$1<redacted>",
    )
  }
}

export function redactHttpDiagnostic(value: string) {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 <redacted>")
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1redacted@")
    .replace(
      /([?&](?:token|key|secret|password|passwd|authorization|session|cookie)=)[^&\s]*/gi,
      "$1<redacted>",
    )
}

// A history snapshot is separate from the exact, volatile active response. Never
// mutate its body/headers or turn a masked URL into a request to execute.
export function redactHttpHistoryEntry(
  entry: HttpHistoryEntry,
): HttpHistoryEntry & { privacy: HttpPrivacyContext } {
  const privacy = combineHttpPrivacy(
    entry.privacy,
    entry.response?.privacy,
    httpHeadersPrivacy(entry.response?.headers ?? []),
  )
  const textCache = new Map<string, string>()
  const urlCache = new Map<string, string>()
  const text = (value: string) => {
    const cached = textCache.get(value)
    if (cached !== undefined) return cached
    const redacted = redactHttpDiagnostic(privacy.redactText(value))
    textCache.set(value, redacted)
    return redacted
  }
  const url = (value: string) => {
    const cached = urlCache.get(value)
    if (cached !== undefined) return cached
    const redacted = redactHttpHistoryUrl(privacy.redactUrl(value))
    urlCache.set(value, redacted)
    return redacted
  }
  const response = entry.response
  return {
    ...entry,
    privacy,
    requestName: text(entry.requestName),
    method: text(entry.method),
    environmentName: entry.environmentName === null ? null : text(entry.environmentName),
    url: url(entry.url),
    error: entry.error === null ? null : text(entry.error),
    ...(response
      ? {
          response: {
            ...response,
            privacy,
            url: url(response.url),
            statusText: text(response.statusText),
            contentType: text(response.contentType),
            encoding: text(response.encoding),
            headers: response.headers.map(([name, value]): [string, string] => [
              text(name),
              httpHeaderSensitivity(name) === "normal" ? text(value) : "<redacted>",
            ]),
            redirects: response.redirects.map((hop) => ({
              ...hop,
              url: url(hop.url),
              location: url(hop.location),
            })),
            ...(response.assertions
              ? { assertions: redactHttpAssertions(response.assertions, privacy) }
              : {}),
          },
        }
      : {}),
  }
}

export function httpHistoryErrorPrivacy(context: HttpPrivacyContext, message: string) {
  return redactHttpDiagnostic(context.redactText(message))
}
