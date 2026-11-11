import type { DatabaseConnectionDraft } from "./types"

export const CONNECTION_TEXT_FIELDS = [
  "name",
  "host",
  "database",
  "username",
  "socket",
  "filename",
  "command",
] as const

export function hasEnvironmentReference(value: string) {
  return /\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value)
}

export function expandConnectionEnvironment(
  value: string,
  environment: Readonly<Record<string, string | undefined>>,
) {
  return value.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    const resolved = environment[name]
    if (!Object.hasOwn(environment, name) || resolved === undefined) {
      throw new Error(`Variável de ambiente não definida: ${name}`)
    }
    return resolved
  })
}

export function resolveConnectionDraft(
  draft: DatabaseConnectionDraft,
  environment: Readonly<Record<string, string | undefined>>,
): DatabaseConnectionDraft {
  const resolved = { ...draft }
  const fields =
    draft.driver === "sqlite"
      ? (["name", "filename"] as const)
      : draft.driver === "mcp-mysql"
        ? (["name", "command"] as const)
        : (["name", "host", "database", "username", "socket"] as const)
  for (const field of fields) {
    const value = draft[field]
    if (value !== undefined) resolved[field] = expandConnectionEnvironment(value, environment)
  }
  if (
    draft.portExpression !== undefined &&
    (draft.driver === "mysql" || draft.driver === "postgres")
  ) {
    const port = expandConnectionEnvironment(draft.portExpression, environment)
    if (!/^\d+$/.test(port.trim())) throw new Error("Informe uma porta válida.")
    resolved.port = Number(port)
  }
  delete resolved.portExpression
  return resolved
}

export function connectionEnvironmentCompletion(value: string, cursor: number, names: string[]) {
  const prefix = value.slice(0, cursor).match(/\{([A-Za-z_][A-Za-z0-9_]*|)$/)
  if (!prefix || prefix.index === undefined) return null
  const suggestions = names.filter((name) => name.startsWith(prefix[1] ?? "")).sort()
  if (!suggestions.length) return null
  const suffix = value.slice(cursor).match(/^[A-Za-z0-9_]*\}/)?.[0] ?? ""
  return { start: prefix.index, end: cursor + suffix.length, suggestions }
}
