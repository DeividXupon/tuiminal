import type { IssueActionKind } from "./actions"
import type { IssuePreviewConfig } from "./config"
import type { IssuePreviewTab } from "./types"

export type IssueLayoutMode = "side-by-side" | "stacked" | "single"
export type IssueFocus = "list" | "preview"

export type IssueWorkspaceAction =
  | { type: "move-section"; delta: -1 | 1 }
  | { type: "move-row"; delta: -1 | 1 }
  | { type: "select-edge"; target: "first" | "last" }
  | { type: "focus"; target: IssueFocus }
  | { type: "move-preview-tab"; delta: -1 | 1 }
  | { type: "scroll-preview"; delta: number }
  | { type: "edit-query" | "refresh" | "load-more" }
  | { type: "load-preview-more" | "open-action-menu" | "toggle-description" }
  | { type: "toggle-preview" | "cycle-preview-position" }
  | { type: "open-browser" | "copy-url" | "copy-number" }
  | { type: "prepare-action"; kind: IssueActionKind }

export const ISSUE_PREVIEW_TABS: readonly IssuePreviewTab[] = ["overview", "activity"]

export function resolveIssueLayout(
  width: number,
  height: number,
  position: IssuePreviewConfig["position"] = "auto",
): IssueLayoutMode {
  if (position === "right") return width >= 90 && height >= 20 ? "side-by-side" : "single"
  if (position === "bottom") return width >= 60 && height >= 20 ? "stacked" : "single"
  if (width >= 118 && height >= 22) return "side-by-side"
  if (width >= 76 && height >= 20) return "stacked"
  return "single"
}

export function nextIssuePreviewPosition(position: IssuePreviewConfig["position"]) {
  if (position === "auto") return "right" as const
  if (position === "right") return "bottom" as const
  return "auto" as const
}

export function moveIssueIndex(current: number, count: number, delta: -1 | 1) {
  return Math.max(0, Math.min(Math.max(0, count - 1), current + delta))
}

export function adjacentIssuePreviewTab(current: IssuePreviewTab, delta: -1 | 1) {
  const index = ISSUE_PREVIEW_TABS.indexOf(current)
  const next = (index + delta + ISSUE_PREVIEW_TABS.length) % ISSUE_PREVIEW_TABS.length
  return ISSUE_PREVIEW_TABS[next] ?? "overview"
}

function configurationAction(key: IssueKey): IssueWorkspaceAction | null {
  if (key.name === "p") return { type: key.shift ? "cycle-preview-position" : "toggle-preview" }
  if (key.name === "/") return { type: "edit-query" }
  return null
}

type IssueKey = { name: string; sequence?: string; shift?: boolean; ctrl?: boolean }

function selectedAction(key: IssueKey, focus: IssueFocus): IssueWorkspaceAction | null {
  if (key.name === "?") return { type: "open-action-menu" }
  if (key.name === "o") return { type: "open-browser" }
  if (key.name === "y" && key.shift) return { type: "copy-url" }
  if (key.name === "y") return { type: "copy-number" }
  if (key.name === "c" && key.shift) return { type: "prepare-action", kind: "checkout" }
  if (key.name === "c") return { type: "prepare-action", kind: "comment" }
  if (key.name === "a") return { type: "prepare-action", kind: key.shift ? "unassign" : "assign" }
  if (key.name === "l" && key.shift) return { type: "prepare-action", kind: "labels" }
  if (key.name === "x") return { type: "prepare-action", kind: key.shift ? "reopen" : "close" }
  if (focus === "preview" && key.name === "e") return { type: "toggle-description" }
  return null
}

function loadingAction(
  key: IssueKey,
  focus: IssueFocus,
  canLoadMore: boolean,
  canLoadPreview: boolean,
): IssueWorkspaceAction | null {
  if (key.name === "r") return { type: "refresh" }
  if (key.name !== "n") return null
  if (focus === "preview" && canLoadPreview) return { type: "load-preview-more" }
  return canLoadMore ? { type: "load-more" } : null
}

function sectionAction(key: IssueKey): IssueWorkspaceAction | null {
  if (key.name === "<" || key.sequence === "<" || (key.name === "," && key.shift)) {
    return { type: "move-section", delta: -1 }
  }
  if (key.name === ">" || key.sequence === ">" || (key.name === "." && key.shift)) {
    return { type: "move-section", delta: 1 }
  }
  return null
}

function listNavigationAction(key: IssueKey, hasSelection: boolean): IssueWorkspaceAction | null {
  if (key.name === "home" || (key.name === "g" && !key.shift)) {
    return { type: "select-edge", target: "first" }
  }
  if (key.name === "end" || (key.name === "g" && key.shift)) {
    return { type: "select-edge", target: "last" }
  }
  if (key.name === "j" || key.name === "down") return { type: "move-row", delta: 1 }
  if (key.name === "k" || key.name === "up") return { type: "move-row", delta: -1 }
  if (["l", "right", "enter", "return"].includes(key.name) && hasSelection) {
    return { type: "focus", target: "preview" }
  }
  return null
}

function previewNavigationAction(key: IssueKey): IssueWorkspaceAction | null {
  if (key.name === "h" || key.name === "left" || key.name === "escape") {
    return { type: "focus", target: "list" }
  }
  if (key.name === "[" || key.name === "]") {
    return { type: "move-preview-tab", delta: key.name === "[" ? -1 : 1 }
  }
  if (key.name === "j" || key.name === "down") return { type: "scroll-preview", delta: 1 }
  if (key.name === "k" || key.name === "up") return { type: "scroll-preview", delta: -1 }
  return null
}

function paneAction(
  key: IssueKey,
  focus: IssueFocus,
  hasSelection: boolean,
): IssueWorkspaceAction | null {
  if (focus === "preview" && key.ctrl && (key.name === "d" || key.name === "u")) {
    return { type: "scroll-preview", delta: key.name === "d" ? 10 : -10 }
  }
  return focus === "list" ? listNavigationAction(key, hasSelection) : previewNavigationAction(key)
}

export function issueWorkspaceAction({
  key,
  focus,
  hasSelection,
  canLoadMore,
  canLoadPreview,
}: {
  key: IssueKey
  focus: IssueFocus
  hasSelection: boolean
  canLoadMore: boolean
  canLoadPreview: boolean
}): IssueWorkspaceAction | null {
  const configuration = configurationAction(key)
  if (configuration) return configuration
  const loading = loadingAction(key, focus, canLoadMore, canLoadPreview)
  if (loading) return loading
  if (hasSelection) {
    const selected = selectedAction(key, focus)
    if (selected) return selected
  }
  return sectionAction(key) ?? paneAction(key, focus, hasSelection)
}
