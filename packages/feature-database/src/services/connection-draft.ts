import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { definedProperties } from "@xupon/tuiminal-core/data/defined-properties"
import type {
  DatabaseConnectionDraft,
  DatabaseConnectionProfile,
  DatabaseDriver,
} from "../model/types"
import {
  CONNECTION_TEXT_FIELDS,
  hasEnvironmentReference,
  resolveConnectionDraft,
} from "../model/connection-environment"
import { canExecute } from "./database-environment-connections"
import { preserveConnectionReferences } from "./connection-environment"

export function defaultPort(driver: DatabaseDriver) {
  if (driver === "mysql" || driver === "mcp-mysql") return 3306
  if (driver === "postgres") return 5432
  return undefined
}

function normalizedNetworkDraft(draft: DatabaseConnectionDraft, name: string) {
  const socket = draft.socket?.trim()
  const host = draft.host?.trim()
  const database = draft.database?.trim()
  const username = draft.username?.trim()
  const port = draft.port ?? defaultPort(draft.driver) ?? 0
  if (!host && !(draft.driver === "mysql" && socket)) throw new Error("Informe o host do banco.")
  if (!database) throw new Error("Informe o nome do banco.")
  if (!username) throw new Error("Informe o usuário.")
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Informe uma porta válida.")
  return {
    ...draft,
    name,
    host,
    socket: draft.driver === "mysql" ? socket : undefined,
    port,
    database,
    username,
    filename: undefined,
    command: undefined,
    tlsMode: draft.ssl ? draft.tlsMode : "disable",
  }
}

export function normalizedDraft(draft: DatabaseConnectionDraft): DatabaseConnectionDraft {
  draft = resolveConnectionDraft(draft, process.env)
  const name = draft.name.trim()
  if (!name) throw new Error("Informe um nome para a conexão.")

  if (draft.driver === "sqlite") {
    const rawFilename = draft.filename?.trim()
    if (!rawFilename) throw new Error("Informe o caminho do arquivo SQLite.")
    const expanded = rawFilename.startsWith("~/")
      ? join(homedir(), rawFilename.slice(2))
      : rawFilename
    return {
      ...draft,
      name,
      filename: isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded),
      host: undefined,
      port: undefined,
      database: undefined,
      username: undefined,
      command: undefined,
      ssl: false,
    }
  }

  if (draft.driver === "mcp-mysql") {
    const command = draft.command?.trim()
    if (!command) throw new Error("Informe o executável do servidor MCP.")
    const expanded = command.startsWith("~/") ? join(homedir(), command.slice(2)) : command
    if (!canExecute(expanded)) {
      throw new Error(`O MCP não foi encontrado ou não é executável: ${expanded}`)
    }
    return {
      ...draft,
      name,
      command: expanded,
      host: undefined,
      port: undefined,
      database: undefined,
      username: undefined,
      filename: undefined,
      ssl: false,
      writeEnabled: false,
    }
  }

  return normalizedNetworkDraft(draft, name)
}

export function profileFromDraft(
  draft: DatabaseConnectionDraft,
  id = `database-${randomUUID()}`,
): DatabaseConnectionProfile {
  return definedProperties({
    ...preserveConnectionReferences(draft, normalizedDraft(draft)),
    id,
    source: "saved" as const,
  })
}

export function resolvedConnectionProfile(
  profile: DatabaseConnectionProfile,
): DatabaseConnectionProfile {
  if (profile.source !== "saved") return profile
  if (
    !profile.portExpression &&
    !CONNECTION_TEXT_FIELDS.some((field) => hasEnvironmentReference(profile[field] ?? ""))
  )
    return profile
  return definedProperties({ ...profile, ...normalizedDraft(profile), portExpression: undefined })
}
