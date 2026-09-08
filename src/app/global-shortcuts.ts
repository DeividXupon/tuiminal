import { TOOL_SHORTCUTS, type ToolId } from "./tool-catalog"

type GlobalShortcutKey = {
  name: string
  sequence?: string
  raw?: string
  shift?: boolean
}

export function globalApplicationShortcut(
  key: GlobalShortcutKey,
  available: boolean,
  isolated: boolean,
): ToolId | "settings" | null {
  if (!available) return null
  if (!key.shift && [key.name, key.sequence, key.raw].includes(",")) return "settings"
  if (isolated) return null
  return (
    TOOL_SHORTCUTS.find(
      (candidate) =>
        [key.name, key.sequence, key.raw].includes(candidate.symbol) ||
        (key.shift && key.name === candidate.key),
    )?.tab ?? null
  )
}
