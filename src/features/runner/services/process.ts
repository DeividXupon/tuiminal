import { type ChildProcess, spawn } from "node:child_process"
import { stripVTControlCharacters } from "node:util"
import { type RunnerEnvironmentProfile, runnerProcessEnvironment } from "../storage/runner-config"

import type {
  RunnerCommand,
  RunnerOutputStream,
  RunnerProcessHandle,
  RunnerProcessCallbacks,
} from "../model/types"
import { bunRuntime } from "./pty-runtime"
import { activeProcesses } from "./process-registry"

export function signalProcess(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The process already exited.
    }
  }
}

export function pipeLines(
  child: ChildProcess,
  stream: RunnerOutputStream,
  callback: RunnerProcessCallbacks["onLine"],
) {
  const source = stream === "stdout" ? child.stdout : child.stderr
  if (!source) return
  source.setEncoding("utf8")
  let pending = ""
  const flush = (includePending: boolean) => {
    const normalized = pending.replace(/\r(?!\n)/g, "\n")
    const lines = normalized.split("\n")
    pending = includePending ? "" : (lines.pop() ?? "")
    for (const line of lines) {
      if (line) callback(stripVTControlCharacters(line), stream)
    }
    if (includePending && pending) {
      callback(stripVTControlCharacters(pending), stream)
      pending = ""
    }
  }
  source.on("data", (chunk: string) => {
    pending += chunk
    flush(false)
  })
  source.on("end", () => flush(true))
}

export function startRunnerProcess(
  root: string,
  command: RunnerCommand,
  callbacks: RunnerProcessCallbacks,
  profile?: RunnerEnvironmentProfile,
): RunnerProcessHandle {
  const workingDirectory = command.workingDirectory ?? root
  const environment = {
    ...runnerProcessEnvironment(profile, command),
    FORCE_COLOR: "1",
    CLICOLOR_FORCE: "1",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  }

  if (command.interactive) {
    if (!bunRuntime) {
      throw new Error("Comandos interativos do Runner precisam ser executados com o Bun.")
    }
    let stopped = false
    let closed = false
    let handle: RunnerProcessHandle
    const subprocess = bunRuntime.spawn([command.program, ...command.args], {
      cwd: workingDirectory,
      env: environment,
      terminal: {
        cols: 100,
        rows: 30,
        name: "xterm-256color",
        data(_terminal, data) {
          const output = stripVTControlCharacters(new TextDecoder().decode(data))
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
          for (const line of output.split("\n")) {
            if (line) callbacks.onLine(line, "stdout")
          }
        },
      },
    })
    const terminal = subprocess.terminal
    if (!terminal) {
      subprocess.kill("SIGTERM")
      throw new Error("O Bun não conseguiu criar o terminal PTY do Runner.")
    }
    const closeTerminal = () => {
      if (closed) return
      closed = true
      try {
        terminal.close()
      } catch {
        // A PTY may already be closed after its child exits.
      }
    }
    handle = {
      pid: subprocess.pid,
      interactive: true,
      write(data) {
        if (!closed) terminal.write(data)
      },
      stop() {
        if (stopped || closed) return
        stopped = true
        try {
          terminal.write("\u0003")
        } catch {
          // A process that already exited no longer accepts input.
        }
        try {
          if (process.platform !== "win32" && subprocess.pid > 1) {
            process.kill(-subprocess.pid, "SIGTERM")
          } else {
            subprocess.kill("SIGTERM")
          }
        } catch {
          try {
            subprocess.kill("SIGTERM")
          } catch {
            // The process already exited.
          }
        }
        closeTerminal()
      },
    }
    activeProcesses.add(handle)
    void subprocess.exited.then((code) => {
      activeProcesses.delete(handle)
      closeTerminal()
      callbacks.onExit({
        code: Number.isFinite(code) ? code : subprocess.exitCode,
        signal: subprocess.signalCode as NodeJS.Signals | null,
        stopped,
      })
    })
    return handle
  }

  let stopped = false
  let exited = false
  const child = spawn(command.program, command.args, {
    cwd: workingDirectory,
    env: environment,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  })
  const handle: RunnerProcessHandle = {
    pid: child.pid ?? null,
    interactive: false,
    write(data) {
      if (!exited && child.stdin?.writable) child.stdin.write(data)
    },
    stop() {
      if (exited || stopped) return
      stopped = true
      signalProcess(child, "SIGTERM")
    },
  }
  activeProcesses.add(handle)
  pipeLines(child, "stdout", callbacks.onLine)
  pipeLines(child, "stderr", callbacks.onLine)

  child.once("error", (error) => {
    callbacks.onLine(`Não foi possível executar: ${error.message}`, "stderr")
  })
  child.once("close", (code, signal) => {
    exited = true
    activeProcesses.delete(handle)
    callbacks.onExit({ code, signal, stopped })
  })
  return handle
}

export function stopAllRunnerProcesses() {
  for (const handle of [...activeProcesses]) handle.stop()
  activeProcesses.clear()
}
