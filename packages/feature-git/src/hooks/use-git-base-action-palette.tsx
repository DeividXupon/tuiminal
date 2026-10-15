import { gitBaseActionTags } from "../rendering/action-palette-tags"
import type { KeyEvent, Renderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { focusedRenderableId, ownsKeyboardFocus } from "@xupon/tuiminal-core/keyboard/scope"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ActionPalette } from "@xupon/tuiminal-core/ui/ActionPalette"
import {
  type ActionPaletteSideSection,
  isActionPaletteKey,
} from "@xupon/tuiminal-core/ui/action-palette"
import { FocusSelectionOverlay } from "@xupon/tuiminal-core/ui/FocusSelectionOverlay"
import { focusDirectionForKey, nextFocusTarget } from "@xupon/tuiminal-core/ui/focus-navigation"
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { gitKeyboardScope } from "../keyboard"
import {
  type GitBranchSwitchCallbacks,
  useGitBranchPaletteSide,
} from "./use-git-branch-palette-side"
import { useGitLocalProjectsSide } from "./use-git-local-projects-side"
import {
  type GitBaseActionId,
  type GitBaseActionState,
  gitBaseActions,
} from "../model/base-actions"
import type { DiffLayout, FileTreeOption, GitFocusPane, ViewMode } from "../model/view"

export type GitBaseNavigationTarget = "pr" | "issues" | "inbox" | "compare"
export type GitBoxTarget = GitFocusPane

export const GIT_ACTION_PALETTE_ID = "git-action-palette"
export const GIT_BOX_SELECTION_ID = "git-box-selection"
export const GIT_ACTION_PALETTE_OPEN_ID = "git-action-palette-open"

const GIT_BOX_TARGETS: Readonly<Record<GitBoxTarget, string>> = {
  files: "git-base-files-panel",
  preview: "git-base-history",
  terminal: "git-command-console",
}

type GitBaseActionHandlers = {
  fileOptions: readonly FileTreeOption[]
  selectedTreeIndex: number
  commitCount: number
  stagePending: boolean
  activateFileTreeOption: (index: number, option: FileTreeOption) => void
  runStageAction: (scope: "file" | "selection") => Promise<void>
  openDiscardTarget: () => void
  partialStage: {
    start: () => Promise<void>
    toggleGranularity: () => void
    transferTarget: () => void
    apply: () => Promise<void>
  }
  setView: Dispatch<SetStateAction<ViewMode>>
  setDiffLayout: Dispatch<SetStateAction<DiffLayout>>
  setDiffOffset: Dispatch<SetStateAction<number>>
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  setTerminalExpanded: Dispatch<SetStateAction<boolean>>
  showPreviewPane: () => void
  focusGitPane: (pane: GitFocusPane) => void
  refresh: () => Promise<void>
  onNavigate?: ((target: GitBaseNavigationTarget) => void) | undefined
  onOpenLocalConfiguration?: (() => void) | undefined
}

function nextDiffLayout(current: DiffLayout): DiffLayout {
  if (current === "unified") return "split"
  return current === "split" ? "inline" : "unified"
}

