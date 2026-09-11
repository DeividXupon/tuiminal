import type { PullRequestActionKind } from "./actions"
import type { PullRequestPreviewConfig } from "./config"
import type { PullRequestPreviewTab } from "./types"
import { directionalShortcutDirection } from "../../../../shared/ui/directional-shortcut"

export type PullRequestLayoutMode = "side-by-side" | "stacked" | "single"
export type PullRequestFocus = "list" | "preview"
export type PullRequestNavigationAction =
  | { type: "move-section"; delta: -1 | 1 }
  | { type: "move-row"; delta: -1 | 1 }
  | { type: "select-edge"; target: "first" | "last" }
  | { type: "focus"; target: PullRequestFocus }
  | { type: "move-preview-tab"; delta: -1 | 1 }
  | { type: "scroll-preview"; delta: number }

export type PullRequestWorkspaceAction =
  | PullRequestNavigationAction
  | { type: "edit-query" }
  | { type: "refresh" }
  | { type: "load-more" }
  | { type: "load-preview-more" }
  | { type: "open-diff" }
  | { type: "open-action-menu" }
  | { type: "prepare-action"; kind: PullRequestActionKind }
  | { type: "toggle-watch" }
  | { type: "toggle-preview" }
  | { type: "cycle-preview-position" }
  | { type: "open-browser" | "copy-url" | "copy-number" | "copy-sha" | "toggle-description" }

export const PULL_REQUEST_PREVIEW_TABS: readonly PullRequestPreviewTab[] = [
  "overview",
  "checks",
  "activity",
  "commits",
  "files",
]

export function resolvePullRequestLayout(
  width: number,
  height: number,
  position: PullRequestPreviewConfig["position"] = "auto",
): PullRequestLayoutMode {
  if (position === "right") return width >= 90 && height >= 20 ? "side-by-side" : "single"
  if (position === "bottom") return width >= 60 && height >= 20 ? "stacked" : "single"
  if (width >= 118 && height >= 22) return "side-by-side"
  if (width >= 76 && height >= 20) return "stacked"
  return "single"
}

export function nextPullRequestPreviewPosition(
  position: PullRequestPreviewConfig["position"],
): PullRequestPreviewConfig["position"] {
  if (position === "auto") return "right"
  if (position === "right") return "bottom"
  return "auto"
}

export function movePullRequestIndex(current: number, count: number, delta: -1 | 1) {
  return Math.max(0, Math.min(Math.max(0, count - 1), current + delta))
}

export function adjacentPreviewTab(
  current: PullRequestPreviewTab,
  delta: -1 | 1,
): PullRequestPreviewTab {
  const index = PULL_REQUEST_PREVIEW_TABS.indexOf(current)
  const next = (index + delta + PULL_REQUEST_PREVIEW_TABS.length) % PULL_REQUEST_PREVIEW_TABS.length
  return PULL_REQUEST_PREVIEW_TABS[next] ?? "overview"
}

function sectionNavigationAction({
  keyName,
  ctrl,
  shift,
  option,
  meta,
}: {
  keyName: string
  ctrl?: boolean | undefined
  shift?: boolean | undefined
  option?: boolean | undefined
  meta?: boolean | undefined
}): PullRequestNavigationAction | null {
  const direction = directionalShortcutDirection({ name: keyName, ctrl, shift, option, meta })
  return direction ? { type: "move-section", delta: direction } : null
}

function listNavigationAction(keyName: string, shift: boolean | undefined, hasSelection: boolean) {
  if (keyName === "home" || (keyName === "g" && !shift))
    return { type: "select-edge", target: "first" } as const
  if (keyName === "end" || (keyName === "g" && shift)) {
    return { type: "select-edge", target: "last" } as const
  }
  if (keyName === "j" || keyName === "down") return { type: "move-row", delta: 1 } as const
  if (keyName === "k" || keyName === "up") return { type: "move-row", delta: -1 } as const
  if (
    hasSelection &&
    (keyName === "l" || keyName === "right" || keyName === "enter" || keyName === "return")
  ) {
    return { type: "focus", target: "preview" } as const
  }
  return null
}

function previewNavigationAction({
  keyName,
  ctrl,
  shift,
  option,
  meta,
}: {
  keyName: string
  ctrl?: boolean | undefined
  shift?: boolean | undefined
  option?: boolean | undefined
  meta?: boolean | undefined
}) {
  if (keyName === "h" || keyName === "left" || keyName === "escape") {
    return { type: "focus", target: "list" } as const
  }
  const direction = directionalShortcutDirection(
    { name: keyName, ctrl, shift, option, meta },
    "nested",
  )
  if (direction) return { type: "move-preview-tab", delta: direction } as const
  if (keyName === "j" || keyName === "down") return { type: "scroll-preview", delta: 1 } as const
  if (keyName === "k" || keyName === "up") return { type: "scroll-preview", delta: -1 } as const
  return null
}

