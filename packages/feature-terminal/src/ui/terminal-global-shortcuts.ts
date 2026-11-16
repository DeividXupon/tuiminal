import {
  shortcutLabel,
  shortcutMatches,
  type ShortcutKey,
} from "@xupon/tuiminal-core/keyboard/bindings"

const GLOBAL_ACTIONS: Record<string, string> = {
  "alt+1": "database",
  "alt+2": "git",
  "alt+3": "runner",
  "alt+4": "http",
  "alt+5": "terminal",
  ",": "settings",
  q: "quit",
}

/** Master Key releases terminal input before these application actions are considered. */
export function terminalGlobalActionKey(key: ShortcutKey) {
  return (
    Object.entries(GLOBAL_ACTIONS).find(([, action]) =>
      shortcutMatches("global", "workspace", action, key),
    )?.[0] ?? null
  )
}

export function isTerminalGlobalAction(key: string) {
  return Object.hasOwn(GLOBAL_ACTIONS, key)
}

export function terminalGlobalActionLabel(key: string, label: string) {
  const action = GLOBAL_ACTIONS[key]
  return action ? label.replace(/^\[[^\]]+\]/, shortcutLabel("global", "workspace", action)) : label
}
