import type { KeyboardScope } from "../../core/keyboard/scope"

export const httpKeyboardScope = {
  prefixes: ["http-"],
} as const satisfies KeyboardScope
