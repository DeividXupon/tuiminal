import { useEffect, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { EXTERNAL_FOLDER, type TerminalSession } from "../model/sessions"
import {
  discoverExternalTerminals,
  type ExternalTerminalInfo,
} from "../services/external-terminal-discovery"

function externalSession(terminal: ExternalTerminalInfo): TerminalSession {
  const stableTerminalId = terminal.terminalId.replace(/[^a-z0-9]+/gi, "-")
  const id = `external-${stableTerminalId}-${terminal.pid}`
  return {
    id,
    sectionId: id,
    folderId: EXTERNAL_FOLDER,
    row: 0,
    column: 0,
    kind: terminal.busy ? "custom" : "shell",
    label: terminal.title,
    shortLabel: terminal.terminalId,
    displayCommand: terminal.title,
    command: [],
    accent: COLORS.terminal,
    ...(terminal.workingDirectory ? { workingDirectory: terminal.workingDirectory } : {}),
    external: { terminalId: terminal.terminalId },
    title: terminal.title,
    titleMode: "automatic",
    status: "running",
    busy: terminal.busy,
    pid: terminal.pid,
    exitCode: null,
    startedAt: 0,
    agent: terminal.agent
      ? {
          ...terminal.agent,
          state: "unknown",
          activity: null,
          taskTitle: null,
        }
      : null,
    backend: "external",
  }
}

function fingerprint(sessions: readonly TerminalSession[]) {
  return sessions
    .map((session) =>
      [
        session.id,
        session.title,
        session.busy ? 1 : 0,
        session.workingDirectory ?? "",
        session.external?.terminalId ?? "",
      ].join("\0"),
    )
    .join("\n")
}

export function useExternalTerminals() {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  useEffect(() => {
    if (process.env.TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY === "0") return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let previous = ""
    const scan = async () => {
      let delay = 2000
      try {
        const result = await discoverExternalTerminals(controller.signal)
        if (controller.signal.aborted) return
        if (!result.available) delay = 30_000
        const next = result.terminals.map(externalSession)
        const key = fingerprint(next)
        if (key !== previous) {
          previous = key
          setSessions(next)
        }
      } catch {
        // Restricted process/TTY inspection keeps the previous read-only rows.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void scan(), delay)
      }
    }
    void scan()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [])
  return sessions
}
