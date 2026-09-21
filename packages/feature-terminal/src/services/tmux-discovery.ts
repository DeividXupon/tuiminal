import { parseTmuxPanes, TMUX_PANE_FORMAT, TUIMINAL_TMUX_SESSION, tmuxPaneKey } from "../model/tmux"
import { hasTmux, runTmux } from "./tmux-command"
import { TUIMINAL_TMUX_SERVER_ARGS } from "./tmux-owned-session"

export async function discoverTmuxPanes(signal: AbortSignal) {
  if (!(await hasTmux(signal))) return { available: false, panes: [] }
  const inheritedSocket = process.env.TMUX?.split(",")[0]
  const servers = [
    { args: [] as string[], ownedByTuiminal: false },
    ...(inheritedSocket ? [{ args: ["-S", inheritedSocket], ownedByTuiminal: false }] : []),
    { args: TUIMINAL_TMUX_SERVER_ARGS, ownedByTuiminal: true },
  ]
  const results = await Promise.allSettled(
    servers.map((server) =>
      runTmux([...server.args, "list-panes", "-a", "-F", TMUX_PANE_FORMAT], signal),
    ),
  )
  signal.throwIfAborted()
  const panes = new Map<string, ReturnType<typeof parseTmuxPanes>[number]>()
  for (const [index, result] of results.entries()) {
    if (result.status !== "fulfilled") continue
    for (const pane of parseTmuxPanes(result.value)) {
      if (pane.sidebar || pane.startCommand?.includes("--internal-terminal-sidebar")) continue
      // Exclude only Tuiminal itself; sibling panes/windows can contain agents.
      if (pane.socket === inheritedSocket && pane.paneId === process.env.TMUX_PANE) continue
      const key = tmuxPaneKey(pane)
      const ownedByTuiminal = servers[index]!.ownedByTuiminal
      const existing = panes.get(key)
      if (
        !existing ||
        (ownedByTuiminal &&
          pane.name === TUIMINAL_TMUX_SESSION &&
          existing.name !== TUIMINAL_TMUX_SESSION)
      )
        panes.set(key, { ...pane, ownedByTuiminal })
    }
  }
  return { available: true, panes: [...panes.values()] }
}
