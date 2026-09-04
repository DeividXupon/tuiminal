import { connect } from "node:net"
import type { RunnerHealthCheck } from "../storage/runner-config"

export function sleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolveSleep) => {
    if (signal?.aborted) return resolveSleep()
    const timeout = setTimeout(resolveSleep, milliseconds)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout)
        resolveSleep()
      },
      { once: true },
    )
  })
}

export async function isRunnerPortOpen(host: string, port: number) {
  return new Promise<boolean>((resolveCheck) => {
    const socket = connect({ host, port })
    let resolved = false
    const finish = (open: boolean) => {
      if (resolved) return
      resolved = true
      socket.destroy()
      resolveCheck(open)
    }
    socket.setTimeout(500)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
  })
}

export async function waitForRunnerHealthCheck(
  check: Exclude<RunnerHealthCheck, { type: "log" }>,
  signal?: AbortSignal,
) {
  const startedAt = Date.now()
  while (!signal?.aborted && Date.now() - startedAt < check.timeoutMs) {
    const healthy =
      check.type === "port"
        ? await isRunnerPortOpen(check.host, check.port)
        : await fetch(check.url, {
            method: "GET",
            signal: AbortSignal.timeout(Math.min(2_000, check.timeoutMs)),
          })
            .then((response) => response.ok)
            .catch(() => false)
    if (healthy) return true
    await sleep(300, signal)
  }
  return false
}
