import type { TmuxPaneTarget } from "../model/tmux"
import { runTmux } from "./tmux-command"

export async function readTmuxPaneWorkingDirectory(target: TmuxPaneTarget, signal?: AbortSignal) {
  const output = await runTmux(
    ["-S", target.socket, "display-message", "-p", "-t", target.paneId, "#{pane_current_path}"],
    signal,
  )
  const directory = output.trimEnd()
  return directory.startsWith("/") ? directory : null
}
