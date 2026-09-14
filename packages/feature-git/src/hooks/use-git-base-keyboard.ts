import type { KeyEvent } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { type Dispatch, type SetStateAction, useCallback } from "react"
import {
  gitDiffHorizontalScrollDelta,
  gitHistoryNavigationDelta,
  gitPaneFocusTarget,
  isGitHistoryFocused,
} from "../model/base-navigation"
import type { GitCommit } from "../model/types"
import type { DiffLayout, GitFocusPane, ViewMode } from "../model/view"
import { isGitFileTreeFocused } from "../ui/base/GitFileTree"
import type { GitPartialStagePane } from "./use-git-partial-stage"

type GitBaseKeyboardOptions = {
  active: boolean
  discardOpen: boolean
  autocompleteOpen: boolean
  dismissAutocomplete: () => void
  focusedPane: GitFocusPane
  view: ViewMode
  commitCount: number
  selectedCommit: GitCommit | null
  maxDiffOffset: number
  scrollDiffHorizontally: (delta: number) => void
  focusGitPane: (pane: GitFocusPane) => void
  refresh: () => Promise<void>
  runStageAction: (scope: "file" | "selection") => Promise<void>
  openDiscardTarget: () => void
  showPreviewPane: () => void
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  setView: Dispatch<SetStateAction<ViewMode>>
  setDiffOffset: Dispatch<SetStateAction<number>>
  setDiffLayout: Dispatch<SetStateAction<DiffLayout>>
  partialStage: {
    active: boolean
    pane: GitPartialStagePane
    start: () => Promise<void>
    cancel: () => void
    move: (delta: -1 | 1) => void
    selectPane: (pane: GitPartialStagePane) => void
    toggleGranularity: () => void
    transferTarget: () => void
    apply: () => Promise<void>
  }
}

type FocusContext = {
  diff: boolean
  fileTree: boolean
  history: boolean
  terminal: boolean
  pane: GitFocusPane
}

type PartialStageKeyAction =
  | "start"
  | "next"
  | "previous"
  | "toggleMode"
  | "transfer"
  | "apply"
  | "available"
  | "selected"
  | "stay"

const ACTIVE_PARTIAL_STAGE_KEYS: Readonly<Record<string, PartialStageKeyAction>> = {
  escape: "apply",
  j: "next",
  down: "next",
  k: "previous",
  up: "previous",
  s: "toggleMode",
  space: "transfer",
  return: "apply",
  enter: "apply",
  linefeed: "apply",
}

function partialStageKeyAction(
  keyName: string,
  shift: boolean,
  focus: FocusContext,
  active: boolean,
  view: ViewMode,
  pane: GitPartialStagePane,
): PartialStageKeyAction | null {
  if (shift && (keyName === "h" || keyName === "l" || keyName === "left" || keyName === "right")) {
    return null
  }
  if (!active)
    return keyName === "s" && view === "diff" && focus.pane === "preview" ? "start" : null
  if (keyName === "tab") return pane === "available" ? "selected" : "available"
  if (keyName === "t") return "stay"
  if (keyName === "h" || keyName === "left") return "available"
  if (keyName === "l" || keyName === "right") return "selected"
  const action = ACTIVE_PARTIAL_STAGE_KEYS[keyName]
  if (!action) return null
  return focus.pane === "preview" ? action : null
}

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function resolveFocusContext(focusedId: string, fallback: GitFocusPane): FocusContext {
  const diff = focusedId === "git-base-diff" || focusedId.startsWith("git-partial-stage-")
  const fileTree = isGitFileTreeFocused(focusedId, "git-file-list")
  const history = isGitHistoryFocused(focusedId)
  const terminal = focusedId === "git-command-input"
  if (fileTree) return { diff, fileTree, history, terminal, pane: "files" }
  if (terminal) return { diff, fileTree, history, terminal, pane: "terminal" }
  if (diff || history) {
    return { diff, fileTree, history, terminal, pane: "preview" }
  }
  return { diff, fileTree, history, terminal, pane: fallback }
}

export function useGitBaseKeyboard(options: GitBaseKeyboardOptions) {
  const renderer = useRenderer()

  const handleTerminal = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      if (!focus.terminal) return false
      if (key.name === "escape" && options.autocompleteOpen) {
        consume(key)
        options.dismissAutocomplete()
        return true
      }
      if (key.name === "tab" || key.name === "escape") {
        consume(key)
        options.focusGitPane(key.name === "tab" ? "files" : "preview")
      }
      return true
    },
    [options.autocompleteOpen, options.dismissAutocomplete, options.focusGitPane],
  )

  const handlePane = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      if (key.shift) return false
      const target = gitPaneFocusTarget(key.name, focus.pane)
      if (!target) return false
      consume(key)
      options.focusGitPane(target)
      return true
    },
    [options.focusGitPane],
  )

  const handlePartialStage = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      if (options.partialStage.active && focus.pane !== "preview") {
        options.partialStage.cancel()
        return false
      }
      const action = partialStageKeyAction(
        key.name,
        key.shift,
        focus,
        options.partialStage.active,
        options.view,
        options.partialStage.pane,
      )
      if (!action) return false
      const handlers: Record<PartialStageKeyAction, () => void> = {
        start: () => void options.partialStage.start(),
        next: () => options.partialStage.move(1),
        previous: () => options.partialStage.move(-1),
        toggleMode: options.partialStage.toggleGranularity,
        transfer: options.partialStage.transferTarget,
        apply: () => void options.partialStage.apply(),
        available: () => options.partialStage.selectPane("available"),
        selected: () => options.partialStage.selectPane("selected"),
        stay: () => undefined,
      }
      handlers[action]()
      consume(key)
      return true
    },
    [options.partialStage, options.view],
  )

  const handleHorizontalDiffScroll = useCallback(
    (key: KeyEvent, focus: FocusContext) => {
      const delta = gitDiffHorizontalScrollDelta(key.name, key.shift)
      if (!delta || !focus.diff || options.view === "log" || options.view === "graph") return false
      consume(key)
      options.scrollDiffHorizontally(delta)
      return true
    },
    [options.scrollDiffHorizontally, options.view],
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
    (key: KeyEvent, focus: FocusContext) => {
      if (key.name === "r") {
        consume(key)
        void options.refresh()
        return true
      }
      if (options.view !== "diff") return false
      if (key.name === "space" && focus.fileTree) return false
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
      const enter = key.name === "return" || key.name === "enter" || key.name === "linefeed"
      if (key.name === "d" && options.view !== "diff") {
        options.setView("diff")
        options.showPreviewPane()
        options.setDiffOffset(0)
      } else if (
        enter &&
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
    if (handlePartialStage(key, focus)) return
    if (handleTerminal(key, focus)) return
    if (handleHorizontalDiffScroll(key, focus)) return
    if (handlePane(key, focus)) return
    if (handleHistoryNavigation(key, focus)) return
    if (handleFileAction(key, focus)) return
    if (handleViewAction(key)) return
    if (handleOpenOrReturn(key, focus)) return
    handleDiffScroll(key)
  })
}
