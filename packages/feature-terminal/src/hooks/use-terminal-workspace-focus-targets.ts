import { useMemo } from "react"
import { terminalWorkspaceFocusTargets } from "../rendering/terminal-workspace-presentation"

type FocusTargetOptions = Parameters<typeof terminalWorkspaceFocusTargets>[0]

export function useTerminalWorkspaceFocusTargets(options: FocusTargetOptions) {
  const {
    sessions,
    activeSession,
    liveDiffTargets,
    messageHistoryTargets,
    messages,
    availableWidth,
    availableHeight,
    sidebarWidth,
  } = options
  return useMemo(
    () =>
      terminalWorkspaceFocusTargets({
        sessions,
        activeSession,
        liveDiffTargets,
        messageHistoryTargets,
        messages,
        availableWidth,
        availableHeight,
        sidebarWidth,
      }),
    [
      activeSession,
      availableHeight,
      availableWidth,
      liveDiffTargets,
      messageHistoryTargets,
      messages,
      sessions,
      sidebarWidth,
    ],
  )
}
