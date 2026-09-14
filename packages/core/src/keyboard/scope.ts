export type KeyboardScope = {
  ids?: readonly string[]
  prefixes?: readonly string[]
  localCtrlC?: boolean
  interruptPrefixes?: readonly string[]
  deferEscape?: boolean
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