function runGitBaseAction(
  id: GitBaseActionId,
  handlers: GitBaseActionHandlers,
  openBoxSelection: () => void,
) {
  const showView = (view: SetStateAction<ViewMode>) => {
    handlers.setView(view)
    handlers.showPreviewPane()
    handlers.setDiffOffset(0)
  }
  const moveCommit = (delta: number) =>
    handlers.setSelectedCommitIndex((current) =>
      Math.max(0, Math.min(Math.max(0, handlers.commitCount - 1), current + delta)),
    )
  const actions: Record<GitBaseActionId, () => void> = {
    "open-selection": () => {
      const option = handlers.fileOptions[handlers.selectedTreeIndex]
      if (option) handlers.activateFileTreeOption(handlers.selectedTreeIndex, option)
    },
    "stage-file": () => void handlers.runStageAction("file"),
    "stage-selection": () => void handlers.runStageAction("selection"),
    discard: handlers.openDiscardTarget,
    "partial-stage": () => void handlers.partialStage.start(),
    "diff-layout": () => {
      handlers.setDiffLayout(nextDiffLayout)
      handlers.setDiffOffset(0)
    },
    "show-diff": () => showView("diff"),
    log: () => showView("log"),
    graph: () => showView((current) => (current === "graph" ? "diff" : "graph")),
    "next-commit": () => moveCommit(1),
    "previous-commit": () => moveCommit(-1),
    "open-commit": () => {
      handlers.setView("commit")
      handlers.showPreviewPane()
    },
    "focus-terminal": () => handlers.focusGitPane("terminal"),
    "toggle-terminal": () => {
      handlers.setTerminalExpanded((current) => !current)
      handlers.focusGitPane("terminal")
    },
    "choose-box": openBoxSelection,
    "focus-files": () => handlers.focusGitPane("files"),
    "focus-preview": () => handlers.focusGitPane("preview"),
    "partial-toggle-mode": handlers.partialStage.toggleGranularity,
    "partial-transfer": handlers.partialStage.transferTarget,
    "partial-apply": () => void handlers.partialStage.apply(),
    "tab-pr": () => handlers.onNavigate?.("pr"),
    "tab-issues": () => handlers.onNavigate?.("issues"),
    "tab-inbox": () => handlers.onNavigate?.("inbox"),
    compare: () => handlers.onNavigate?.("compare"),
    refresh: () => {
      if (!handlers.stagePending) void handlers.refresh()
    },
    "local-configuration": () => handlers.onOpenLocalConfiguration?.(),
  }
  actions[id]()
}

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function plainKey(key: KeyEvent) {
  return !key.ctrl && !key.meta && !key.option && !key.shift && !key.super
}

function boxRects(findRenderable: (id: string) => Renderable | null | undefined) {
  const rects = (Object.keys(GIT_BOX_TARGETS) as GitBoxTarget[]).flatMap((key) => {
    const renderable = findRenderable(GIT_BOX_TARGETS[key])
    if (!renderable?.visible || renderable.width <= 0 || renderable.height <= 0) return []
    return [
      {
        key,
        left: renderable.screenX,
        top: renderable.screenY,
        width: renderable.width,
        height: renderable.height,
      },
    ]
  })
  // The preview chrome and action footer sit between preview and console; treat that
  // column as one stack so vertical movement stays inside it.
  const preview = rects.find((rect) => rect.key === "preview")
  const terminal = rects.find((rect) => rect.key === "terminal")
  if (preview && terminal && terminal.top > preview.top) preview.height = terminal.top - preview.top
  return rects
}

/**
 * Owns the Diffs `[?]` action palette and `[M]` box selection. Mounted UI exists only
 * while open; the base keyboard must stay blocked through `blocksKeyboard`.
 */
