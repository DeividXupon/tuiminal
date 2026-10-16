import {
  type FocusDirection,
  type FocusTargetRect,
  nextFocusTarget,
} from "@xupon/tuiminal-core/ui/focus-navigation"

export type TerminalFocusTargetKind = "sidebar" | "terminal" | "history" | "live-diff" | "setup"

export type TerminalFocusTargetKey = `${TerminalFocusTargetKind}:${string}`

export type TerminalFocusTargetRect = FocusTargetRect<TerminalFocusTargetKey>

export type TerminalFocusDirection = FocusDirection

export function terminalFocusTargetKey(
  kind: TerminalFocusTargetKind,
  sessionId: string,
): TerminalFocusTargetKey {
  return `${kind}:${sessionId}`
}

export const TERMINAL_SIDEBAR_FOCUS_TARGET = terminalFocusTargetKey("sidebar", "main")

export function parseTerminalFocusTargetKey(key: TerminalFocusTargetKey) {
  const separator = key.indexOf(":")
  return {
    kind: key.slice(0, separator) as TerminalFocusTargetKind,
    sessionId: key.slice(separator + 1),
  }
}

export function terminalFocusTargetRenderableId(key: TerminalFocusTargetKey) {
  const { kind, sessionId } = parseTerminalFocusTargetKey(key)
  if (kind === "sidebar") return "terminal-sidebar"
  return `terminal-focus-target-${kind}-${sessionId}`
}

export function nextTerminalFocusTarget(
  targets: readonly TerminalFocusTargetRect[],
  currentKey: TerminalFocusTargetKey,
  direction: TerminalFocusDirection,
) {
  return nextFocusTarget(targets, currentKey, direction)
}
