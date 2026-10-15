import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

export function httpWorkspaceDirectory(environment: NodeJS.ProcessEnv = process.env) {
  const override = environment.TUIMINAL_HTTP_HOME?.trim()
  if (override && isAbsolute(override)) return resolve(override)
  const dataHome = environment.XDG_DATA_HOME?.trim()
  const base = dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), ".local", "share")
  return join(base, "tuiminal", "http")
}

// The interactive client has one collection and environment catalog across all projects.
// Headless file commands still receive their explicit file/project root separately.
export const HTTP_WORKING_DIRECTORY = httpWorkspaceDirectory()

export async function ensureHttpWorkspaceDirectory(root = HTTP_WORKING_DIRECTORY) {
  await mkdir(root, { recursive: true, mode: 0o700 })
}
