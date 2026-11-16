import { shortcutLabel, shortcutMatches } from "@xupon/tuiminal-core/keyboard/bindings"
import { TOOL_SHORTCUTS, type ToolId } from "./tool-catalog"

type GlobalShortcutKey = {
  name: string
  sequence?: string
  raw?: string
  ctrl?: boolean
  meta?: boolean
  option?: boolean
  shift?: boolean
  super?: boolean
}

export function globalApplicationShortcut(
  key: GlobalShortcutKey,
  available: boolean,
  isolated: boolean,
): ToolId | "settings" | null {
  if (!available) return null
  if (shortcutMatches("global", "workspace", "settings", key)) return "settings"
  if (isolated) return null
  return (
    TOOL_SHORTCUTS.find((candidate) => shortcutMatches("global", "workspace", candidate.tab, key))
      ?.tab ?? null
  )
}

export function globalShortcutCaption(
  action: "settings" | "quit",
  label: string,
  compact: boolean,
) {
  const shortcut = shortcutLabel("global", "workspace", action)
  return compact && shortcut ? shortcut : [shortcut, label].filter(Boolean).join(" ")
}
