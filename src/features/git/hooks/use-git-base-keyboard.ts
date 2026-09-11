import type { KeyEvent } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { type Dispatch, type SetStateAction, useCallback } from "react"
import {
  gitHistoryNavigationDelta,
  gitPaneFocusTarget,
  isGitHistoryFocused,
} from "../model/base-navigation"
import type { GitCommit } from "../model/types"
import type { DiffLayout, GitFocusPane, ViewMode } from "../model/view"
import { isGitFileTreeFocused } from "../ui/base/GitFileTree"

type GitBaseKeyboardOptions = {
  active: boolean
  discardOpen: boolean
  focusedPane: GitFocusPane
  view: ViewMode
  commitCount: number
  selectedCommit: GitCommit | null
  maxDiffOffset: number
  focusGitPane: (pane: GitFocusPane) => void
  refresh: () => Promise<void>
  runStageAction: (scope: "file" | "selection") => Promise<void>
  openDiscardTarget: () => void
  showPreviewPane: () => void
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  setView: Dispatch<SetStateAction<ViewMode>>
  setDiffOffset: Dispatch<SetStateAction<number>>
  setDiffLayout: Dispatch<SetStateAction<DiffLayout>>
}

type FocusContext = {
  fileTree: boolean
  history: boolean
  terminal: boolean
  pane: GitFocusPane
}

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function resolveFocusContext(focusedId: string, fallback: GitFocusPane): FocusContext {
  const fileTree = isGitFileTreeFocused(focusedId, "git-file-list")
  const history = isGitHistoryFocused(focusedId)
  const terminal = focusedId === "git-command-input"
  if (fileTree) return { fileTree, history, terminal, pane: "files" }
  if (terminal) return { fileTree, history, terminal, pane: "terminal" }
  if (focusedId === "git-base-diff" || history) {
    return { fileTree, history, terminal, pane: "preview" }
  }
  return { fileTree, history, terminal, pane: fallback }
}

export function useGitBaseKeyboard(options: GitBaseKeyboardOptions) {
  const renderer = useRenderer()

  const handleTerminal = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      if (!focus.terminal) return false
      if (key.name === "tab" || key.name === "escape") {
        consume(key)
        options.focusGitPane(key.name === "tab" ? "files" : "preview")
      }
      return true
    },
    [options.focusGitPane],
  )

  const handlePane = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      const target = gitPaneFocusTarget(key.name, focus.pane)
      if (!target) return false
      consume(key)
      options.focusGitPane(target)
      return true
    },
    [options.focusGitPane],
  )

  const handleHistoryNavigation = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      const delta = gitHistoryNavigationDelta(key.name)
      if (!delta || (options.view !== "log" && options.view !== "graph") || !focus.history) {
        return false
      }
      consume(key)
      options.setSelectedCommitIndex((current) =>
        Math.max(0, Math.min(Math.max(0, options.commitCount - 1), current + delta)),
      )
      return true
    },
    [options.commitCount, options.setSelectedCommitIndex, options.view],
  )

  const handleFileAction = useCallback(
    (key: KeyEvent) => {
      if (key.name === "r") {
        consume(key)
        void options.refresh()
        return true
      }
      if (options.view !== "diff") return false
      if (key.name === "space") void options.runStageAction("file")
      else if (key.name === "a") void options.runStageAction("selection")
      else if (key.name === "d") options.openDiscardTarget()
      else return false
      consume(key)
      return true
    },
    [options.openDiscardTarget, options.refresh, options.runStageAction, options.view],
  )

  const handleViewAction = useCallback(
    (key: KeyEvent) => {
      if (key.name === "t") options.focusGitPane("terminal")
      else if (key.name === "o") options.setView("log")
      else if (key.name === "g") {
        options.setView((current) => (current === "graph" ? "diff" : "graph"))
      } else if (key.name === "v" && options.view !== "log" && options.view !== "graph") {
        options.setDiffLayout((current) =>
          current === "unified" ? "split" : current === "split" ? "inline" : "unified",
        )
      } else return false
      consume(key)
      if (key.name === "o" || key.name === "g") options.showPreviewPane()
      if (key.name !== "t") options.setDiffOffset(0)
      return true
    },
    [
      options.focusGitPane,
      options.setDiffLayout,
      options.setDiffOffset,
      options.setView,
      options.showPreviewPane,
      options.view,
    ],
  )

  const handleOpenOrReturn = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      if (key.name === "d" && options.view !== "diff") {
        options.setView("diff")
        options.showPreviewPane()
        options.setDiffOffset(0)
      } else if (
        (key.name === "return" || key.name === "enter" || key.name === "linefeed") &&
        (options.view === "log" || options.view === "graph") &&
        focus.history &&
        options.selectedCommit
      ) {
        options.setView("commit")
        options.showPreviewPane()
      } else return false
      consume(key)
      return true
    },
    [
      options.selectedCommit,
      options.setDiffOffset,
      options.setView,
      options.showPreviewPane,
      options.view,
    ],
  )

  const handleDiffScroll = useCallback(
    (key: KeyEvent) => {
      if (
        (key.name !== "[" && key.name !== "]") ||
        options.view === "log" ||
        options.view === "graph"
      ) {
        return false
      }
      consume(key)
      options.setDiffOffset((current) =>
        key.name === "[" ? Math.max(0, current - 5) : Math.min(options.maxDiffOffset, current + 5),
      )
      return true
    },
    [options.maxDiffOffset, options.setDiffOffset, options.view],
  )

  useKeyboard((key) => {
    if (!options.active || key.defaultPrevented || options.discardOpen) return
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    const focus = resolveFocusContext(focusedId, options.focusedPane)
    if (handleTerminal(key, focus)) return
    if (handlePane(key, focus)) return
    if (handleHistoryNavigation(key, focus)) return
    if (handleFileAction(key)) return
    if (handleViewAction(key)) return
    if (handleOpenOrReturn(key, focus)) return
    handleDiffScroll(key)
  })
}
