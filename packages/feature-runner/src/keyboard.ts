import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"

export const runnerKeyboardScope = {
  ids: [
    "runner-command-input",
    "runner-project-search",
    "runner-log-filter",
    "runner-process-input",
    "runner-project-list",
    "runner-directory-list",
  ],
  prefixes: ["runner-config-", "runner-save-command-", "runner-autostart-trust-"],
} as const satisfies KeyboardScope
