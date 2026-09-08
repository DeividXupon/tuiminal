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
