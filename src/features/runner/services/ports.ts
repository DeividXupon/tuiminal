import { spawn } from "node:child_process"

import type { RunnerListeningPort } from "../model/types"

export async function captureProcessOutput(
  program: string,
  args: string[],
  timeoutMilliseconds = 2500,
) {
  return await new Promise<string>((resolveOutput) => {
    let output = ""
    let settled = false
    const child = spawn(program, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    })
    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      output += chunk
    })
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolveOutput(output)
    }
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      finish()
    }, timeoutMilliseconds)
    child.once("error", finish)
    child.once("close", finish)
  })
}

export function parseListeningPorts(source: string, groupId: number) {
  const ports: RunnerListeningPort[] = []
  let pid = 0
  let processName = "processo"
  for (const line of source.split("\n")) {
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
      if (!Number.isFinite(port)) continue
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
): Promise<RunnerListeningPort[]> {
  if (!processGroupIds.length || process.platform === "win32") return []
  const discovered = await Promise.all(
    [...new Set(processGroupIds)].map(async (groupId) => {
      const output = await captureProcessOutput("lsof", [
        "-nP",
        "-a",
        "-g",
        String(groupId),
        "-iTCP",
        "-sTCP:LISTEN",
        "-Fpcn",
      ])
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
