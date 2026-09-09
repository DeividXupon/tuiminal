import { httpHeaderSensitivity } from "./key-value"
import type { HttpPrivacyContext, HttpRequestDefinition, HttpVariableContext } from "./types"
import { resolveHttpTemplate } from "./variables"

function resolved(value: string, variables: HttpVariableContext) {
  try {
    return resolveHttpTemplate(value, variables)
  } catch {
    return value
  }
}

function urlSecretValues(value: string) {
  try {
    const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(value) ? value : `http://${value}`)
    const values = [url.username, url.password].map(decodedUrlComponent)
    for (const [name, entry] of url.searchParams) {
      if (/(?:token|key|secret|password|passwd|authorization|session|cookie)/i.test(name))
        values.push(entry)
    }
    return values.filter(Boolean)
  } catch {
    return []
  }
}

function authSecretValues(request: HttpRequestDefinition, variables: HttpVariableContext) {
  const auth = request.auth
  if (auth.kind === "bearer") return [resolved(auth.token, variables)]
  if (auth.kind === "api-key") return [resolved(auth.value, variables)]
  if (auth.kind !== "basic") return []
  const username = resolved(auth.username, variables)
  const password = resolved(auth.password, variables)
  return [password, Buffer.from(`${username}:${password}`).toString("base64")]
}

export function httpRequestSecretValues(
  request: HttpRequestDefinition,
  variables: HttpVariableContext,
) {
  const values = [...variables.values()]
    .filter((item) => item.secret)
    .map((item) => resolved(item.value, variables))
  const structured = [
    ...request.headers,
    ...request.query,
    ...request.path,
    ...request.body.form,
    ...(request.body.multipart ?? []),
  ]
  for (const item of structured) {
    if (item.sensitivity !== "normal" || httpHeaderSensitivity(item.name) !== "normal")
      values.push(resolved(item.value, variables))
  }
  values.push(...authSecretValues(request, variables))
  values.push(...urlSecretValues(resolved(request.options.proxy ?? "", variables)))
  values.push(...urlSecretValues(resolved(request.url, variables)))
  return [...new Set(values.filter(Boolean))].sort((left, right) => right.length - left.length)
}

export function redactKnownHttpSecrets(value: string, secretValues: readonly string[]) {
  return secretRedactor(secretValues)(value)
}

function secretRedactor(secretValues: readonly string[]) {
  const patterns = [...new Set(secretValues.filter(Boolean).flatMap(encodedSecretForms))]
    .sort((left, right) => right.length - left.length)
    .map(secretFormPattern)
  return (value: string) =>
    patterns.reduce((text, pattern) => text.replaceAll(pattern, "<redacted>"), value)
}

function secretFormPattern(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = escaped.replace(
    /(%(?:25)*)([a-f0-9]{2})/gi,
    (_match, prefix: string, hex: string) =>
      prefix +
      hex.replace(/[a-f]/gi, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`),
  )
  return new RegExp(pattern, "g")
}

function encodedSecretForms(secret: string) {
  // TextEncoder matches transport's replacement of unpaired UTF-16 surrogates.
  const wellFormed = new TextDecoder().decode(new TextEncoder().encode(secret))
  const encoded = encodeURIComponent(wellFormed)
  const escapedJson = JSON.stringify(secret).slice(1, -1)
  const variants = new Set([
    secret,
    wellFormed,
    encoded,
    encodeURIComponent(encoded),
    encoded.replace(/%20/g, "+"),
    escapedJson,
  ])
  for (const variant of [...variants])
    variants.add(variant.replace(/%[0-9A-F]{2}/g, (value) => value.toLowerCase()))
  return [...variants].sort((left, right) => right.length - left.length)
}

export function createHttpPrivacyContext(secretValues: readonly string[] = []): HttpPrivacyContext {
  const values = [...new Set(secretValues.filter(Boolean))]
  const redactText = secretRedactor(values)
  return Object.freeze({
    hasSecrets: values.length > 0,
    redactText,
    redactUrl: (value: string) => redactUrl(value, redactText),
    toJSON: () => undefined,
  })
}

export function httpHeadersPrivacy(headers: ReadonlyArray<readonly [string, string]>) {
  const values: string[] = []
  for (const [name, value] of headers) {
    if (httpHeaderSensitivity(name) === "normal") continue
    values.push(value)
    if (/^(?:set-cookie|cookie)$/i.test(name)) {
      const pairs = name.toLowerCase() === "cookie" ? value.split(";") : [value.split(";")[0] ?? ""]
      for (const pair of pairs) {
        const separator = pair.indexOf("=")
        if (separator >= 0) values.push(pair.slice(separator + 1).trim())
      }
    }
    if (/^(?:proxy-)?authorization$/i.test(name)) values.push(value.replace(/^\S+\s+/, ""))
  }
  return createHttpPrivacyContext(values)
}

export function requestHttpPrivacy(
  request: HttpRequestDefinition,
  variables: HttpVariableContext = new Map(),
) {
  return createHttpPrivacyContext(httpRequestSecretValues(request, variables))
}

const combinedContexts = new WeakMap<HttpPrivacyContext, readonly HttpPrivacyContext[]>()

export function combineHttpPrivacy(
  ...contexts: (HttpPrivacyContext | undefined)[]
): HttpPrivacyContext {
  const active = [
    ...new Set(
      contexts.flatMap((context) => (context ? (combinedContexts.get(context) ?? [context]) : [])),
    ),
  ]
  const combined = Object.freeze({
    hasSecrets: active.some((context) => context.hasSecrets),
    redactText: (value: string) =>
      active.reduce((text, context) => context.redactText(text), value),
    redactUrl: (value: string) => active.reduce((text, context) => context.redactUrl(text), value),
    toJSON: () => undefined,
  })
  combinedContexts.set(combined, active)
  return combined
}

export function httpProxyHasCredentials(value: string) {
  try {
    const proxy = new URL(/^[a-z][\w+.-]*:\/\//i.test(value) ? value : `http://${value}`)
    return Boolean(proxy.username || proxy.password)
  } catch {
    return false
  }
}

function decodedUrlComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function redactHttpUrlSecrets(value: string, secretValues: readonly string[]) {
  return redactUrl(value, secretRedactor(secretValues))
}

function redactUrl(value: string, redactText: (value: string) => string) {
  try {
    const url = new URL(value)
    if (url.username) url.username = "redacted"
    if (url.password) url.password = "redacted"
    for (const name of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(name)
      url.searchParams.delete(name)
      for (const entry of values) {
        url.searchParams.append(
          name,
          httpHeaderSensitivity(name) === "normal" ? redactText(entry) : "<redacted>",
        )
      }
    }
    url.pathname = redactText(decodedUrlComponent(url.pathname))
    url.hash = redactText(decodedUrlComponent(url.hash))
    return redactText(url.toString())
  } catch {
    return redactText(value)
  }
}
