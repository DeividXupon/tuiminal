import type { HttpKeyValue, HttpVariableContext } from "./types"
import { resolveHttpTemplate } from "./variables"
import { httpUrlWithProtocol } from "./url-input"

const URL_PATH_PATTERN = /^([a-z][a-z\d+.-]*:[\\/]+[^\\/?#]*)([^?#]*)/i
const PATH_PARAMETER_PATTERN = /(^|\/):([^/{}]+)(?=\/|$)|(?<!\{)\{([^{}]+)\}(?!\})/g

function replacePathTokens(
  pathname: string,
  parameters: ReadonlyMap<string, string>,
  variables?: HttpVariableContext,
) {
  return pathname.replace(
    PATH_PARAMETER_PATTERN,
    (token, separator: string | undefined, colonName: string | undefined, braceName: string) => {
      const name = colonName ?? braceName
      const value = parameters.get(name)
      if (value === undefined) return token
      return `${separator ?? ""}${encodeURIComponent(resolveHttpTemplate(value, variables))}`
    },
  )
}

export function resolveHttpPathParameters(
  source: string,
  entries: readonly HttpKeyValue[],
  variables?: HttpVariableContext,
) {
  const parameters = new Map<string, string>()
  for (const entry of entries) {
    if (entry.enabled && entry.name.trim() && !parameters.has(entry.name)) {
      parameters.set(entry.name, entry.value)
    }
  }
  const resolved = resolveHttpTemplate(source, variables).trim()
  if (!resolved) return resolved
  // Resolve raw path tokens before URL encodes braces, preserving every other URL component.
  // HTTP URL parsing treats backslashes as path separators and consumes all leading slashes.
  return httpUrlWithProtocol(resolved).replace(
    URL_PATH_PATTERN,
    (_match, authority: string, pathname: string) =>
      `${authority}${replacePathTokens(pathname.replaceAll("\\", "/"), parameters, variables)}`,
  )
}
