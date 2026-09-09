import type { NarrowGitPane } from "./view"

export function compactGitActionFooter(previewWidth: number) {
  return previewWidth < 58
}

export function gitActionLabel(compact: boolean, label: string) {
  return compact ? (label.match(/^\[[^\]]+\]/)?.[0] ?? label) : label
}

export function gitPaneFocusTarget(
  keyName: string,
  fileTreeFocused: boolean,
  previewFocused: boolean,
): NarrowGitPane | null {
  if (keyName === "tab") return fileTreeFocused ? "preview" : "files"
  if (fileTreeFocused && (keyName === "l" || keyName === "right")) return "preview"
  if (previewFocused && (keyName === "h" || keyName === "left")) return "files"
  return null
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

export function gitBaseShortcutHint(width: number, historyView: boolean) {
  if (historyView) {
    return width < 86
      ? "[Tab/H/L] Painel  [J/K/↑/↓] Navegar  [↵] Abrir  [D] Diff"
      : "[Tab/H/L/←/→] Árvore/histórico  [J/K/↑/↓] Navegar  [↵] Abrir  [D] Diff  [R] Atualizar"
  }
  return width < 86
    ? "[Tab/H/L] Painel  [V] Visual  [O] Log  [G] Árvore"
    : "[Tab/H/L/←/→] Árvore/diff  [V] Visualização  [O] Log  [G] Árvore Git  [R] Atualizar"
}

export function gitFileTreeIsActive(active: boolean, narrow: boolean, pane: NarrowGitPane) {
  return active && (!narrow || pane === "files")
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
