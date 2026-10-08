import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"

export const terminalKeyboardScope = {
  ids: ["terminal-workspace", "terminal-command-input"],
  prefixes: [
    "term-agents-",
    "terminal-sidebar",
    "terminal-action",
    "terminal-dialog",
    "terminal-split-",
    "terminal-project-sync-",
  ],
  interruptPrefixes: ["term-agents-", "terminal-action"],
  deferEscape: true,
} as const satisfies KeyboardScope
