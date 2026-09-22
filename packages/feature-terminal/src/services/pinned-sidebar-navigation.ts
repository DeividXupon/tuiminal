import type { PinnedTerminalSelection } from "../model/pinned-sidebar"
import { runAttachedTmux } from "./tmux-command"

export async function routePinnedTerminalToTuiminal(
  selection: PinnedTerminalSelection,
  deliver: (selection: PinnedTerminalSelection) => Promise<boolean>,
  openHost: () => Promise<void>,
) {
  if (!(await deliver(selection))) return false
  await openHost()
  return true
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
