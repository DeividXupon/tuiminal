import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"
import type { IssuePreviewTab } from "../issue/types"

type ConversationAction =
  | { type: "tab" }
  | { type: "move"; delta: -1 | 1 }
  | { type: "reaction" | "reply" | "expand" }

export function inboxConversationKeyAction(
  key: {
    name: string
    ctrl?: boolean
    shift?: boolean
    option?: boolean
    meta?: boolean
  },
  tab: IssuePreviewTab,
): ConversationAction | null {
  if (key.ctrl || key.option || key.meta) return null
  if (directionalShortcutDirection(key, "nested")) return { type: "tab" }
  if (key.shift) return null
  if (key.name === "e") return { type: tab === "activity" ? "reaction" : "expand" }
  if (tab !== "activity") return null
  if (key.name === "enter" || key.name === "return") return { type: "reply" }
  if (key.name === "j" || key.name === "down") return { type: "move", delta: 1 }
  if (key.name === "k" || key.name === "up") return { type: "move", delta: -1 }
  return null
}
