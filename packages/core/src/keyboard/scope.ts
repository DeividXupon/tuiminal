export type KeyboardScope = {
  ids?: readonly string[]
  prefixes?: readonly string[]
  localCtrlC?: boolean
  interruptPrefixes?: readonly string[]
  deferEscape?: boolean
}

// macOS terminals may send Option+number as text, even when the host runs another OS.
const OPTION_NUMBER_SYMBOLS = ["º", "¡", "™", "£", "¢", "∞", "§", "¶", "•", "ª"]

/** Call only after the owning keyboard scope has allowed shortcut handling. */
export function altNumberShortcut(key: {
  name: string
  sequence?: string
  raw?: string
  ctrl?: boolean
  meta?: boolean
  option?: boolean
  shift?: boolean
  super?: boolean
}): string | null {
  if (key.ctrl || key.shift || key.super) return null
  const values = [key.name, key.sequence, key.raw]
  const number = values.find((value) => value !== undefined && /^[0-9]$/.test(value))
  if ((key.meta || key.option) && number) return number
  const index = OPTION_NUMBER_SYMBOLS.findIndex((symbol) => values.includes(symbol))
  return index < 0 ? null : String(index)
}

export function focusedRenderableId(
  renderable: { id?: string; focused?: boolean } | null | undefined,
) {
  return renderable?.focused ? renderable.id : undefined
}

export function ownsInterrupt(scope: KeyboardScope, focusedId: string | undefined) {
  return Boolean(
    scope.localCtrlC ||
      (focusedId && scope.interruptPrefixes?.some((prefix) => focusedId.startsWith(prefix))),
  )
}

/** Focused inputs/pickers own shortcuts before the global application layer. */
export function ownsKeyboardFocus(scope: KeyboardScope, focusedId: string | undefined) {
  if (!focusedId) return false
  return Boolean(
    scope.ids?.includes(focusedId) ||
      scope.prefixes?.some((prefix) => focusedId.startsWith(prefix)),
  )
}
