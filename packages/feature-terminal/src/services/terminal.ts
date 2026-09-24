import { resolve } from "node:path"
import {
  forceKillOwnedProcessTree,
  OWNED_PROCESS_STOP_DEADLINE_MS,
  OWNED_PROCESS_STOP_GRACE_MS,
  processStopDeadlineError,
  signalOwnedProcessGroup,
} from "@xupon/tuiminal-core/process/owned-process"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"

import type { FreeTerminalCommand } from "../model/sessions"
import type { TmuxPaneTarget } from "../model/tmux"
import { registerTerminalResource } from "./terminal-resources"
export { stopAllFreeTerminalProcesses } from "./terminal-resources"
export type { FreeTerminalCommand, FreeTerminalKind } from "../model/sessions"

export type FreeTerminalExit = {
  code: number | null
  signal: string | null
  stopped: boolean
}

export type FreeTerminalProcessHandle = {
  pid: number
  backend?: "native" | "tmux"
  tmux?: TmuxPaneTarget
  /** The tmux client is not the parent of the shell running in its server. */
  readAgentPid?: (signal?: AbortSignal) => Promise<number | null>
  write: (data: string | Uint8Array) => void
  resize: (columns: number, rows: number) => void
  stop: () => Promise<void>
  /** Explicitly close the backing persistent session; stop only detaches clients. */
  close?: () => Promise<void>
}

type BunTerminalLike = {
  write(data: string | Uint8Array): void
  resize(columns: number, rows: number): void
  close(): void
}

type BunSubprocessLike = {
  pid: number
  terminal?: BunTerminalLike
  exited: Promise<number>
  exitCode: number | null
  signalCode: string | null
  kill(signal?: string | number): void
}

type BunRuntimeLike = {
  spawn(
    command: string[],
    options: {
      cwd: string
      env: Record<string, string>
      terminal: {
        cols: number
        rows: number
        name: string
        data: (terminal: BunTerminalLike, data: Uint8Array) => void
        exit: (terminal: BunTerminalLike, code: number, signal: string | null) => void
      }
    },
  ): BunSubprocessLike
}

const bunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun

export const FREE_TERMINAL_WORKING_DIRECTORY = resolve(
  process.env.TUIMINAL_WORKDIR ?? process.cwd(),
)

export function createShellTerminalCommand(): FreeTerminalCommand {
  const shell =
    process.platform === "win32"
      ? process.env.COMSPEC?.trim() || "cmd.exe"
      : process.env.SHELL?.trim() || "/bin/sh"
  const args = process.platform === "win32" ? ["/d"] : ["-l"]
  return {
    kind: "shell",
    label: "Terminal",
    shortLabel: "TTY",
    displayCommand: [shell, ...args].join(" "),
    command: [shell, ...args],
    accent: COLORS.terminal,
    workingDirectory: FREE_TERMINAL_WORKING_DIRECTORY,
  }
}

export function createFreeTerminalCommand(value: string): FreeTerminalCommand {
  const command = value.trim()
  const shell = createShellTerminalCommand().command[0]!
  const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command]
  const firstWord = command.split(/\s+/)[0] || "CLI"
  const label = firstWord.split("/").at(-1) || "CLI"

  return {
    kind: "custom",
    label,
    shortLabel: label.slice(0, 3).toUpperCase(),
    displayCommand: command,
    command: [shell, ...args],
    accent: COLORS.warning,
    workingDirectory: FREE_TERMINAL_WORKING_DIRECTORY,
  }
}

/** Opens the official Codex TUI backed by a Tuiminal-owned local app-server. */
export function createCodexAgentCommand(): FreeTerminalCommand {
  return {
    kind: "custom",
    label: "Codex",
    shortLabel: "Codex",
    displayCommand: "codex --remote",
    command: ["codex"],
    accent: COLORS.terminal,
    workingDirectory: FREE_TERMINAL_WORKING_DIRECTORY,
    codex: { appServer: true },
  }
}

function processEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

