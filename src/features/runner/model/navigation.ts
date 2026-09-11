export type RunnerFocusPane = "commands" | "log" | "history"

export const RUNNER_HISTORY_VISIBLE_ITEMS = 8

export function runnerProjectPickerShortcut(key: {
  name: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  super?: boolean
}) {
  if (key.ctrl || key.shift || key.meta || key.super) return false
  return key.name.toLowerCase() === "n"
}

type RunnerDirectionKey = "left" | "right" | "up" | "down" | "h" | "j" | "k" | "l"

type RunnerFocusContext = {
  historyIndex?: number
  historyAvailable?: boolean
  logAtBottom?: boolean
}

type RunnerProjectCloseResult = {
  openedProjects: string[]
  activeProject: string | null
  closed: boolean
}

export function runnerLogIsAtBottom(
  scrollTop: number,
  scrollHeight: number,
  viewportHeight: number,
) {
  const maximumScrollTop = Math.max(0, scrollHeight - viewportHeight)
  return scrollTop >= maximumScrollTop - 1
}

export function runnerHistoryPanelHeight(executionCount: number, shortRunner: boolean) {
  if (shortRunner) return 0
  return Math.min(RUNNER_HISTORY_VISIBLE_ITEMS + 2, Math.max(3, executionCount + 2))
}

export function runnerProjectCloseResult(
  openedProjects: string[],
  closingProject: string,
  activeProject: string,
): RunnerProjectCloseResult {
  const closingIndex = openedProjects.indexOf(closingProject)
  if (closingIndex < 0) {
    return { openedProjects, activeProject, closed: false }
  }
  const remainingProjects = openedProjects.filter((project) => project !== closingProject)
  if (closingProject !== activeProject) {
    return {
      openedProjects: remainingProjects,
      activeProject,
      closed: true,
    }
  }
  return {
    openedProjects: remainingProjects,
    activeProject: remainingProjects[Math.min(closingIndex, remainingProjects.length - 1)] ?? null,
    closed: true,
  }
}

export function runnerFocusDestination(
  pane: RunnerFocusPane,
  key: string,
  context: RunnerFocusContext = {},
): RunnerFocusPane | null {
  const direction = key as RunnerDirectionKey
  if (pane === "commands" && (direction === "right" || direction === "l")) {
    return "log"
  }
  if ((pane === "log" || pane === "history") && (direction === "left" || direction === "h")) {
    return "commands"
  }
  if (
    pane === "history" &&
    (context.historyIndex ?? 0) === 0 &&
    (direction === "up" || direction === "k")
  ) {
    return "log"
  }
  if (
    pane === "log" &&
    context.historyAvailable &&
    context.logAtBottom &&
    (direction === "down" || direction === "j")
  ) {
    return "history"
  }
  return null
}
