import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { cleanTerminalName, type FreeTerminalCommand } from "../model/sessions"
import { tmuxPaneLabel, type TmuxPaneInfo } from "../model/tmux"

export function createTmuxMirrorCommand(
  target: TmuxPaneInfo,
  agentLabel?: string,
  autoMirror = agentLabel !== undefined,
): FreeTerminalCommand {
  const label = cleanTerminalName(`${agentLabel ?? "tmux"} · ${tmuxPaneLabel(target)}`)
  return {
    kind: "custom",
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
