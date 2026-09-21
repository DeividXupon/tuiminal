import { execFile } from "node:child_process"
import { supportsTmux } from "../model/tmux"

export function runTmux(args: string[], signal?: AbortSignal) {
  return executeTmux(args, signal, false, 3000)
}

export function runAttachedTmux(args: string[], signal?: AbortSignal) {
  return executeTmux(args, signal, true, 3000)
}

export function waitForTmux(args: string[], signal?: AbortSignal) {
  return executeTmux(args, signal, false, 0)
}

function executeTmux(
  args: string[],
  signal: AbortSignal | undefined,
  attached: boolean,
  timeout: number,
) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "tmux",
      args,
      {
        encoding: "utf8",
        timeout,
        maxBuffer: 1024 * 1024,
        signal,
        // Inspections and server mutations avoid an implicit client. Explicit
        // navigation keeps the helper pane's client identity so switch-client works.
        env: attached ? process.env : { ...process.env, TMUX: "", TMUX_PANE: "" },
      },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
  })
}

export async function hasTmux(signal?: AbortSignal) {
  if (process.platform === "win32") return false
  try {
    return supportsTmux(await runTmux(["-V"], signal))
  } catch {
    return false
  }
}
