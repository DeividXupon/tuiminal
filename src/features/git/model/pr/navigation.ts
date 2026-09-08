import type { PullRequestActionKind } from "./actions"
import type { PullRequestPreviewConfig } from "./config"
import type { PullRequestPreviewTab } from "./types"

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
  sequence,
  shift,
}: {
  keyName: string
  sequence?: string | undefined
  shift?: boolean | undefined
}): PullRequestNavigationAction | null {
  if (keyName === "<" || sequence === "<" || (keyName === "," && shift)) {
    return { type: "move-section", delta: -1 }
  }
  if (keyName === ">" || sequence === ">" || (keyName === "." && shift)) {
    return { type: "move-section", delta: 1 }
  }
  return null
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

function previewNavigationAction(keyName: string) {
  if (keyName === "h" || keyName === "left" || keyName === "escape") {
    return { type: "focus", target: "list" } as const
  }
  if (keyName === "[" || keyName === "]") {
    return { type: "move-preview-tab", delta: keyName === "[" ? -1 : 1 } as const
  }
  if (keyName === "j" || keyName === "down") return { type: "scroll-preview", delta: 1 } as const
  if (keyName === "k" || keyName === "up") return { type: "scroll-preview", delta: -1 } as const
  return null
}

export function pullRequestNavigationAction({
  keyName,
  sequence,
  shift,
  focus,
  hasSelection,
}: {
  keyName: string
  sequence?: string | undefined
  shift?: boolean | undefined
  focus: PullRequestFocus
  hasSelection: boolean
}): PullRequestNavigationAction | null {
  const sectionAction = sectionNavigationAction({ keyName, sequence, shift })
  if (sectionAction) return sectionAction
  return focus === "list"
    ? listNavigationAction(keyName, shift, hasSelection)
    : previewNavigationAction(keyName)
}

export function pullRequestWorkspaceAction({
  keyName,
  sequence,
  shift,
  focus,
  hasSelection,
  canLoadMore,
  canLoadPreview,
  ctrl,
}: {
  keyName: string
  sequence?: string
  shift?: boolean
  focus: PullRequestFocus
  hasSelection: boolean
  canLoadMore?: boolean
  canLoadPreview?: boolean
  ctrl?: boolean
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
  const selectedAction = selectedPullRequestAction({
    keyName,
    ctrl,
    shift,
    focus,
    hasSelection,
  })
  if (selectedAction) return selectedAction
  return pullRequestNavigationAction({ keyName, sequence, shift, focus, hasSelection })
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
  if (keyName === "c" && shift) return { type: "prepare-action", kind: "checkout" }
  if (keyName === "c") return { type: "prepare-action", kind: "comment" }
  if (keyName === "v") return { type: "prepare-action", kind: "approve" }
  if (keyName === "a" && ctrl) return { type: "prepare-action", kind: "approve-workflow" }
  if (keyName === "a") return { type: "prepare-action", kind: shift ? "unassign" : "assign" }
  if (keyName === "w" && shift) return { type: "prepare-action", kind: "ready" }
  if (keyName === "x") return { type: "prepare-action", kind: shift ? "reopen" : "close" }
  if (keyName === "u") return { type: "prepare-action", kind: "update-branch" }
  if (keyName === "m") return { type: "prepare-action", kind: "merge" }
  if (focus === "preview" && keyName === "e") return { type: "toggle-description" }
  return null
}
