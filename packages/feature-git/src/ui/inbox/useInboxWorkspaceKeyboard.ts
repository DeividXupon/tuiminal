import { useKeyboard } from "@opentui/react"
import { isActionPaletteKey } from "@xupon/tuiminal-core/ui/action-palette"
import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"

type InboxKeyAction =
  | "next"
  | "previous"
  | "list"
  | "preview"
  | "previous-section"
  | "next-section"
  | "refresh"
  | "open"
  | "read"
  | "save"
  | "done"
  | "unsubscribe"

const DIRECT_ACTIONS: Readonly<Record<string, InboxKeyAction>> = {
  j: "next",
  down: "next",
  k: "previous",
  up: "previous",
  h: "list",
  left: "list",
  l: "preview",
  right: "preview",
  enter: "preview",
  return: "preview",
  escape: "list",
  r: "refresh",
  o: "open",
  b: "save",
  d: "done",
  u: "unsubscribe",
}

export function inboxKeyAction(key: {
  name: string
  ctrl?: boolean
  shift?: boolean
  option?: boolean
  meta?: boolean
}) {
  // Plain [M] chooses a box; marking read uses [Shift+M].
  if (key.name === "m") return key.shift ? "read" : null
  const direct = DIRECT_ACTIONS[key.name]
  if (direct) return direct
  const direction = directionalShortcutDirection(key)
  if (direction === -1) return "previous-section"
  if (direction === 1) return "next-section"
  return null
}

function previewPageDelta(focus: "list" | "preview", key: Parameters<typeof inboxKeyAction>[0]) {
  if (focus !== "preview" || !key.ctrl) return 0
  if (key.name === "d") return 10
  if (key.name === "u") return -10
  return 0
}

export function useInboxWorkspaceKeyboard({
  active,
  blocked,
  focus,
  itemCount,
  onMove,
  onScroll,
  onPreviewKey,
  onFocus,
  onSection,
  onRefresh,
  onOpen,
  onRead,
  onSave,
  onDone,
  onUnsubscribe,
  onOpenPalette,
}: {
  active: boolean
  blocked: boolean
  focus: "list" | "preview"
  itemCount: number
  onMove: (delta: -1 | 1) => void
  onScroll: (delta: number) => void
  onPreviewKey: (key: Parameters<typeof inboxKeyAction>[0]) => boolean
  onFocus: (focus: "list" | "preview") => void
  onSection: (delta: -1 | 1) => void
  onRefresh: () => void
  onOpen: () => void
  onRead: () => void
  onSave: () => void
  onDone: () => void
  onUnsubscribe: () => void
  onOpenPalette: () => void
}) {
  const move = (delta: -1 | 1) => {
    if (focus === "preview") onScroll(delta)
    else if (itemCount) onMove(delta)
  }
  useKeyboard((key) => {
    if (!active || blocked) return
    if (isActionPaletteKey(key)) {
      key.preventDefault()
      onOpenPalette()
      return
    }
    if (focus === "preview" && onPreviewKey(key)) {
      key.preventDefault()
      return
    }
    const pageDelta = previewPageDelta(focus, key)
    if (pageDelta) {
      key.preventDefault()
      onScroll(pageDelta)
      return
    }
    if (key.name === "escape" && focus !== "preview") return
    const callbacks: Readonly<Record<InboxKeyAction, () => void>> = {
      next: () => move(1),
      previous: () => move(-1),
      list: () => onFocus("list"),
      preview: () => itemCount && onFocus("preview"),
      "previous-section": () => onSection(-1),
      "next-section": () => onSection(1),
      refresh: onRefresh,
      open: onOpen,
      read: onRead,
      save: onSave,
      done: onDone,
      unsubscribe: onUnsubscribe,
    }
    const action = inboxKeyAction(key)
    if (!action) return
    key.preventDefault()
    if (key.name === "escape") key.stopPropagation()
    callbacks[action]()
  })
}
