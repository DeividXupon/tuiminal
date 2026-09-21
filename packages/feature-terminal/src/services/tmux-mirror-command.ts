import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { cleanTerminalName, type FreeTerminalCommand } from "../model/sessions"
import { tmuxPaneLabel, type TmuxPaneInfo } from "../model/tmux"

function restoredCommandKind(target: TmuxPaneInfo) {
  if (!target.ownedByTuiminal) return "custom" as const
  if (target.terminalKind) return target.terminalKind
  if (!target.startCommand) return "custom" as const
  return /(?:^|\s)["']?(?:-lc|\/c)["']?(?=\s|$)/i.test(target.startCommand)
    ? ("custom" as const)
    : ("shell" as const)
}

export function createTmuxMirrorCommand(
  target: TmuxPaneInfo,
  agentLabel?: string,
  autoMirror = agentLabel !== undefined,
): FreeTerminalCommand {
  const label = cleanTerminalName(`${agentLabel ?? "tmux"} · ${tmuxPaneLabel(target)}`)
  return {
    kind: restoredCommandKind(target),
    label,
    shortLabel: "tmux",
    displayCommand: label,
    command: [],
    accent: COLORS.terminal,
    workingDirectory: target.cwd,
    tmux: target,
    autoMirror,
  }
}
