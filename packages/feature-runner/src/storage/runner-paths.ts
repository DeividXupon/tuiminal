import { realpathSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export function canonicalRunnerRoot(root: string) {
  try {
    return realpathSync(root)
  } catch {
    return resolve(root)
  }
}
const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const RUNNER_SETTINGS_PATH = join(configRoot, "tuiminal", "runner.json")
