import type { IntegratedAgentLaunch } from "../model/sessions"
import { startClaudeHooksTerminal } from "./claude-terminal"
import { startCodexAppServerTerminal } from "./codex-app-server"
import { startOpenCodeServerTerminal } from "./opencode-server"

export type IntegratedTerminalOptions = Parameters<typeof startCodexAppServerTerminal>[0] &
  Parameters<typeof startClaudeHooksTerminal>[0] &
  Parameters<typeof startOpenCodeServerTerminal>[0]

export type IntegratedTerminalEvents = {
  codex: Parameters<typeof startCodexAppServerTerminal>[1]
  claude: Parameters<typeof startClaudeHooksTerminal>[1]
  openCode: Parameters<typeof startOpenCodeServerTerminal>[1]
}

export function startIntegratedAgentTerminal(
  integration: IntegratedAgentLaunch,
  options: IntegratedTerminalOptions,
  events: IntegratedTerminalEvents,
  signal: AbortSignal,
) {
  if (integration.providerId === "codex")
    return startCodexAppServerTerminal(options, events.codex, signal)
  if (integration.providerId === "claude")
    return startClaudeHooksTerminal(options, events.claude, signal)
  return startOpenCodeServerTerminal(options, events.openCode, signal)
}
