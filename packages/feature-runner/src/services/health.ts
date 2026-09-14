import { connect } from "node:net"
import type { RunnerHealthCheck } from "../storage/runner-config"

export function sleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolveSleep) => {
    if (signal?.aborted) return resolveSleep()
    const finish = () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", finish)
      resolveSleep()
    }
    const timeout = setTimeout(finish, milliseconds)
    signal?.addEventListener("abort", finish, { once: true })
  })
}

export async function isRunnerPortOpen(host: string, port: number, signal?: AbortSignal) {
  return new Promise<boolean>((resolveCheck) => {
    if (signal?.aborted) return resolveCheck(false)
    const socket = connect({ host, port })
    let resolved = false
    const finish = (open: boolean) => {
      if (resolved) return
      resolved = true
      signal?.removeEventListener("abort", abort)
      socket.destroy()
      resolveCheck(open)
    }
    const abort = () => finish(false)
    signal?.addEventListener("abort", abort, { once: true })
    socket.setTimeout(500)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
  })
}

async function isRunnerHttpHealthy(url: string, signal: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, 2_000)
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal })
    await response.body?.cancel()
    return response.ok && !controller.signal.aborted
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", abort)
    controller.abort()
  }
}

export async function waitForRunnerHealthCheck(
  check: Exclude<RunnerHealthCheck, { type: "log" }>,
  signal?: AbortSignal,
) {
  if (signal?.aborted || check.timeoutMs <= 0) return false
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, check.timeoutMs)
  signal?.addEventListener("abort", abort, { once: true })
  try {
    while (!controller.signal.aborted) {
      const healthy =
        check.type === "port"
          ? await isRunnerPortOpen(check.host, check.port, controller.signal)
          : await isRunnerHttpHealthy(check.url, controller.signal)
      if (healthy) return !controller.signal.aborted
      await sleep(300, controller.signal)
    }
    return false
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
  }
}
