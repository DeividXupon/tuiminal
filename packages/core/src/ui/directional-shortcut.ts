export type DirectionalShortcutKey = {
  name: string
  ctrl?: boolean | undefined
  shift?: boolean | undefined
  option?: boolean | undefined
  meta?: boolean | undefined
}

export type DirectionalShortcutLevel = "primary" | "nested"

const DIRECTIONAL_SHORTCUT_KEYS = {
  primary: { previous: "a", next: "f" },
  nested: { previous: "z", next: "v" },
} as const

export function directionalShortcutDirection(
  key: DirectionalShortcutKey,
  level: DirectionalShortcutLevel = "primary",
): -1 | 1 | null {
  if (key.ctrl || key.shift || key.option || key.meta) return null
  const name = key.name.toLowerCase()
  if (name === DIRECTIONAL_SHORTCUT_KEYS[level].previous) return -1
  if (name === DIRECTIONAL_SHORTCUT_KEYS[level].next) return 1
  return null
}

export function directionalShortcutLabel(
  direction: -1 | 1,
  level: DirectionalShortcutLevel = "primary",
) {
  if (level === "nested") return direction === -1 ? "[Z←]" : "[V→]"
  return direction === -1 ? "[A←]" : "[F→]"
}
