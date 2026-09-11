import type { KeyboardScope } from "../../core/keyboard/scope"

export const runnerKeyboardScope = {
  ids: [
    "runner-command-input",
    "runner-project-search",
    "runner-log-filter",
    "runner-process-input",
    "runner-project-list",
    "runner-directory-list",
  ],
  prefixes: ["runner-save-command-", "runner-autostart-trust-"],
} as const satisfies KeyboardScope
