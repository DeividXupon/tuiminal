import { accessSync, constants } from "node:fs"
import { definedProperties } from "@xupon/tuiminal-core/data/defined-properties"
import type { DatabaseConnectionProfile, DatabaseDriver } from "../model/types"

function driverDefaultPort(driver: DatabaseDriver) {
  if (driver === "mysql" || driver === "mcp-mysql") return 3306
  if (driver === "postgres") return 5432
  return undefined
}

export function canExecute(command: string) {
  try {
    accessSync(command, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function discoveredMcpProfile(): DatabaseConnectionProfile | null {
  const command = process.env.TUIMINAL_MYSQL_MCP_COMMAND?.trim()
  // MCP discovery is an explicit integration; a private executable must not
  // silently become the product's default database connection.
  if (!command || !canExecute(command)) return null
  return {
    id: "discovered-mysql-mcp",
    name: "Banco via MCP",
    driver: "mcp-mysql",
    source: "mcp",
    command,
    ssl: false,
    writeEnabled: false,
  }
}

export function discoveredEnvironmentProfile(
  sessionPasswords: Map<string, string>,
): DatabaseConnectionProfile | null {
  sessionPasswords.delete("environment-database-url")
  const connectionUrl =
    process.env.DATABASE_URL?.trim() ||
    process.env.MYSQL_URL?.trim() ||
    process.env.POSTGRES_URL?.trim()
  if (!connectionUrl) return null

  try {
    const url = new URL(connectionUrl)
    const driver: DatabaseDriver = url.protocol.startsWith("mysql")
      ? "mysql"
      : url.protocol.startsWith("postgres")
        ? "postgres"
        : url.protocol.startsWith("sqlite") || url.protocol.startsWith("file")
          ? "sqlite"
          : "postgres"
    const profile = definedProperties({
      id: "environment-database-url",
      name: "DATABASE_URL",
      driver,
      source: "environment" as const,
      host: url.hostname || undefined,
      port: url.port ? Number(url.port) : driverDefaultPort(driver),
      database:
        driver === "sqlite" ? undefined : decodeURIComponent(url.pathname.replace(/^\//, "")),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      filename: driver === "sqlite" ? decodeURIComponent(url.pathname) : undefined,
      ssl: url.searchParams.has("ssl") || url.searchParams.has("sslmode"),
      writeEnabled: false,
    })
    sessionPasswords.set("environment-database-url", decodeURIComponent(url.password))
    return profile
  } catch {
    return null
  }
}
