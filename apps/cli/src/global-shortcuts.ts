import { TOOL_SHORTCUTS, type ToolId } from "./tool-catalog"

type GlobalShortcutKey = {
  name: string
  sequence?: string
  raw?: string
  ctrl?: boolean
  meta?: boolean
  option?: boolean
  shift?: boolean
}

export function globalApplicationShortcut(
  key: GlobalShortcutKey,
  available: boolean,
  isolated: boolean,
): ToolId | "settings" | null {
  if (!available) return null
  if (!key.shift && [key.name, key.sequence, key.raw].includes(",")) return "settings"
  if (isolated || (!key.meta && !key.option) || key.ctrl || key.shift) return null
  return (
    TOOL_SHORTCUTS.find((candidate) => [key.name, key.sequence, key.raw].includes(candidate.key))
      ?.tab ?? null
  )
}
