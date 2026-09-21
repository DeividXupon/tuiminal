import { getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import { descendantProcesses, identifyAgent } from "../model/agent-detection"
import { readTerminalProcesses } from "./agent-processes"
import { discoverTmuxPanes } from "./tmux-discovery"

/** Classify live panes from processes, never pane names or old screen contents. */
export async function discoverTmuxWorkspace(signal: AbortSignal) {
  const result = await discoverTmuxPanes(signal)
  if (!result.panes.length) return { available: result.available, panes: [] }
  const processes = await readTerminalProcesses(signal).catch(() => {
    signal.throwIfAborted()
    return []
  })
  signal.throwIfAborted()
  const configured = getUiSettings().terminalAgentCommands
  const panes = result.panes.flatMap((pane) => {
    if (!pane.panePid) return [{ pane, agent: null }]
    // Also prevent recursion when TMUX_PANE was not inherited by the launcher.
    if (descendantProcesses(pane.panePid, processes).some((entry) => entry.pid === process.pid))
      return []
    const agent = identifyAgent(pane.panePid, processes, configured)
    return [{ pane, agent }]
  })
  return { available: result.available, panes }
}

/** Backward-compatible filtered view used by agent-specific consumers. */
export async function discoverTmuxAgents(signal: AbortSignal) {
  const result = await discoverTmuxWorkspace(signal)
  return {
    available: result.available,
    agents: result.panes.flatMap(({ pane, agent }) => (agent ? [{ pane, agent }] : [])),
  }
}
