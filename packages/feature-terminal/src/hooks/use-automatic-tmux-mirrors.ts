import { useEffect, useRef, type RefObject } from "react"
import { DEFAULT_FOLDER, MAX_SESSIONS, type TerminalSession } from "../model/sessions"
import { TUIMINAL_TMUX_FOLDER, tmuxPaneKey, type TmuxPaneInfo } from "../model/tmux"
import { discoverTmuxWorkspace } from "../services/tmux-agents"
import { createTmuxMirrorCommand } from "../services/tmux-mirror-command"
import type { useTerminalSessions } from "./use-terminal-sessions"

function shouldMirrorPane(
  pane: TmuxPaneInfo,
  sessions: readonly TerminalSession[],
  dismissed: ReadonlySet<string>,
  externalDiscovery: boolean,
  restoreOwned: boolean,
) {
  if (pane.ownedByTuiminal ? !restoreOwned : !externalDiscovery) return false
  const key = tmuxPaneKey(pane)
  if (dismissed.has(key)) return false
  return !sessions.some((session) => session.tmux && tmuxPaneKey(session.tmux) === key)
}

function mirrorDiscoveredPanes(
  panes: Awaited<ReturnType<typeof discoverTmuxWorkspace>>["panes"],
  options: {
    sessions: RefObject<TerminalSession[]>
    dismissed: RefObject<Set<string>>
    launch: ReturnType<typeof useTerminalSessions>["launchCommand"]
    folderForPane: ((pane: TmuxPaneInfo) => string) | undefined
    sequence: RefObject<number>
    externalDiscovery: boolean
    restoreOwned: boolean
  },
) {
  for (const { pane, agent } of panes) {
    if (options.sessions.current.length >= MAX_SESSIONS) return
    if (
      !shouldMirrorPane(
        pane,
        options.sessions.current,
        options.dismissed.current,
        options.externalDiscovery,
        options.restoreOwned,
      )
    )
      continue
    options.sequence.current += 1
    options.launch(createTmuxMirrorCommand(pane, agent?.label, true), {
      sectionId: `auto-tmux-${options.sequence.current}`,
      folderId:
        options.folderForPane?.(pane) ??
        (pane.ownedByTuiminal ? DEFAULT_FOLDER : TUIMINAL_TMUX_FOLDER),
      row: 0,
      column: 0,
    })
  }
}

export function useAutomaticTmuxMirrors(
  sessions: RefObject<TerminalSession[]>,
  dismissed: RefObject<Set<string>>,
  launch: ReturnType<typeof useTerminalSessions>["launchCommand"],
  folderForPane?: (pane: TmuxPaneInfo) => string,
) {
  const sequence = useRef(0)
  useEffect(() => {
    const externalDiscovery = process.env.TUIMINAL_TERMINAL_AUTO_MIRROR !== "0"
    const restoreOwned = process.env.TUIMINAL_TERMINAL_RESTORE !== "0"
    if (!externalDiscovery && !restoreOwned) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const scan = async () => {
      let delay = 2000
      try {
        const { available, panes } = await discoverTmuxWorkspace(controller.signal)
        if (controller.signal.aborted) return
        if (!available) delay = 30_000
        mirrorDiscoveredPanes(panes, {
          sessions,
          dismissed,
          launch,
          folderForPane,
          sequence,
          externalDiscovery,
          restoreOwned,
        })
      } catch {
        // Missing sockets or process permissions must not disrupt native terminals.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void scan(), delay)
      }
    }
    void scan()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [sessions, dismissed, launch, folderForPane])
}
