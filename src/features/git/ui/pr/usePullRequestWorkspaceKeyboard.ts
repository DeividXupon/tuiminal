import { useKeyboard } from "@opentui/react"
import type { PullRequestFocus, PullRequestWorkspaceAction } from "../../model/pr/navigation"
import { pullRequestWorkspaceAction } from "../../model/pr/navigation"
import type { PullRequestDetails, PullRequestPreviewTab } from "../../model/pr/types"

type PreviewCollectionAction =
  | { type: "move"; delta: -1 | 1; count: number }
  | { type: "copy"; value: string }

function previewCollectionAction({
  keyName,
  focus,
  tab,
  details,
  selectedIndex,
}: {
  keyName: string
  focus: PullRequestFocus
  tab: PullRequestPreviewTab
  details: PullRequestDetails | null
  selectedIndex: number
}): PreviewCollectionAction | null {
  if (focus !== "preview" || !details || (tab !== "commits" && tab !== "files")) return null
  if (["j", "down", "k", "up"].includes(keyName)) {
    return {
      type: "move",
      delta: keyName === "j" || keyName === "down" ? 1 : -1,
      count: details[tab].length,
    }
  }
  if (tab === "commits" && keyName === "y") {
    const commit = details.commits[selectedIndex]
    return commit ? { type: "copy", value: commit.sha } : null
  }
  return null
}

export function usePullRequestWorkspaceKeyboard({
  active,
  blocked,
  focus,
  hasSelection,
  canLoadMore,
  canLoadPreview,
  previewTab,
  details,
  previewItemIndex,
  onWorkspaceAction,
  onPreviewMove,
  onCopySha,
}: {
  active: boolean
  blocked: boolean
  focus: PullRequestFocus
  hasSelection: boolean
  canLoadMore: boolean
  canLoadPreview: boolean
  previewTab: PullRequestPreviewTab
  details: PullRequestDetails | null
  previewItemIndex: number
  onWorkspaceAction: (action: PullRequestWorkspaceAction) => void
  onPreviewMove: (delta: -1 | 1, count: number) => void
  onCopySha: (sha: string) => void
}) {
  useKeyboard((key) => {
    if (!active || blocked) return
    const collectionAction = previewCollectionAction({
      keyName: key.name,
      focus,
      tab: previewTab,
      details,
      selectedIndex: previewItemIndex,
    })
    if (collectionAction) {
      key.preventDefault()
      if (collectionAction.type === "copy") onCopySha(collectionAction.value)
      else onPreviewMove(collectionAction.delta, collectionAction.count)
      return
    }
    const action = pullRequestWorkspaceAction({
      keyName: key.name,
      sequence: key.sequence,
      shift: key.shift,
      focus,
      hasSelection,
      canLoadMore,
      canLoadPreview,
      ctrl: key.ctrl,
    })
    if (!action) return
    key.preventDefault()
    if (key.name === "escape") key.stopPropagation()
    onWorkspaceAction(action)
  })
}
