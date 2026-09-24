export type TerminalFocusTargetKind = "sidebar" | "terminal" | "history" | "live-diff"

export type TerminalFocusTargetKey = `${TerminalFocusTargetKind}:${string}`

export type TerminalFocusTargetRect = {
  key: TerminalFocusTargetKey
  left: number
  top: number
  width: number
  height: number
}

export type TerminalFocusDirection = "up" | "down" | "left" | "right"

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

function center(rect: TerminalFocusTargetRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function intervalGap(start: number, size: number, otherStart: number, otherSize: number) {
  const end = start + size
  const otherEnd = otherStart + otherSize
  if (end < otherStart) return otherStart - end
  if (otherEnd < start) return start - otherEnd
  return 0
}

function horizontalScore(
  current: TerminalFocusTargetRect,
  candidate: TerminalFocusTargetRect,
  direction: "left" | "right",
) {
  const currentCenter = center(current)
  const candidateCenter = center(candidate)
  const primaryDelta =
    direction === "left" ? currentCenter.x - candidateCenter.x : candidateCenter.x - currentCenter.x
  if (primaryDelta <= 0) return null
  const primaryGap = intervalGap(current.left, current.width, candidate.left, candidate.width)
  const crossGap = intervalGap(current.top, current.height, candidate.top, candidate.height)
  return (
    primaryGap * 10_000 +
    crossGap * 1_000 +
    primaryDelta +
    Math.abs(candidateCenter.y - currentCenter.y)
  )
}

function verticalScore(
  current: TerminalFocusTargetRect,
  candidate: TerminalFocusTargetRect,
  direction: "up" | "down",
) {
  const currentCenter = center(current)
  const candidateCenter = center(candidate)
  const primaryDelta =
    direction === "up" ? currentCenter.y - candidateCenter.y : candidateCenter.y - currentCenter.y
  if (primaryDelta <= 0) return null
  const primaryGap = intervalGap(current.top, current.height, candidate.top, candidate.height)
  const crossGap = intervalGap(current.left, current.width, candidate.left, candidate.width)
  return (
    primaryGap * 10_000 +
    crossGap * 1_000 +
    primaryDelta +
    Math.abs(candidateCenter.x - currentCenter.x)
  )
}

export function nextTerminalFocusTarget(
  targets: readonly TerminalFocusTargetRect[],
  currentKey: TerminalFocusTargetKey,
  direction: TerminalFocusDirection,
) {
  const current = targets.find((target) => target.key === currentKey)
  if (!current) return currentKey
  let best: { key: TerminalFocusTargetKey; score: number } | null = null

  for (const candidate of targets) {
    if (candidate.key === currentKey) continue
    const score =
      direction === "left" || direction === "right"
        ? horizontalScore(current, candidate, direction)
        : verticalScore(current, candidate, direction)
    if (score === null) continue
    if (!best || score < best.score) best = { key: candidate.key, score }
  }

  return best?.key ?? currentKey
}
