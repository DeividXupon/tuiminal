import { spawn } from "node:child_process"

import type { RunnerListeningPort } from "../model/types"

const MAX_CAPTURE_CHARACTERS = 128 * 1024

export async function captureProcessOutput(
  program: string,
  args: string[],
  timeoutMilliseconds = 2500,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return ""
  return await new Promise<string>((resolveOutput) => {
    let output = ""
    let settled = false
    let stopped = false
    const child = spawn(program, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    })
    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      if (stopped || settled) return
      output += chunk.slice(0, MAX_CAPTURE_CHARACTERS - output.length)
      if (output.length === MAX_CAPTURE_CHARACTERS) stop(false)
    })
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
      resolveOutput(output)
    }
    const stop = (discard: boolean) => {
      if (stopped || settled) return
      stopped = true
      if (discard) output = ""
      // This is only our disposable read-only probe, never a monitored user process.
      // Wait for close before allowing another probe to start.
      child.kill("SIGKILL")
    }
    const abort = () => stop(true)
    const timeout = setTimeout(abort, timeoutMilliseconds)
    signal?.addEventListener("abort", abort, { once: true })
    child.once("error", finish)
    child.once("close", finish)
  })
}

export function parseListeningPorts(source: string, groupId: number) {
  const ports: RunnerListeningPort[] = []
  let pid = 0
  let processName = "processo"
  // lsof terminates fields with a newline; a capped partial field is not an address.
  for (const line of source.split("\n").slice(0, -1)) {
    const field = line[0]
    const value = line.slice(1)
    if (field === "p") {
      pid = Number.parseInt(value, 10)
    } else if (field === "c") {
      processName = value
    } else if (field === "n" && pid) {
      const address = value.match(/^(.*):(\d+)$/)
      if (!address) continue
      const port = Number.parseInt(address[2] ?? "", 10)
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) continue
      ports.push({
        groupId,
        pid,
        processName,
        host: address[1] || "*",
        port,
      })
    }
  }
  return ports
}

export async function discoverRunnerListeningPorts(
  processGroupIds: number[],
  signal?: AbortSignal,
): Promise<RunnerListeningPort[]> {
  if (!processGroupIds.length || process.platform === "win32" || signal?.aborted) return []
  const discovered = await Promise.all(
    [...new Set(processGroupIds)].map(async (groupId) => {
      const output = await captureProcessOutput(
        "lsof",
        ["-nP", "-a", "-g", String(groupId), "-iTCP", "-sTCP:LISTEN", "-Fpcn"],
        2500,
        signal,
      )
      return parseListeningPorts(output, groupId)
    }),
  )
  const unique = new Map<string, RunnerListeningPort>()
  for (const port of discovered.flat()) {
    const key = `${port.groupId}:${port.pid}:${port.host}:${port.port}`
    if (!unique.has(key)) unique.set(key, port)
  }
  return [...unique.values()].sort((left, right) => left.port - right.port)
}
