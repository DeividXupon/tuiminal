import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"

export const terminalKeyboardScope = {
  ids: ["terminal-command-input"],
  prefixes: ["free-terminal-"],
  interruptPrefixes: ["free-terminal-"],
} as const satisfies KeyboardScope
