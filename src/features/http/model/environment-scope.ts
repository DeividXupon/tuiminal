export type HttpEnvironment = {
  name: string
  values: Record<string, string>
  privateNames: Set<string>
  production: boolean
  directory: string
}

export type HttpEnvironmentCatalog = {
  scopes: Array<{ directory: string; environments: HttpEnvironment[] }>
}

function normalizedRequestPath(path: string) {
  return path.replaceAll("\\", "/")
}

export function httpEnvironmentScopeDirectory(requestPath?: string | null) {
  if (
    !requestPath ||
    requestPath.startsWith("/") ||
    requestPath.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/u.test(requestPath)
  ) {
    return ""
  }
  const parts = normalizedRequestPath(requestPath).split("/").filter(Boolean)
  if (parts.some((part) => part === "." || part === "..")) return ""
  parts.pop()
  return parts.join("/")
}

export function environmentDirectoryLineage(requestPath?: string | null) {
  const parts = httpEnvironmentScopeDirectory(requestPath).split("/").filter(Boolean)
  const directories: string[] = []
  for (let length = parts.length; length > 0; length -= 1) {
    directories.push(parts.slice(0, length).join("/"))
  }
  directories.push("")
  return directories
}

export function httpEnvironmentsForRequest(
  catalog: HttpEnvironmentCatalog,
  requestPath?: string | null,
) {
  const byDirectory = new Map(catalog.scopes.map((scope) => [scope.directory, scope.environments]))
  const environments: HttpEnvironment[] = []
  const names = new Set<string>()
  for (const directory of environmentDirectoryLineage(requestPath)) {
    for (const environment of byDirectory.get(directory) ?? []) {
      if (names.has(environment.name)) continue
      names.add(environment.name)
      environments.push(environment)
    }
  }
  return environments.sort((left, right) => left.name.localeCompare(right.name))
}

export function httpBuiltInVariables(now = new Date(), uuid = crypto.randomUUID()) {
  return {
    $timestamp: String(Math.floor(now.getTime() / 1_000)),
    $isoTimestamp: now.toISOString(),
    "$random.uuid": uuid,
  }
}

export function environmentVariableContext(
  environment: HttpEnvironment | undefined,
  fileValues: Readonly<Record<string, string>> = {},
  requestValues: Readonly<Record<string, string>> = {},
) {
  const privateValues: Record<string, string> = {}
  const publicValues: Record<string, string> = {}
  for (const [name, value] of Object.entries(environment?.values ?? {})) {
    if (environment?.privateNames.has(name)) privateValues[name] = value
    else publicValues[name] = value
  }
  return createHttpVariableContext([
    { origin: "request", values: requestValues },
    { origin: "file", values: fileValues },
    { origin: "private", values: privateValues, secret: true },
    { origin: "public", values: publicValues },
    { origin: "built-in", values: httpBuiltInVariables() },
  ])
}
import { createHttpVariableContext } from "./variables"
