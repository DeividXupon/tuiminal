export type SqlWorkspaceMode = "split" | "editor" | "result"

export const SQL_EDITOR_RATIO_STEPS = [30, 40, 50, 60, 70] as const

export function resizeSqlEditorRatio(current: number, direction: -1 | 1) {
  const closestIndex = SQL_EDITOR_RATIO_STEPS.reduce(
    (best, value, index) =>
      Math.abs(value - current) < Math.abs((SQL_EDITOR_RATIO_STEPS[best] ?? 50) - current)
        ? index
        : best,
    0,
  )
  const nextIndex = Math.max(
    0,
    Math.min(SQL_EDITOR_RATIO_STEPS.length - 1, closestIndex + direction),
  )
  return SQL_EDITOR_RATIO_STEPS[nextIndex] ?? 50
}

export function sqlSplitEditorHeight(terminalHeight: number, ratio: number) {
  const availableHeight = Math.max(12, terminalHeight - 10)
  const normalizedRatio = Math.max(30, Math.min(70, ratio))
  return Math.max(6, Math.floor((availableHeight * normalizedRatio) / 100))
}

export function toggleSqlWorkspaceMode(
  current: SqlWorkspaceMode,
  focusedPane: "editor" | "result",
): SqlWorkspaceMode {
  if (current !== "split") return "split"
  return focusedPane
}

export function nextSqlTabIndex(currentIndex: number, tabCount: number, direction: -1 | 1) {
  if (tabCount <= 0) return -1
  return (Math.max(0, currentIndex) + direction + tabCount) % tabCount
}
