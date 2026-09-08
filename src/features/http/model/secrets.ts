import { httpHeaderSensitivity } from "./key-value"
import type { HttpRequestDefinition, HttpVariableContext } from "./types"
import { resolveHttpTemplate } from "./variables"

function resolved(value: string, variables: HttpVariableContext) {
  try {
    return resolveHttpTemplate(value, variables)
  } catch {
    return value
  }
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
    ...request.body.form,
    ...(request.body.multipart ?? []),
  ]
  for (const item of structured) {
    if (item.sensitivity !== "normal") values.push(resolved(item.value, variables))
  }
  if (request.auth.kind === "bearer") values.push(resolved(request.auth.token, variables))
  if (request.auth.kind === "basic") values.push(resolved(request.auth.password, variables))
  if (request.auth.kind === "api-key") values.push(resolved(request.auth.value, variables))
  if (request.options.proxy) {
    try {
      const proxy = new URL(resolved(request.options.proxy, variables))
      if (proxy.username) values.push(decodeURIComponent(proxy.username))
      if (proxy.password) values.push(decodeURIComponent(proxy.password))
    } catch {
      // Invalid proxy values are reported by request preparation without exposing them.
    }
  }
  return [...new Set(values.filter(Boolean))].sort((left, right) => right.length - left.length)
}

export function redactKnownHttpSecrets(value: string, secretValues: readonly string[]) {
  let result = value
  for (const secret of secretValues) result = result.replaceAll(secret, "<redacted>")
  return result
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
          httpHeaderSensitivity(name) === "normal"
            ? redactKnownHttpSecrets(entry, secretValues)
            : "<redacted>",
        )
      }
    }
    url.pathname = redactKnownHttpSecrets(decodedUrlComponent(url.pathname), secretValues)
    url.hash = redactKnownHttpSecrets(decodedUrlComponent(url.hash), secretValues)
    return url.toString()
  } catch {
    let redacted = redactKnownHttpSecrets(value, secretValues)
    for (const secret of secretValues) {
      redacted = redacted.replaceAll(encodeURIComponent(secret), "%3Credacted%3E")
    }
    return redacted
  }
}
