import type { TmuxPaneInfo } from "../model/tmux"
import { runAttachedTmux } from "./tmux-command"

export async function selectPinnedTmuxTarget(sourceSocket: string, target: TmuxPaneInfo) {
  if (sourceSocket !== target.socket) return false
  try {
    await runAttachedTmux([
      "-S",
      sourceSocket,
      "switch-client",
      "-t",
      target.sessionId,
      ";",
      "select-window",
      "-t",
      target.windowId,
      ";",
      "select-pane",
      "-t",
      target.paneId,
    ])
    return true
  } catch {
    return false
  }
}

export async function selectPinnedTmuxHost(sourceSocket: string, hostPane: string) {
  try {
    const [sessionId, windowId] = (
      await runAttachedTmux([
        "-S",
        sourceSocket,
        "display-message",
        "-p",
        "-t",
        hostPane,
        "#{session_id}\t#{window_id}",
      ])
    )
      .trim()
      .split("\t")
    if (!sessionId || !windowId || !/^\$\d+$/.test(sessionId) || !/^@\d+$/.test(windowId)) return
    await runAttachedTmux([
      "-S",
      sourceSocket,
      "switch-client",
      "-t",
      sessionId,
      ";",
      "select-window",
      "-t",
      windowId,
      ";",
      "select-pane",
      "-t",
      hostPane,
    ])
  } catch {
    // The Tuiminal pane may have closed while the replica was still alive.
  }
}
