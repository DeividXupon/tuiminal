import { useKeyboard } from "@opentui/react"
import type { PullRequestFocus, PullRequestWorkspaceAction } from "../../model/pr/navigation"
import { pullRequestWorkspaceAction } from "../../model/pr/navigation"
import type { PullRequestDetails, PullRequestPreviewTab } from "../../model/pr/types"

type PreviewCollectionAction =
  | { type: "move"; delta: -1 | 1; count: number }
  | { type: "copy"; value: string }
  | { type: "comment-action"; kind: "reaction" | "reply" }

function activityCollectionAction(
  keyName: string,
  count: number,
  shift?: boolean,
): PreviewCollectionAction | null {
  if (!count) return null
  if (["j", "down", "k", "up"].includes(keyName)) {
    return {
      type: "move",
      delta: keyName === "j" || keyName === "down" ? 1 : -1,
      count,
    }
  }
  if (shift) return null
  if (keyName === "e") return { type: "comment-action", kind: "reaction" }
  if (keyName === "enter" || keyName === "return") {
    return { type: "comment-action", kind: "reply" }
  }
  return null
}

function detailCollectionAction(
  keyName: string,
  tab: PullRequestPreviewTab,
  details: PullRequestDetails,
  selectedIndex: number,
): PreviewCollectionAction | null {
  if (tab !== "commits" && tab !== "files") return null
  if (["j", "down", "k", "up"].includes(keyName)) {
    return {
      type: "move",
      delta: keyName === "j" || keyName === "down" ? 1 : -1,
      count: details[tab].length,
    }
  }
  const commit = tab === "commits" && keyName === "y" ? details.commits[selectedIndex] : null
  return commit ? { type: "copy", value: commit.sha } : null
}

function previewCollectionAction({
  keyName,
  focus,
  tab,
  details,
  selectedIndex,
  shift,
}: {
  keyName: string
  focus: PullRequestFocus
  tab: PullRequestPreviewTab
  details: PullRequestDetails | null
  selectedIndex: number
  shift?: boolean
}): PreviewCollectionAction | null {
  if (focus !== "preview" || !details) return null
  if (tab === "activity") {
    return activityCollectionAction(keyName, details.comments.length, shift)
  }
  return detailCollectionAction(keyName, tab, details, selectedIndex)
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
  onCommentReact,
  onCommentReply,
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
  onCommentReact: () => void
  onCommentReply: () => void
}) {
  useKeyboard((key) => {
    if (!active || blocked) return
    const collectionAction = previewCollectionAction({
      keyName: key.name,
      focus,
      tab: previewTab,
      details,
      selectedIndex: previewItemIndex,
      shift: key.shift,
    })
    if (collectionAction) {
      key.preventDefault()
      if (collectionAction.type === "copy") onCopySha(collectionAction.value)
      else if (collectionAction.type === "move") {
        onPreviewMove(collectionAction.delta, collectionAction.count)
      } else if (collectionAction.kind === "reaction") onCommentReact()
      else onCommentReply()
      return
    }
    const action = pullRequestWorkspaceAction({
      keyName: key.name,
      shift: key.shift,
      focus,
      hasSelection,
      canLoadMore,
      canLoadPreview,
      ctrl: key.ctrl,
      option: key.option,
      meta: key.meta,
    })
    if (!action) return
    key.preventDefault()
    if (key.name === "escape") key.stopPropagation()
    onWorkspaceAction(action)
  })
}
