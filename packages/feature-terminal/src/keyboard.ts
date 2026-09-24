import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"

export const terminalKeyboardScope = {
  ids: ["terminal-workspace", "terminal-command-input"],
  prefixes: [
    "free-terminal-",
    "terminal-sidebar",
    "terminal-action",
    "terminal-dialog",
    "terminal-split-",
  ],
  interruptPrefixes: ["free-terminal-", "terminal-action"],
  deferEscape: true,
} as const satisfies KeyboardScope
