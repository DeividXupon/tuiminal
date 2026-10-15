import type { KeyEvent } from "@opentui/core"
import {
  matchesTerminalMasterKey,
  type TerminalMasterKey,
} from "@xupon/tuiminal-core/settings/theme"

function consumeKey(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function handleMasterKey(key: KeyEvent, masterKey: TerminalMasterKey, onMasterKey?: () => void) {
  if (!onMasterKey || !matchesTerminalMasterKey(key, masterKey)) return false
  consumeKey(key)
  onMasterKey()
  return true
}

function handleEscapeKey(key: KeyEvent, onEscape: (() => void) | undefined, blur: () => void) {
  if (key.name !== "escape") return false
  consumeKey(key)
  if (onEscape) onEscape()
  else blur()
  return true
}

function handleMovementKey(
  key: KeyEvent,
  navigationIds: string[],
  cursorRef: { current: string | null },
  setCursorId: (id: string) => void,
) {
  const direction = ["up", "k"].includes(key.name) ? -1 : ["down", "j"].includes(key.name) ? 1 : 0
  if (!direction || !navigationIds.length) return false
  consumeKey(key)
  const index = navigationIds.indexOf(cursorRef.current ?? "")
  const origin = index >= 0 ? index : direction > 0 ? -1 : 0
  const next = navigationIds[(origin + direction + navigationIds.length) % navigationIds.length]
  if (next) {
    cursorRef.current = next
    setCursorId(next)
  }
  return true
}

function handleActivationKey(
  key: KeyEvent,
  cursorId: string | null,
  onActivate: (id: string) => void,
) {
  if (!cursorId || (key.name !== "enter" && key.name !== "return")) return false
  consumeKey(key)
  onActivate(cursorId)
  return true
}

export function handleSidebarKey(
  key: KeyEvent,
  options: {
    masterKey: TerminalMasterKey
    navigationIds: string[]
    cursorRef: { current: string | null }
    setCursorId: (id: string) => void
    onActivate: (id: string) => void
    onMasterKey: (() => void) | undefined
    onEscape: (() => void) | undefined
    blur: () => void
  },
) {
  if (handleMasterKey(key, options.masterKey, options.onMasterKey)) return
  if (handleEscapeKey(key, options.onEscape, options.blur)) return
  if (handleMovementKey(key, options.navigationIds, options.cursorRef, options.setCursorId)) return
  handleActivationKey(key, options.cursorRef.current, options.onActivate)
}
