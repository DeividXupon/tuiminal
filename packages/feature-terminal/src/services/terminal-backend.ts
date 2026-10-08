import type { TermAgentsCommand } from "../model/sessions"
import { hasTmux } from "./tmux-command"
import { startTmuxTerminal } from "./tmux-terminal"
import { trackTerminalLaunch } from "./terminal-resources"
import { startTermAgentsProcess, type TermAgentsProcessHandle } from "./terminal"
import { TerminalRetirementError } from "./terminal-lifecycle"

export function startWorkspaceTerminal(
  command: TermAgentsCommand,
  options: Parameters<typeof startTermAgentsProcess>[1],
  signal: AbortSignal,
): Promise<TermAgentsProcessHandle> {
  const terminalKind = command.kind
  return trackTerminalLaunch(
    (async () => {
      const preference = process.env.TUIMINAL_TERMINAL_BACKEND ?? "auto"
      const useTmux = Boolean(command.tmux) || (preference !== "native" && (await hasTmux(signal)))
      signal.throwIfAborted()
      if (!useTmux && preference === "tmux")
        throw new Error(
          "tmux 3.2 ou superior não está disponível. Use o modo automático ou nativo.",
        )
      const handle = useTmux
        ? await startTmuxTerminal(command.command, options, command.tmux, terminalKind)
        : startTermAgentsProcess(command.command, options)
      if (signal.aborted) {
        try {
          await (handle.close?.() ?? handle.stop())
        } catch (error) {
          throw new TerminalRetirementError(error, handle.close ?? handle.stop)
        }
        signal.throwIfAborted()
      }
      return handle
    })(),
  )
}
