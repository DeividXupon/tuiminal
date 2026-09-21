import { basename } from "node:path"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TerminalSession } from "../model/sessions"

export type TerminalPresentationStatus = "starting" | "running" | "exited" | "failed"

export function terminalStatusMarker(status: TerminalPresentationStatus, busy = false) {
  switch (status) {
    case "starting":
      return "◐"
    case "running":
      return busy ? "●" : "○"
    case "exited":
      return "■"
    case "failed":
      return "×"
  }
}

export function terminalStatusColor(session: {
  status: TerminalPresentationStatus
  busy?: boolean
}) {
  switch (session.status) {
    case "starting":
      return COLORS.warning
    case "running":
      return session.busy ? COLORS.terminal : COLORS.muted
    case "exited":
      return COLORS.muted
    case "failed":
      return COLORS.danger
  }
}

export function terminalStatusLabel(status: TerminalPresentationStatus, busy = false) {
  switch (status) {
    case "starting":
      return "Iniciando"
    case "running":
      return busy ? "Executando" : "Ocioso"
    case "exited":
      return "Encerrado"
    case "failed":
      return "Falhou"
  }
}

export function terminalSessionDetail(session: TerminalSession) {
  const backend = session.backend ?? (session.tmux ? "tmux" : "native")
  if (session.external) {
    if (!session.workingDirectory) return session.external.terminalId
    const directory = basename(session.workingDirectory) || session.workingDirectory
    return `${directory} · ${session.external.terminalId}`
  }
  if ((session.status === "exited" || session.status === "failed") && session.exitCode !== null) {
    return `exit ${session.exitCode} · ${backend}`
  }
  if (session.tmux) {
    const directory = session.workingDirectory
      ? basename(session.workingDirectory) || session.workingDirectory
      : session.tmux.name
    return `${directory} · ${backend}`
  }
  if (session.kind === "custom") return `${session.displayCommand} · ${backend}`
  const directory = session.workingDirectory
    ? basename(session.workingDirectory) || session.workingDirectory
    : session.displayCommand
  return `${directory} · ${backend}`
}
