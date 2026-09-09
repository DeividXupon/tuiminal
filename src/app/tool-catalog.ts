export type ToolId = "database" | "git" | "runner" | "http" | "terminal"

export const DEFAULT_TOOL: ToolId = "runner"

export const TOOL_SHORTCUTS = [
  { tab: "database", key: "1" },
  { tab: "git", key: "2" },
  { tab: "runner", key: "3" },
  { tab: "http", key: "4" },
  { tab: "terminal", key: "5" },
] as const satisfies ReadonlyArray<{ tab: ToolId; key: string }>

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
