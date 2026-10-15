import { altNumberShortcut } from "@xupon/tuiminal-core/keyboard/scope"
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
  if (!key.shift && [key.name, key.sequence, key.raw].includes(",")) return "settings"
  if (isolated) return null
  const number = altNumberShortcut(key)
  return TOOL_SHORTCUTS.find((candidate) => candidate.key === number)?.tab ?? null
}
