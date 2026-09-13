import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { translateUi } from "../../../../shared/i18n"
import { handleGitDiffHorizontalKey } from "../../rendering/diff-scroll"
import {
  adjacentPullRequestHunkOffset,
  nextPullRequestDiffMode,
  type PullRequestDiffFocus,
  type PullRequestDiffKeyboardAction,
  type PullRequestDiffMode,
  pullRequestDiffKeyboardAction,
} from "../../model/pr/diff"

function applyDiffMove({
  focus,
  delta,
  documentCount,
  setFileIndex,
  setOffset,
}: {
  focus: PullRequestDiffFocus
  delta: -1 | 1
  documentCount: number
  setFileIndex: React.Dispatch<React.SetStateAction<number>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
}) {
  if (focus === "files") {
    setFileIndex((current) => Math.max(0, Math.min(documentCount - 1, current + delta)))
    setOffset(0)
    return
  }
  setOffset((current) => Math.max(0, current + delta))
}

function applyDiffAction({
  action,
  key,
  focus,
  documentCount,
  selectedPath,
  setFocus,
  setFileIndex,
  setMode,
  setOffset,
  hunkOffsets,
  offset,
  onClose,
  onCopy,
}: Omit<PrDiffControlsOptions, "scrollRef"> & {
  action: PullRequestDiffKeyboardAction
  key: KeyEvent
}) {
  if (action.type === "close") {
    key.stopPropagation()
    onClose()
  } else if (action.type === "toggle-focus") {
    setFocus(focus === "files" ? "document" : "files")
  } else if (action.type === "focus") setFocus(action.target)
  else if (action.type === "cycle-mode") {
    setMode((current) => nextPullRequestDiffMode(current))
    setOffset(0)
  } else if (action.type === "copy-path" && selectedPath) {
    onCopy(selectedPath, translateUi("Caminho do arquivo copiado."))
  } else if (action.type === "move-hunk") {
    setFocus("document")
    setOffset(adjacentPullRequestHunkOffset(offset, hunkOffsets, action.delta))
  } else if (action.type === "move") {
    applyDiffMove({ focus, delta: action.delta, documentCount, setFileIndex, setOffset })
  }
}

type PrDiffControlsOptions = {
  focus: PullRequestDiffFocus
  documentCount: number
  selectedPath: string | null
  setFocus: (focus: PullRequestDiffFocus) => void
  setFileIndex: React.Dispatch<React.SetStateAction<number>>
  setMode: React.Dispatch<React.SetStateAction<PullRequestDiffMode>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
  hunkOffsets: number[]
  offset: number
  onClose: () => void
  onCopy: (value: string, message: string) => void
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
}

export function usePrDiffControls(options: PrDiffControlsOptions) {
  useKeyboard((key) => {
    if (handleGitDiffHorizontalKey(key, options.focus === "document", options.scrollRef.current))
      return
    const action = pullRequestDiffKeyboardAction(key.name)
    if (!action) return
    key.preventDefault()
    applyDiffAction({ ...options, action, key })
  })
}