export function startFreeTerminalProcess(
  command: string[],
  options: {
    cwd?: string
    columns?: number
    rows?: number
    onData: (data: Uint8Array) => void
    onExit: (result: FreeTerminalExit) => void
    /** Attached clients must detach without sending Ctrl+C to a borrowed session. */
    interruptOnStop?: boolean
    env?: Record<string, string>
  },
): FreeTerminalProcessHandle {
  if (!bunRuntime) {
    throw new Error("O Free Terminal precisa ser executado com o Bun.")
  }

  let stopped = false
  let closed = false
  let exited = false
  let forceStopTimer: ReturnType<typeof setTimeout> | null = null
  let stopDeadlineTimer: ReturnType<typeof setTimeout> | null = null
  let stopPromise: Promise<void> | null = null
  let resolveStop: (() => void) | null = null
  let rejectStop: ((error: Error) => void) | null = null
  const terminalEnded = Promise.withResolvers<void>()
  const retired = Promise.withResolvers<void>()
  const subprocess = bunRuntime.spawn(command, {
    cwd: options.cwd ?? FREE_TERMINAL_WORKING_DIRECTORY,
    env: {
      ...processEnvironment(),
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
    terminal: {
      cols: Math.max(20, Math.floor(options.columns ?? 80)),
      rows: Math.max(5, Math.floor(options.rows ?? 24)),
      name: "xterm-256color",
      data(_terminal, data) {
        options.onData(data)
      },
      exit() {
        terminalEnded.resolve()
      },
    },
  })

  const terminal = subprocess.terminal
  if (!terminal) {
    subprocess.kill("SIGTERM")
    throw new Error("O Bun não conseguiu criar o terminal PTY.")
  }

  const closeTerminal = () => {
    if (closed) return
    closed = true
    try {
      terminal.close()
    } catch {
      // The PTY can already be closed by the child process.
    }
  }

  const handle: FreeTerminalProcessHandle = {
    pid: subprocess.pid,
    write(data) {
      if (closed) return
      terminal.write(data)
    },
    resize(columns, rows) {
      if (closed || columns <= 0 || rows <= 0) return
      terminal.resize(Math.max(20, Math.floor(columns)), Math.max(5, Math.floor(rows)))
    },
    stop() {
      if (exited) return retired.promise
      if (stopPromise) return stopPromise
      stopped = true
      stopPromise = new Promise<void>((resolve, reject) => {
        resolveStop = resolve
        rejectStop = reject
      })
      try {
        if (options.interruptOnStop !== false) terminal.write("\u0003")
      } catch {
        // A process that already exited no longer accepts input.
      }
      signalOwnedProcessGroup(subprocess.pid, "SIGTERM", () => {
        try {
          subprocess.kill("SIGTERM")
        } catch {
          // The process may have exited between the checks.
        }
      })
      forceStopTimer = setTimeout(() => {
        forceStopTimer = null
        if (exited) return
        forceKillOwnedProcessTree(subprocess.pid, () => {
          try {
            subprocess.kill("SIGKILL")
          } catch {
            // The process may have exited while escalation was scheduled.
          }
        })
      }, OWNED_PROCESS_STOP_GRACE_MS)
      stopDeadlineTimer = setTimeout(() => {
        stopDeadlineTimer = null
        if (!exited) {
          rejectStop?.(processStopDeadlineError("Terminal", subprocess.pid))
          rejectStop = null
          resolveStop = null
        }
      }, OWNED_PROCESS_STOP_DEADLINE_MS)
      return stopPromise
    },
  }

  const release = registerTerminalResource(handle)
  void subprocess.exited.then(async (code) => {
    exited = true
    if (forceStopTimer) clearTimeout(forceStopTimer)
    if (stopDeadlineTimer) clearTimeout(stopDeadlineTimer)
    // ConPTY can deliver its last output after the child exits. Drain through
    // terminal EOF before closing it; descendants retaining the stream must not
    // make retirement wait forever.
    let drainTimer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      terminalEnded.promise,
      new Promise<void>((resolveDrain) => {
        drainTimer = setTimeout(resolveDrain, OWNED_PROCESS_STOP_GRACE_MS)
      }),
    ]).finally(() => clearTimeout(drainTimer))
    release()
    closeTerminal()
    try {
      options.onExit({
        code: Number.isFinite(code) ? code : subprocess.exitCode,
        signal: subprocess.signalCode,
        stopped,
      })
    } finally {
      retired.resolve()
      resolveStop?.()
      resolveStop = null
      rejectStop = null
    }
  })

  return handle
}
