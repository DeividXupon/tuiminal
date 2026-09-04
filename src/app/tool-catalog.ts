export type ToolId = "database" | "git" | "runner" | "http" | "terminal"

export const DEFAULT_TOOL: ToolId = "runner"

export const TOOL_SHORTCUTS = [
  { tab: "database", symbol: "@", key: "2" },
  { tab: "git", symbol: "#", key: "3" },
  { tab: "runner", symbol: "$", key: "4" },
  { tab: "http", symbol: "%", key: "5" },
  { tab: "terminal", symbol: "^", key: "6" },
] as const satisfies ReadonlyArray<{ tab: ToolId; symbol: string; key: string }>

export const TOOL_LABELS: Record<ToolId, string> = {
  database: "BANCO",
  git: "GIT",
  runner: "RUNNER",
  http: "HTTP",
  terminal: "FREE TERMINAL",
}

export const TOOL_COMMANDS = {
  banco: "database",
  database: "database",
  db: "database",
  git: "git",
  runner: "runner",
  run: "runner",
  http: "http",
  terminal: "terminal",
  term: "terminal",
  tty: "terminal",
} as const satisfies Record<string, ToolId>

export function isToolId(value: string | undefined): value is ToolId {
  return TOOL_SHORTCUTS.some((shortcut) => shortcut.tab === value)
}

export function resolveToolLaunch(initialTab: string | undefined, onlyTab: string | undefined) {
  const isolatedTool = isToolId(onlyTab) ? onlyTab : null
  return {
    onlyTab: isolatedTool,
    initialTab: isolatedTool ?? (isToolId(initialTab) ? initialTab : DEFAULT_TOOL),
  }
}
