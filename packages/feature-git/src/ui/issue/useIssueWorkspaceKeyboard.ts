import { useKeyboard } from "@opentui/react"
import {
  issueWorkspaceAction,
  type IssueFocus,
  type IssueWorkspaceAction,
} from "../../model/issue/navigation"
import type { IssuePreviewTab } from "../../model/issue/types"

export function issueCommentKeyboardAction({
  keyName,
  focus,
  previewTab,
  commentCount,
}: {
  keyName: string
  focus: IssueFocus
  previewTab: IssuePreviewTab
  commentCount: number
}) {
  if (focus !== "preview" || previewTab !== "activity" || commentCount === 0) return null
  if (keyName === "j" || keyName === "down") return { type: "move" as const, delta: 1 as const }
  if (keyName === "k" || keyName === "up") return { type: "move" as const, delta: -1 as const }
  if (keyName === "e") return { type: "react" as const }
  if (keyName === "enter" || keyName === "return") return { type: "reply" as const }
  return null
}

export function useIssueWorkspaceKeyboard({
  active,
  blocked,
  focus,
  hasSelection,
  canLoadMore,
  canLoadPreview,
  previewTab,
  commentCount,
  onWorkspaceAction,
  onCommentMove,
  onCommentReact,
  onCommentReply,
}: {
  active: boolean
  blocked: boolean
  focus: IssueFocus
  hasSelection: boolean
  canLoadMore: boolean
  canLoadPreview: boolean
  previewTab: IssuePreviewTab
  commentCount: number
  onWorkspaceAction: (action: IssueWorkspaceAction) => void
  onCommentMove: (delta: -1 | 1) => void
  onCommentReact: () => void
  onCommentReply: () => void
}) {
  useKeyboard((key) => {
    if (!active || blocked) return
    const commentAction = issueCommentKeyboardAction({
      keyName: key.name,
      focus,
      previewTab,
      commentCount,
    })
    if (commentAction) {
      key.preventDefault()
      if (commentAction.type === "move") onCommentMove(commentAction.delta)
      else if (commentAction.type === "react") onCommentReact()
      else onCommentReply()
      return
    }
    const action = issueWorkspaceAction({
      key: {
        name: key.name,
        shift: key.shift,
        ctrl: key.ctrl,
        option: key.option,
        meta: key.meta,
      },
      focus,
      hasSelection,
      canLoadMore,
      canLoadPreview,
    })
    if (!action) return
    key.preventDefault()
    if (key.name === "escape") key.stopPropagation()
    onWorkspaceAction(action)
  })
}
