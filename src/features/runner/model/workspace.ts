import type { RunnerCommand } from "./types"

export const RUNNER_CATEGORY_ICONS: Record<RunnerCommand["category"], string> = {
  package: "◇",
  composer: "◒",
  php: "◆",
  python: "◈",
  go: "◎",
  rust: "⬢",
  ruby: "◇",
  java: "◉",
  dotnet: "◫",
  deno: "◐",
  task: "▣",
  make: "◆",
  just: "◈",
  docker: "⬡",
  custom: "❯",
}

export const RUNNER_DIRECTORY_PICKER_OPTION = "__runner:directory-picker__"
export const RUNNER_USE_DIRECTORY_OPTION = "__runner:use-directory__"
export const RUNNER_PROJECT_TAB_SHORTCUTS = ["1", "2", "3", "4"] as const

export type RunnerWorkspaceProps = {
  active: boolean
  onOpenHttp?: (url: string) => void
}

export type RunnerViewMode = "single" | "multi"
export type RunnerListMode = "commands" | "active"
export type ProjectPickerMode = "closed" | "projects" | "directories"

export function runnerLogFilterLabel({
  viewMode,
  narrow,
  compact,
  filter,
}: {
  viewMode: RunnerViewMode
  narrow: boolean
  compact: boolean
  filter: string
}) {
  const shortcut = viewMode === "multi" ? "Shift+F" : "F"
  if (narrow) return `[${shortcut}]`
  if (compact) return `[${shortcut}] Filtro`
  return `[${shortcut}] Filtrar${filter ? `: ${filter}` : ""}`
}
