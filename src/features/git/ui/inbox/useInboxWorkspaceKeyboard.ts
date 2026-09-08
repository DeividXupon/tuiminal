import { useKeyboard } from "@opentui/react"

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
  r: "refresh",
  o: "open",
  m: "read",
  b: "save",
  d: "done",
  u: "unsubscribe",
}

function inboxKeyAction(key: { name: string; sequence?: string; shift?: boolean }) {
  const direct = DIRECT_ACTIONS[key.name]
  if (direct) return direct
  if ([key.name, key.sequence].includes("<") || (key.name === "," && key.shift)) {
    return "previous-section"
  }
  if ([key.name, key.sequence].includes(">") || (key.name === "." && key.shift)) {
    return "next-section"
  }
  return null
}

export function useInboxWorkspaceKeyboard({
  active,
  blocked,
  itemCount,
  onMove,
  onFocus,
  onSection,
  onRefresh,
  onOpen,
  onRead,
  onSave,
  onDone,
  onUnsubscribe,
}: {
  active: boolean
  blocked: boolean
  itemCount: number
  onMove: (delta: -1 | 1) => void
  onFocus: (focus: "list" | "preview") => void
  onSection: (delta: -1 | 1) => void
  onRefresh: () => void
  onOpen: () => void
  onRead: () => void
  onSave: () => void
  onDone: () => void
  onUnsubscribe: () => void
}) {
  useKeyboard((key) => {
    if (!active || blocked) return
    const callbacks: Readonly<Record<InboxKeyAction, () => void>> = {
      next: () => itemCount && onMove(1),
      previous: () => onMove(-1),
      list: () => onFocus("list"),
      preview: () => onFocus("preview"),
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
    callbacks[action]()
  })
}
