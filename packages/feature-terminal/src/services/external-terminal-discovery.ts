import { execFile } from "node:child_process"
import { readlink } from "node:fs/promises"
import { getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import type { ProcessIdentity } from "../model/agent-detection"
import type { AgentIdentity } from "../model/agent-state"
import { terminalProcessSnapshot } from "../model/process-title"
import { cleanTerminalName } from "../model/sessions"
import { readTerminalProcesses } from "./agent-processes"

export type TerminalProcessGroup = {
  pid: number
  parentPid: number
  processGroupId: number
  foregroundProcessGroupId: number
  terminalId: string
}

export type ExternalTerminalInfo = {
  terminalId: string
  pid: number
  title: string
  busy: boolean
  agent: AgentIdentity | null
  workingDirectory?: string
}

const unavailableTerminal = (value: string) => value === "?" || value === "??" || value === "-"
const tmuxProcess = (process: ProcessIdentity) =>
  /^(?:tmux)(?::|$)/i.test(process.executable) || /(?:^|\/)tmux(?:\s|$)/i.test(process.command)

export function parsePosixTerminalGroups(source: string): TerminalProcessGroup[] {
  return source.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s*$/.exec(line)
    if (!match || unavailableTerminal(match[5]!)) return []
    return [
      {
        pid: Number(match[1]),
        parentPid: Number(match[2]),
        processGroupId: Number(match[3]),
        foregroundProcessGroupId: Number(match[4]),
        terminalId: match[5]!,
      },
    ]
  })
}

function hasAncestor(
  pid: number,
  byPid: ReadonlyMap<number, ProcessIdentity>,
  predicate: (process: ProcessIdentity) => boolean,
) {
  const visited = new Set<number>()
  let current = byPid.get(pid)
  while (current && !visited.has(current.pid)) {
    visited.add(current.pid)
    if (predicate(current)) return true
    current = byPid.get(current.parentPid)
  }
  return false
}

/** Build one read-only row per foreign TTY, excluding Tuiminal and tmux-owned PTYs. */
export function externalTerminalsFromProcesses(
  groups: readonly TerminalProcessGroup[],
  processes: readonly ProcessIdentity[],
  currentPid = process.pid,
  configuredAgents: readonly string[] = [],
) {
  const byPid = new Map(processes.map((entry) => [entry.pid, entry]))
  const currentTerminal = groups.find((entry) => entry.pid === currentPid)?.terminalId
  const grouped = new Map<string, TerminalProcessGroup[]>()
  for (const entry of groups) {
    if (entry.terminalId === currentTerminal || !byPid.has(entry.pid)) continue
    const siblings = grouped.get(entry.terminalId) ?? []
    siblings.push(entry)
    grouped.set(entry.terminalId, siblings)
  }

  return [...grouped].flatMap(([terminalId, entries]) => {
    const terminalPids = new Set(entries.map((entry) => entry.pid))
    const roots = entries
      .filter((entry) => !terminalPids.has(entry.parentPid))
      .sort((first, second) => first.pid - second.pid)
    const rootEntry = roots[0] ?? [...entries].sort((first, second) => first.pid - second.pid)[0]
    if (!rootEntry) return []
    if (
      hasAncestor(rootEntry.pid, byPid, (entry) => entry.pid === currentPid) ||
      hasAncestor(rootEntry.pid, byPid, tmuxProcess)
    )
      return []

    const terminalProcesses = entries.flatMap((entry) => {
      const identity = byPid.get(entry.pid)
      return identity
        ? [
            {
              ...identity,
              foreground:
                entry.foregroundProcessGroupId > 0 &&
                entry.processGroupId === entry.foregroundProcessGroupId,
            },
          ]
        : []
    })
    const root = byPid.get(rootEntry.pid)
    if (!root) return []
    const presentation = terminalProcessSnapshot(root.pid, terminalProcesses, configuredAgents)
    const fallback = cleanTerminalName(
      root.executable
        .replace(/\\/g, "/")
        .split("/")
        .at(-1)!
        .replace(/^-+|\.exe$/gi, ""),
    )
    const title = presentation.title ?? fallback
    return title
      ? [
          {
            terminalId,
            pid: root.pid,
            title,
            busy: presentation.busy,
            agent: presentation.agent,
          },
        ]
      : []
  })
}

function readTerminalGroups(signal: AbortSignal) {
  return new Promise<TerminalProcessGroup[]>((resolve, reject) => {
    execFile(
      "ps",
      ["-axww", "-o", "pid=,ppid=,pgid=,tpgid=,tty="],
      {
        encoding: "utf8",
        timeout: 2500,
        maxBuffer: 2 * 1024 * 1024,
        signal,
      },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(parsePosixTerminalGroups(stdout))
      },
    )
  })
}

async function processWorkingDirectory(pid: number) {
  if (process.platform !== "linux") return undefined
  try {
    const directory = await readlink(`/proc/${pid}/cwd`)
    return directory.startsWith("/") ? directory : undefined
  } catch {
    return undefined
  }
}

export async function discoverExternalTerminals(signal: AbortSignal) {
  if (process.platform === "win32") return { available: false, terminals: [] }
  const [groups, processes] = await Promise.all([
    readTerminalGroups(signal),
    readTerminalProcesses(signal),
  ])
  signal.throwIfAborted()
  const candidates = externalTerminalsFromProcesses(
    groups,
    processes,
    process.pid,
    getUiSettings().terminalAgentCommands,
  )
  const directories = await Promise.all(
    candidates.map((terminal) => processWorkingDirectory(terminal.pid)),
  )
  signal.throwIfAborted()
  return {
    available: true,
    terminals: candidates.map((terminal, index) => ({
      ...terminal,
      ...(directories[index] ? { workingDirectory: directories[index] } : {}),
    })),
  }
}
