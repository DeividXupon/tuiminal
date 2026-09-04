import type { KeyboardScope } from "../../core/keyboard/scope"

export const gitKeyboardScope = {
  prefixes: ["git-"],
  deferEscape: true,
} as const satisfies KeyboardScope
