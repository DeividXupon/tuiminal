import { createHash } from "node:crypto"
import type {
  DatabaseExternalSource,
  DatabaseTlsMode,
  ExternalDatabaseConnectionCandidate,
} from "./types"

export const EXTERNAL_DATABASE_FILE_LIMIT = 256 * 1024
export const EXTERNAL_DATABASE_ENTRY_LIMIT = 100

export type ParsedOptionGroup = { name: string; values: Record<string, string> }
export type ParsedPgpassEntry = {
  host: string
  port: string
  database: string
  username: string
  password: string
}

function unquote(value: string) {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1).replaceAll(`\\${quote}`, quote).replaceAll("\\\\", "\\")
  }
  let escaped = false
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index]
    if (!escaped && (character === "#" || character === ";")) return trimmed.slice(0, index).trim()
    escaped = !escaped && character === "\\"
    if (character !== "\\") escaped = false
  }
  return trimmed
}

export function parseOptionGroups(source: string): ParsedOptionGroup[] {
  const groups: ParsedOptionGroup[] = []
  let current: ParsedOptionGroup | null = null
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || line.startsWith(";")) continue
    const section = line.match(/^\[(.+)\]$/u)
    if (section) {
      current = { name: section[1]?.trim() ?? "", values: {} }
      if (current.name && groups.length < EXTERNAL_DATABASE_ENTRY_LIMIT) groups.push(current)
      continue
    }
    if (!current) continue
    const separator = line.indexOf("=")
    if (separator < 1) continue
    const name = line.slice(0, separator).trim().toLowerCase().replaceAll("_", "-")
    current.values[name] = unquote(line.slice(separator + 1))
  }
  return groups
}

export function parseMyCnf(source: string) {
  const groups = parseOptionGroups(source)
  const client = groups.find((group) => group.name.toLowerCase() === "client")?.values ?? {}
  const mysql = groups.find((group) => group.name.toLowerCase() === "mysql")?.values ?? {}
  return {
    values: { ...client, ...mysql },
    hasUnsupportedInclude: source
      .split(/\r?\n/u)
      .some((line) => /^\s*!include(?:dir)?\b/iu.test(line)),
  }
}

export function parseMysqlLoginPaths(source: string) {
  return parseOptionGroups(source).map((group) => ({
    ...group,
    hasPassword: Object.hasOwn(group.values, "password"),
  }))
}

function pgpassFields(line: string) {
  const fields: string[] = []
  let value = ""
  let escaped = false
  for (const character of line) {
    if (escaped) {
      value += character
      escaped = false
    } else if (character === "\\") {
      escaped = true
    } else if (character === ":" && fields.length < 4) {
      fields.push(value)
      value = ""
    } else {
      value += character
    }
  }
  if (escaped) value += "\\"
  fields.push(value)
  return fields.length === 5 ? fields : null
}

export function parsePgpass(source: string): ParsedPgpassEntry[] {
  const entries: ParsedPgpassEntry[] = []
  for (const rawLine of source.split(/\r?\n/u)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue
    const fields = pgpassFields(rawLine)
    if (!fields) continue
    const [host, port, database, username, password] = fields
    if (
      host === undefined ||
      port === undefined ||
      database === undefined ||
      !username ||
      password === undefined
    )
      continue
    entries.push({ host, port, database, username, password })
    if (entries.length >= EXTERNAL_DATABASE_ENTRY_LIMIT) break
  }
  return entries
}

function pgpassFieldMatches(rule: string, value: string) {
  return rule === "*" || rule === value
}

export function matchingPgpassPassword(
  entries: readonly ParsedPgpassEntry[],
  target: { host: string; port: number; database: string; username: string },
) {
  return entries.find(
    (entry) =>
      pgpassFieldMatches(entry.host, target.host) &&
      pgpassFieldMatches(entry.port, String(target.port)) &&
      pgpassFieldMatches(entry.database, target.database) &&
      pgpassFieldMatches(entry.username, target.username),
  )?.password
}

export function mysqlTlsMode(value: string | undefined): DatabaseTlsMode {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-")
  if (normalized === "disabled" || normalized === "disable") return "disable"
  if (normalized === "required" || normalized === "require") return "require"
  if (normalized === "verify-ca") return "verify-ca"
  if (normalized === "verify-identity" || normalized === "verify-full") return "verify-full"
  return "prefer"
}

export function postgresTlsMode(value: string | undefined): DatabaseTlsMode {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === "disable" ||
    normalized === "allow" ||
    normalized === "prefer" ||
    normalized === "require" ||
    normalized === "verify-ca" ||
    normalized === "verify-full"
  ) {
    return normalized
  }
  return "prefer"
}

export function externalConnectionId(
  source: DatabaseExternalSource,
  name: string,
  parts: Array<string | number | undefined>,
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([source, name, ...parts]))
    .digest("hex")
    .slice(0, 20)
  return `external-${source}-${fingerprint}`
}

export function concretePgpassCandidate(entry: ParsedPgpassEntry) {
  if ([entry.host, entry.port, entry.database, entry.username].some((value) => value === "*")) {
    return null
  }
  const port = Number(entry.port)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null
  return { host: entry.host, port, database: entry.database, username: entry.username }
}

export function missingConnectionFields(
  profile: {
    host?: string | undefined
    socket?: string | undefined
    database?: string | undefined
    username?: string | undefined
  },
  passwordAvailable: boolean,
) {
  const missing: ExternalDatabaseConnectionCandidate["missing"] = []
  if (!profile.host && !profile.socket) missing.push("host")
  if (!profile.database) missing.push("database")
  if (!profile.username) missing.push("username")
  if (!passwordAvailable) missing.push("password")
  return missing
}
