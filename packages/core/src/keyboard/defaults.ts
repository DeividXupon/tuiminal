import { DATABASE_SHORTCUT_KEYS } from "./database-defaults"
import { GIT_SHORTCUT_KEYS } from "./git-defaults"
import { HTTP_SHORTCUT_KEYS } from "./http-defaults"
import { RUNNER_SHORTCUT_KEYS } from "./runner-defaults"
import { TERMINAL_SHORTCUT_KEYS } from "./terminal-defaults"

// Defaults are key identities grouped by their owning workspace, pane, or modal.
export const TOOL_SHORTCUT_KEYS: Record<string, Record<string, readonly string[]>> = {
  database: DATABASE_SHORTCUT_KEYS,
  git: GIT_SHORTCUT_KEYS,
  http: HTTP_SHORTCUT_KEYS,
  runner: RUNNER_SHORTCUT_KEYS,
  terminal: TERMINAL_SHORTCUT_KEYS,
}
