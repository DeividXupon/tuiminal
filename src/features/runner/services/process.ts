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
import { RUNNER_LOG_ENTRY_MAX_CHARS } from "../model/log-buffer"
import {
  forceKillOwnedProcessTree,
  OWNED_PROCESS_STOP_DEADLINE_MS,
  OWNED_PROCESS_STOP_GRACE_MS,
  processStopDeadlineError,
} from "../../../core/process/owned-process"

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
  const emitBounded = (line: string) => {
    const marker = "… [linha dividida]"
    const chunkSize = RUNNER_LOG_ENTRY_MAX_CHARS - marker.length
    let remaining = line
    while (remaining.length > RUNNER_LOG_ENTRY_MAX_CHARS) {
      const chunk = remaining.slice(0, chunkSize)
      remaining = remaining.slice(chunkSize)
      callback(stripVTControlCharacters(`${chunk}${marker}`), stream)
    }
    if (remaining) callback(stripVTControlCharacters(remaining), stream)
  }
  const flush = (includePending: boolean) => {
    const normalized = pending.replace(/\r(?!\n)/g, "\n")
    const lines = normalized.split("\n")
    const tail = lines.pop() ?? ""
    pending = includePending ? "" : tail
    for (const line of lines) emitBounded(line)
    if (includePending) emitBounded(tail)
    while (!includePending && pending.length > RUNNER_LOG_ENTRY_MAX_CHARS) {
      const marker = "… [linha dividida]"
      const chunkSize = RUNNER_LOG_ENTRY_MAX_CHARS - marker.length
      const chunk = pending.slice(0, chunkSize)
      pending = pending.slice(chunkSize)
      callback(stripVTControlCharacters(`${chunk}${marker}`), stream)
    }
  }
  source.on("data", (chunk: string) => {
    pending += chunk
    flush(false)
  })
  source.on("end", () => flush(true))
}

function emitPtyOutput(text: string, onLine: RunnerProcessCallbacks["onLine"]) {
  const output = stripVTControlCharacters(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  for (const line of output.split("\n")) {
    if (line) onLine(line, "stdout")
  }
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
    let exited = false
    let forceStopTimer: ReturnType<typeof setTimeout> | null = null
    let stopDeadlineTimer: ReturnType<typeof setTimeout> | null = null
    let stopPromise: Promise<void> | null = null
    let resolveStop: (() => void) | null = null
    let rejectStop: ((error: Error) => void) | null = null
    let handle: RunnerProcessHandle
    const decoder = new TextDecoder()
    const subprocess = bunRuntime.spawn([command.program, ...command.args], {
      cwd: workingDirectory,
      env: environment,
      terminal: {
        cols: 100,
        rows: 30,
        name: "xterm-256color",
        data(_terminal, data) {
          if (!exited) emitPtyOutput(decoder.decode(data, { stream: true }), callbacks.onLine)
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
    const signalSubprocess = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && subprocess.pid > 1) {
          process.kill(-subprocess.pid, signal)
        } else {
          subprocess.kill(signal)
        }
      } catch {
        try {
          subprocess.kill(signal)
        } catch {
          // The process already exited.
        }
      }
    }
    handle = {
      pid: subprocess.pid,
      interactive: true,
      write(data) {
        if (!closed) terminal.write(data)
      },
      stop() {
        if (exited) return Promise.resolve()
        if (stopPromise) return stopPromise
        stopped = true
        stopPromise = new Promise<void>((resolve, reject) => {
          resolveStop = resolve
          rejectStop = reject
        })
        try {
          terminal.write("\u0003")
        } catch {
          // A process that already exited no longer accepts input.
        }
        signalSubprocess("SIGTERM")
        forceStopTimer = setTimeout(() => {
          forceStopTimer = null
          if (!exited) {
            forceKillOwnedProcessTree(subprocess.pid, () => signalSubprocess("SIGKILL"))
          }
        }, OWNED_PROCESS_STOP_GRACE_MS)
        stopDeadlineTimer = setTimeout(() => {
          stopDeadlineTimer = null
          if (!exited) {
            rejectStop?.(processStopDeadlineError("Runner", subprocess.pid))
            rejectStop = null
            resolveStop = null
          }
        }, OWNED_PROCESS_STOP_DEADLINE_MS)
        return stopPromise
      },
    }
    activeProcesses.add(handle)
    void subprocess.exited.then((code) => {
      exited = true
      if (forceStopTimer) clearTimeout(forceStopTimer)
      if (stopDeadlineTimer) clearTimeout(stopDeadlineTimer)
      activeProcesses.delete(handle)
      closeTerminal()
      emitPtyOutput(decoder.decode(), callbacks.onLine)
      callbacks.onExit({
        code: Number.isFinite(code) ? code : subprocess.exitCode,
        signal: subprocess.signalCode as NodeJS.Signals | null,
        stopped,
      })
      resolveStop?.()
      resolveStop = null
      rejectStop = null
    })
    return handle
  }

  let stopped = false
  let exited = false
  let forceStopTimer: ReturnType<typeof setTimeout> | null = null
  let stopDeadlineTimer: ReturnType<typeof setTimeout> | null = null
  let stopPromise: Promise<void> | null = null
  let resolveStop: (() => void) | null = null
  let rejectStop: ((error: Error) => void) | null = null
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
      if (exited) return Promise.resolve()
      if (stopPromise) return stopPromise
      stopped = true
      stopPromise = new Promise<void>((resolve, reject) => {
        resolveStop = resolve
        rejectStop = reject
      })
      signalProcess(child, "SIGTERM")
      forceStopTimer = setTimeout(() => {
        forceStopTimer = null
        if (!exited && child.pid) {
          forceKillOwnedProcessTree(child.pid, () => signalProcess(child, "SIGKILL"))
        }
      }, OWNED_PROCESS_STOP_GRACE_MS)
      stopDeadlineTimer = setTimeout(() => {
        stopDeadlineTimer = null
        if (!exited) {
          rejectStop?.(processStopDeadlineError("Runner", child.pid ?? 0))
          rejectStop = null
          resolveStop = null
        }
      }, OWNED_PROCESS_STOP_DEADLINE_MS)
      return stopPromise
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
    if (forceStopTimer) clearTimeout(forceStopTimer)
    if (stopDeadlineTimer) clearTimeout(stopDeadlineTimer)
    activeProcesses.delete(handle)
    callbacks.onExit({ code, signal, stopped })
    resolveStop?.()
    resolveStop = null
    rejectStop = null
  })
  return handle
}

export async function stopAllRunnerProcesses() {
  const results = await Promise.allSettled([...activeProcesses].map((handle) => handle.stop()))
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  )
  if (failures.length) throw new AggregateError(failures, "Falha ao encerrar processos do Runner.")
}