export function useGitBaseActionPalette({
  active,
  blocked,
  state,
  handlers,
  observed,
}: {
  active: boolean
  blocked: boolean
  state: GitBaseActionState
  handlers: GitBaseActionHandlers
  /** Observed project and branch, shown as the palette's side column. */
  observed: {
    root: string | null | undefined
    /** Applies a project selection; without it the projects block is hidden. */
    onProjectChanged?: (() => void) | undefined
    callbacks: Omit<GitBranchSwitchCallbacks, "closeThen" | "refresh">
  }
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [boxSelection, setBoxSelection] = useState<GitBoxTarget | null>(null)
  const previousFocus = useRef<Renderable | null>(null)
  const actions = useMemo(() => (paletteOpen ? gitBaseActions(state) : []), [paletteOpen, state])
  // Palette colors are read at open time so palette switches apply to the next opening.
  const tags = useMemo(() => {
    void paletteOpen
    return gitBaseActionTags(COLORS)
  }, [paletteOpen])

  useEffect(() => {
    if (active) return
    previousFocus.current = null
    setPaletteOpen(false)
    setBoxSelection(null)
  }, [active])

  const openBoxSelection = useCallback(() => {
    const rects = boxRects((id) => renderer.root.findDescendantById(id))
    const origin = rects.find((rect) => rect.key === state.focusedPane) ?? rects[0]
    if (!origin) return
    setBoxSelection(origin.key)
    setTimeout(() => renderer.root.findDescendantById(GIT_BOX_SELECTION_ID)?.focus(), 0)
  }, [renderer, state.focusedPane])

  const focusBox = useCallback(
    (target: GitBoxTarget) => {
      setBoxSelection(null)
      handlers.focusGitPane(target)
    },
    [handlers],
  )

  const openPalette = useCallback(() => {
    const focused = renderer.currentFocusedRenderable
    previousFocus.current = focused?.id === GIT_ACTION_PALETTE_OPEN_ID ? null : focused
    focused?.blur()
    setPaletteOpen(true)
  }, [renderer])

  const closePalette = useCallback(
    (then?: () => void) => {
      setPaletteOpen(false)
      const previous = previousFocus.current
      previousFocus.current = null
      setTimeout(() => {
        if (previous && !previous.isDestroyed) previous.focus()
        else handlers.focusGitPane(state.focusedPane)
        then?.()
      }, 0)
    },
    [handlers, state.focusedPane],
  )

  const runAction = useCallback(
    (id: GitBaseActionId) => closePalette(() => runGitBaseAction(id, handlers, openBoxSelection)),
    [closePalette, handlers, openBoxSelection],
  )

  const sideBlockedReason = state.partialStage
    ? "Conclua o stage parcial"
    : state.busy || state.stagePending
      ? "Operação Git em andamento"
      : null
  const projectsSide = useGitLocalProjectsSide({
    open: paletteOpen && active,
    currentRoot: state.repository ? observed.root : null,
    blockedReason: sideBlockedReason,
    onProjectChanged: observed.onProjectChanged,
    callbacks: { ...observed.callbacks, closeThen: closePalette },
  })
  const branchSide = useGitBranchPaletteSide({
    open: paletteOpen && active,
    root: state.repository ? observed.root : null,
    blockedReason: sideBlockedReason,
    callbacks: { ...observed.callbacks, closeThen: closePalette, refresh: handlers.refresh },
  })
  const side = [projectsSide, branchSide].filter((section): section is ActionPaletteSideSection =>
    Boolean(section),
  )

  const handleBoxSelectionKey = (key: KeyEvent, current: GitBoxTarget) => {
    consume(key)
    const direction = plainKey(key) ? focusDirectionForKey(key.name.toLowerCase()) : null
    if (direction) {
      const rects = boxRects((id) => renderer.root.findDescendantById(id))
      setBoxSelection(nextFocusTarget(rects, current, direction))
    } else if (key.name === "return" || key.name === "enter" || key.name === "linefeed") {
      focusBox(current)
    } else if (key.name === "escape" || (plainKey(key) && key.name === "m")) {
      focusBox(state.focusedPane)
    }
  }

  useKeyboard((key) => {
    if (!active || blocked || paletteOpen || key.defaultPrevented) return
    if (boxSelection) {
      handleBoxSelectionKey(key, boxSelection)
      return
    }
    const focusedId = focusedRenderableId(renderer.currentFocusedRenderable)
    if (ownsKeyboardFocus(gitKeyboardScope, focusedId)) return
    if (isActionPaletteKey(key)) {
      consume(key)
      openPalette()
    } else if (plainKey(key) && key.name === "m" && state.repository && !state.partialStage) {
      consume(key)
      openBoxSelection()
    }
  })

  const palette =
    paletteOpen && active ? (
      <ActionPalette
        id={GIT_ACTION_PALETTE_ID}
        title="AÇÕES DO GIT · DIFFS"
        side={side.length ? side : undefined}
        accent={COLORS.git}
        actions={actions}
        tags={tags}
        width={terminal.width}
        height={terminal.height}
        onRun={runAction}
        onClose={() => closePalette()}
      />
    ) : null

  const boxOverlay = (target: GitBoxTarget) =>
    boxSelection && active ? (
      <FocusSelectionOverlay
        id={`git-box-${target}`}
        selected={boxSelection === target}
        onFocus={() => focusBox(target)}
      />
    ) : null

  const boxSelectionFocus =
    boxSelection && active ? (
      <box
        id={GIT_BOX_SELECTION_ID}
        focusable
        position="absolute"
        top={0}
        left={0}
        width={1}
        height={1}
      />
    ) : null

  return {
    blocksKeyboard: paletteOpen || Boolean(boxSelection),
    openPalette,
    palette,
    boxOverlay,
    boxSelectionFocus,
  }
}
