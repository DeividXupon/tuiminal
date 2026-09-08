import { useKeyboard } from "@opentui/react"
import {
  issueWorkspaceAction,
  type IssueFocus,
  type IssueWorkspaceAction,
} from "../../model/issue/navigation"

export function useIssueWorkspaceKeyboard({
  active,
  blocked,
  focus,
  hasSelection,
  canLoadMore,
  canLoadPreview,
  onWorkspaceAction,
}: {
  active: boolean
  blocked: boolean
  focus: IssueFocus
  hasSelection: boolean
  canLoadMore: boolean
  canLoadPreview: boolean
  onWorkspaceAction: (action: IssueWorkspaceAction) => void
}) {
  useKeyboard((key) => {
    if (!active || blocked) return
    const action = issueWorkspaceAction({
      key: {
        name: key.name,
        sequence: key.sequence,
        shift: key.shift,
        ctrl: key.ctrl,
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
