import type { GitFocusPane, NarrowGitPane, ViewMode } from "./view"

export function gitPreviewChromeHeight(terminalExpanded: boolean) {
  return terminalExpanded ? 0 : 1
}

export function gitPreviewContentStyle(terminalExpanded: boolean) {
  return terminalExpanded
    ? ({ height: 0, flexGrow: 0, flexShrink: 0, overflow: "hidden" } as const)
    : ({ flexGrow: 1, flexShrink: 1 } as const)
}

export function showGitDiffToolbar(terminalExpanded: boolean, view: ViewMode) {
  return !terminalExpanded && view !== "log" && view !== "graph"
}

export function showGitActionStatus(
  terminalExpanded: boolean,
  busy: boolean,
  error: string | null,
  message: string | null,
) {
  return !terminalExpanded && Boolean(busy || error || message)
}

export function compactGitActionFooter(previewWidth: number) {
  return previewWidth < 82
}

export function gitActionLabel(compact: boolean, label: string) {
  return compact ? (label.match(/^\[[^\]]+\]/)?.[0] ?? label) : label
}

export function gitPaneFocusTarget(keyName: string, current: GitFocusPane): GitFocusPane | null {
  if (keyName === "tab") {
    if (current === "files") return "preview"
    return current === "preview" ? "terminal" : "files"
  }
  if (current === "files" && (keyName === "l" || keyName === "right")) return "preview"
  if (current !== "files" && (keyName === "h" || keyName === "left")) return "files"
  return null
}

export function gitDiffHorizontalScrollDelta(keyName: string, shift: boolean) {
  if (!shift) return 0
  if (keyName === "h" || keyName === "left") return -8
  if (keyName === "l" || keyName === "right") return 8
  return 0
}

export function isGitHistoryFocused(focusedId: string) {
  return (
    focusedId === "git-base-history" ||
    focusedId.startsWith("git-base-log-row-") ||
    focusedId.startsWith("git-base-graph-row-")
  )
}

export function gitHistoryNavigationDelta(keyName: string) {
  if (keyName === "down" || keyName === "j") return 1
  if (keyName === "up" || keyName === "k") return -1
  return 0
}

export function gitBaseShortcutHint(width: number, historyView: boolean, partialStage = false) {
  if (partialStage) {
    return width < 86
      ? "[S] Hunk/linha  [Tab/H/L] Painel  [J/K] Navegar  [Espaço] Mover  [Enter/Esc] Aplicar"
      : "[S] Alternar hunk/linha  [Tab/H/L/←/→] Painéis  [J/K/↑/↓] Navegar  [Espaço] Mover  [Enter/Esc] Aplicar stage"
  }
  if (historyView) {
    return width < 86
      ? "[Tab/H/L] Painel  [T] Terminal  [J/K/↑/↓] Navegar  [D] Diff"
      : "[Tab/H/L/←/→] Árvore/histórico/terminal  [T] Terminal  [J/K/↑/↓] Navegar  [↵] Abrir  [D] Diff  [R] Atualizar"
  }
  return width < 86
    ? "[Tab/H/L] Painel  [Shift+H/L] Lateral  [T] Terminal  [V] Visual"
    : "[Tab/H/L/←/→] Árvore/diff/terminal  [Shift+H/L/←/→] Lateral  [T] Terminal  [V] Visualização  [O] Log"
}

export function gitFileTreeIsActive(active: boolean, narrow: boolean, pane: NarrowGitPane) {
  return active && (!narrow || pane === "files")
}

export function gitFileTreeIsActiveOutsidePartialStage(
  active: boolean,
  partialStage: boolean,
  narrow: boolean,
  pane: NarrowGitPane,
) {
  return gitFileTreeIsActive(active, narrow, pane) && !partialStage
}

export function gitPartialStageHeaderMeta({
  active,
  cursor,
  targetCount,
  selectedCount,
  selectedLabel,
  fallback,
}: {
  active: boolean
  cursor: number
  targetCount: number
  selectedCount: number
  selectedLabel: string
  fallback: string
}) {
  return active
    ? `${cursor + 1}/${Math.max(1, targetCount)}  ${selectedCount} ${selectedLabel}`
    : fallback
}

export function gitPartialStagePreviewLoading(
  active: boolean,
  view: ViewMode,
  diffLoading: boolean,
  commitLoading: boolean,
) {
  return !active && view !== "graph" && view !== "log" && (diffLoading || commitLoading)
}

export function gitMiniGraphLayout({
  panelWidth,
  panelHeight,
  fallbackHeight,
  compact,
  focused,
  allowGraph,
}: {
  panelWidth: number
  panelHeight: number
  fallbackHeight: number
  compact: boolean
  focused: boolean
  allowGraph: boolean
}) {
  const filesContentWidth = Math.max(16, panelWidth - 2 - (compact ? (focused ? 1 : 0) : 2))
  const contentHeight = Math.max(4, (panelHeight || fallbackHeight) - (compact ? 0 : 2))
  const showMiniGraph = allowGraph && contentHeight >= 8
  const compactGraphHeight = showMiniGraph
    ? Math.max(5, Math.min(8, Math.floor(contentHeight * 0.4)))
    : 0
  const miniGraphWidth = Math.max(4, filesContentWidth - (compact && focused ? 1 : 0))
  return {
    filesContentWidth,
    showMiniGraph,
    compactGraphHeight,
    compactGraphRowLimit: Math.max(1, compactGraphHeight - 3),
    fileTreeHeight: Math.max(2, contentHeight - compactGraphHeight - 1),
    miniGraphWidth,
    miniGraphContentWidth: Math.max(4, miniGraphWidth - (compact ? 2 : 4)),
  }
}
