import { spawn } from "node:child_process"

export const OWNED_PROCESS_STOP_GRACE_MS = 1_000
export const OWNED_PROCESS_STOP_DEADLINE_MS = 4_000

export function signalOwnedProcessGroup(pid: number, signal: NodeJS.Signals, fallback: () => void) {
  if (pid <= 1) {
    fallback()
    return
  }
  if (process.platform === "win32") {
    fallback()
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    fallback()
  }
}

export function forceKillOwnedProcessTree(pid: number, fallback: () => void) {
  if (pid <= 1) {
    fallback()
    return
  }
  if (process.platform !== "win32") {
    signalOwnedProcessGroup(pid, "SIGKILL", fallback)
    return
  }

  try {
    const killer = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    })
    let fellBack = false
    const applyFallback = () => {
      if (fellBack) return
      fellBack = true
      fallback()
    }
    killer.once("error", applyFallback)
    killer.once("close", (code) => {
      if (code !== 0) applyFallback()
    })
  } catch {
    fallback()
  }
}

export function processStopDeadlineError(label: string, pid: number) {
  return new Error(`${label} #${pid} não confirmou o encerramento dentro do prazo.`)
}
