import { resolve } from "node:path"

export type FreeTerminalKind = "shell" | "custom"

export type FreeTerminalExit = {
  code: number | null
  signal: string | null
  stopped: boolean
}

export type FreeTerminalProcessHandle = {
  pid: number
  write: (data: string | Uint8Array) => void
  resize: (columns: number, rows: number) => void
  stop: () => void
}

export type FreeTerminalCommand = {
  kind: FreeTerminalKind
  label: string
  shortLabel: string
  displayCommand: string
  command: string[]
  accent: string
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
      }
    },
  ): BunSubprocessLike
}

const bunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun
const activeProcesses = new Set<FreeTerminalProcessHandle>()

export const FREE_TERMINAL_WORKING_DIRECTORY = resolve(
  process.env.TUIMINAL_WORKDIR ?? process.cwd(),
)

export function createShellTerminalCommand(): FreeTerminalCommand {
  const shell = process.env.SHELL || "/bin/zsh"
  return {
    kind: "shell",
    label: "Terminal",
    shortLabel: "TTY",
    displayCommand: `${shell} -l`,
    command: [shell, "-l"],
    accent: "#64d8ff",
  }
}

export function createFreeTerminalCommand(value: string): FreeTerminalCommand {
  const command = value.trim()
  const shell = process.env.SHELL || "/bin/zsh"
  const firstWord = command.split(/\s+/)[0] || "CLI"
  const label = firstWord.split("/").at(-1) || "CLI"

  return {
    kind: "custom",
    label,
    shortLabel: label.slice(0, 3).toUpperCase(),
    displayCommand: command,
    command: [shell, "-lc", command],
    accent: "#f7c873",
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
  },
): FreeTerminalProcessHandle {
  if (!bunRuntime) {
    throw new Error("O Free Terminal precisa ser executado com o Bun.")
  }

  let stopped = false
  let closed = false
  const subprocess = bunRuntime.spawn(command, {
    cwd: options.cwd ?? FREE_TERMINAL_WORKING_DIRECTORY,
    env: {
      ...processEnvironment(),
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
      if (stopped) return
      stopped = true
      try {
        terminal.write("\u0003")
      } catch {
        // A process that already exited no longer accepts input.
      }
      let processGroupStopped = false
      if (process.platform !== "win32" && subprocess.pid > 1) {
        try {
          process.kill(-subprocess.pid, "SIGTERM")
          processGroupStopped = true
        } catch {
          // Fall back to the child PID if it no longer owns a process group.
        }
      }
      try {
        if (!processGroupStopped) subprocess.kill("SIGTERM")
      } catch {
        // The process may have exited between the checks.
      }
      closeTerminal()
      activeProcesses.delete(handle)
    },
  }

  activeProcesses.add(handle)
  void subprocess.exited.then((code) => {
    activeProcesses.delete(handle)
    closeTerminal()
    options.onExit({
      code: Number.isFinite(code) ? code : subprocess.exitCode,
      signal: subprocess.signalCode,
      stopped,
    })
  })

  return handle
}

export function stopAllFreeTerminalProcesses() {
  for (const process of [...activeProcesses]) process.stop()
  activeProcesses.clear()
}
