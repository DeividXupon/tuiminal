import { constants } from "node:fs"
import { access, opendir, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import type { AgentProjectTarget, ProjectDirectory } from "../model/agent-project"
export type { AgentProjectTarget, ProjectDirectory } from "../model/agent-project"
import { readRemoteProjectDirectory } from "./agent-project-ssh"

export const PROJECT_DIRECTORY_LIMIT = 2_000
export const PROJECT_DIRECTORY_ERROR = "Não foi possível acessar a pasta selecionada."

export function validProjectPath(path: string, remote = false) {
  return (
    path.length > 0 &&
    path.length <= 4_096 &&
    !/[\p{Cc}\p{Cf}]/u.test(path) &&
    (remote ? path.startsWith("/") : isAbsolute(path))
  )
}

export function projectHomeDirectory(environment: NodeJS.ProcessEnv = process.env) {
  const configured = process.platform === "win32" ? environment.USERPROFILE : environment.HOME
  return configured && isAbsolute(configured) ? configured : homedir()
}

export function resolveProjectInput(path: string, base: string, home = projectHomeDirectory()) {
  const expanded =
    path === "~"
      ? home
      : path.startsWith("~/") || path.startsWith("~\\")
        ? join(home, path.slice(2))
        : path
  return resolve(base === "~" || base === "~/" ? home : base, expanded)
}

/** Reads one level only. Resolving a link never recursively walks its target. */
export async function readProjectDirectory(
  target: AgentProjectTarget,
  path: string,
  base: string,
  signal: AbortSignal,
  list = true,
): Promise<ProjectDirectory> {
  signal.throwIfAborted()
  if (target.kind === "remote")
    return readRemoteProjectDirectory(target.profile, path, base, signal, list)
  try {
    const canonical = await realpath(resolveProjectInput(path, base))
    if (!validProjectPath(canonical) || !(await stat(canonical)).isDirectory())
      throw new Error(PROJECT_DIRECTORY_ERROR)
    await access(canonical, constants.R_OK | constants.X_OK)
    const directory = await opendir(canonical)
    const directories: string[] = []
    let truncated = false
    try {
      if (list)
        for await (const entry of directory) {
          signal.throwIfAborted()
          const child = join(canonical, entry.name)
          if (!validProjectPath(child)) continue
          const isDirectory =
            entry.isDirectory() ||
            (entry.isSymbolicLink() &&
              (await stat(child).then(
                (value) => value.isDirectory(),
                () => false,
              )))
          if (!isDirectory) continue
          if (directories.length >= PROJECT_DIRECTORY_LIMIT) {
            truncated = true
            break
          }
          directories.push(child)
        }
    } finally {
      await directory.close().catch(() => undefined)
    }
    signal.throwIfAborted()
    return { path: canonical, directories: directories.sort(), truncated }
  } catch {
    signal.throwIfAborted()
    throw new Error(PROJECT_DIRECTORY_ERROR)
  }
}
