import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { EXTERNAL_DATABASE_FILE_LIMIT } from "../model/external-connection-config"

export type ExternalDatabaseEnvironment = Readonly<Record<string, string | undefined>>

function pathFromEnvironment(value: string | undefined, fallback: string) {
  const configured = value?.trim()
  if (!configured) return fallback
  return isAbsolute(configured) ? configured : resolve(configured)
}

export function externalDatabasePaths(
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
  environment: ExternalDatabaseEnvironment = process.env,
) {
  const appData = environment.APPDATA?.trim() || join(home, "AppData", "Roaming")
  return {
    mysql: join(home, ".my.cnf"),
    pgService: pathFromEnvironment(
      environment.PGSERVICEFILE,
      platform === "win32"
        ? join(appData, "postgresql", ".pg_service.conf")
        : join(home, ".pg_service.conf"),
    ),
    pgpass: pathFromEnvironment(
      environment.PGPASSFILE,
      platform === "win32" ? join(appData, "postgresql", "pgpass.conf") : join(home, ".pgpass"),
    ),
  }
}

export function readExternalDatabaseFile(
  path: string,
  platform: NodeJS.Platform,
  effectiveUserId: number | undefined,
  warnings: string[],
) {
  if (!existsSync(path)) return null
  try {
    const stat = statSync(path)
    if (!stat.isFile()) {
      warnings.push(`${path}: não é um arquivo regular.`)
      return null
    }
    if (stat.size > EXTERNAL_DATABASE_FILE_LIMIT) {
      warnings.push(`${path}: excede o limite de 256 KiB.`)
      return null
    }
    const owned =
      platform === "win32" || effectiveUserId === undefined || stat.uid === effectiveUserId
    const privateMode = platform === "win32" || (stat.mode & 0o077) === 0
    return { source: readFileSync(path, "utf8"), secretsAllowed: owned && privateMode }
  } catch (error) {
    warnings.push(`${path}: ${error instanceof Error ? error.message : "não pôde ser lido"}.`)
    return null
  }
}