export function pullRequestNavigationAction({
  keyName,
  ctrl,
  shift,
  option,
  meta,
  focus,
  hasSelection,
}: {
  keyName: string
  ctrl?: boolean | undefined
  shift?: boolean | undefined
  option?: boolean | undefined
  meta?: boolean | undefined
  focus: PullRequestFocus
  hasSelection: boolean
}): PullRequestNavigationAction | null {
  const sectionAction = sectionNavigationAction({ keyName, ctrl, shift, option, meta })
  if (sectionAction) return sectionAction
  return focus === "list"
    ? listNavigationAction(keyName, shift, hasSelection)
    : previewNavigationAction({ keyName, ctrl, shift, option, meta })
}

export function pullRequestWorkspaceAction({
  keyName,
  shift,
  focus,
  hasSelection,
  canLoadMore,
  canLoadPreview,
  ctrl,
  option,
  meta,
}: {
  keyName: string
  shift?: boolean
  focus: PullRequestFocus
  hasSelection: boolean
  canLoadMore?: boolean
  canLoadPreview?: boolean
  ctrl?: boolean
  option?: boolean
  meta?: boolean
}): PullRequestWorkspaceAction | null {
  const configuration = pullRequestConfigurationAction({
    keyName,
    shift,
  })
  if (configuration) return configuration
  if (keyName === "r") return { type: "refresh" }
  if (keyName === "n" && focus === "preview" && canLoadPreview) {
    return { type: "load-preview-more" }
  }
  if (keyName === "n" && canLoadMore) return { type: "load-more" }
  if (focus === "preview" && ctrl && (keyName === "d" || keyName === "u")) {
    return { type: "scroll-preview", delta: keyName === "d" ? 10 : -10 }
  }
  const sectionAction = sectionNavigationAction({ keyName, ctrl, shift, option, meta })
  if (sectionAction) return sectionAction
  if (focus === "preview") {
    const previewAction = previewNavigationAction({ keyName, ctrl, shift, option, meta })
    if (previewAction) return previewAction
  }
  const selectedAction = selectedPullRequestAction({
    keyName,
    ctrl,
    shift,
    focus,
    hasSelection,
  })
  if (selectedAction) return selectedAction
  return pullRequestNavigationAction({
    keyName,
    ctrl,
    shift,
    option,
    meta,
    focus,
    hasSelection,
  })
}

function pullRequestConfigurationAction({
  keyName,
  shift,
}: {
  keyName: string
  shift?: boolean | undefined
}): PullRequestWorkspaceAction | null {
  if (keyName === "p") return { type: shift ? "cycle-preview-position" : "toggle-preview" }
  if (keyName === "/") return { type: "edit-query" }
  return null
}

function selectedPullRequestAction({
  keyName,
  ctrl,
  shift,
  focus,
  hasSelection,
}: {
  keyName: string
  ctrl: boolean | undefined
  shift: boolean | undefined
  focus: PullRequestFocus
  hasSelection: boolean
}): PullRequestWorkspaceAction | null {
  if (!hasSelection) return null
  if (keyName === "?") return { type: "open-action-menu" }
  if (keyName === "d" && !ctrl) return { type: "open-diff" }
  if (keyName === "o") return { type: "open-browser" }
  if (keyName === "y" && shift) return { type: "copy-url" }
  if (keyName === "y" || (keyName === "y" && ctrl)) return { type: "copy-number" }
  if (keyName === "w" && !shift) return { type: "toggle-watch" }
  return mutationShortcutAction(keyName, ctrl, shift, focus)
}

function mutationShortcutAction(
  keyName: string,
  ctrl: boolean | undefined,
  shift: boolean | undefined,
  focus: PullRequestFocus,
): PullRequestWorkspaceAction | null {
  const kind = pullRequestActionKindForShortcut({ name: keyName, ctrl, shift })
  if (kind) return { type: "prepare-action", kind }
  if (focus === "preview" && keyName === "e") return { type: "toggle-description" }
  return null
}

export function pullRequestActionKindForShortcut(key: {
  name: string
  ctrl?: boolean | undefined
  shift?: boolean | undefined
}): PullRequestActionKind | null {
  const name = key.name.toLowerCase()
  if (name === "c") return key.shift ? "checkout" : "comment"
  if (name === "e" && key.shift) return "reaction"
  if (name === "v") return "approve"
  if (name === "a" && key.ctrl) return "approve-workflow"
  if (name === "a") return key.shift ? "unassign" : "assign"
  if (name === "w" && key.shift) return "ready"
  if (name === "x") return key.shift ? "reopen" : "close"
  if (name === "u") return "update-branch"
  if (name === "m") return "merge"
  return null
}
