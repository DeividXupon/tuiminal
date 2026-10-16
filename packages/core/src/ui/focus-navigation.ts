export type FocusDirection = "up" | "down" | "left" | "right"

export type FocusTargetRect<Key extends string = string> = {
  key: Key
  left: number
  top: number
  width: number
  height: number
}

export function focusDirectionForKey(name: string): FocusDirection | null {
  if (name === "h" || name === "left") return "left"
  if (name === "j" || name === "down") return "down"
  if (name === "k" || name === "up") return "up"
  if (name === "l" || name === "right") return "right"
  return null
}

function center(rect: FocusTargetRect) {
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
  current: FocusTargetRect,
  candidate: FocusTargetRect,
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
  current: FocusTargetRect,
  candidate: FocusTargetRect,
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

/** Picks the nearest target in a screen direction; keeps the current target at an edge. */
export function nextFocusTarget<Key extends string>(
  targets: readonly FocusTargetRect<Key>[],
  currentKey: Key,
  direction: FocusDirection,
): Key {
  const current = targets.find((target) => target.key === currentKey)
  if (!current) return currentKey
  let best: { key: Key; score: number } | null = null

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
