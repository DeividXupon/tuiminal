import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"

export const RUNNER_WORKING_DIRECTORY = resolve(process.env.TUIMINAL_WORKDIR ?? process.cwd())

export function resolveRunnerSessionScope(directory = RUNNER_WORKING_DIRECTORY) {
  const requestedRoot = resolve(directory)
  let candidate = requestedRoot
  while (true) {
    if (existsSync(resolve(candidate, ".git"))) return candidate
    const parent = dirname(candidate)
    if (parent === candidate) return requestedRoot
    candidate = parent
  }
}
