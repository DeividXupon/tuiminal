import { spawn } from "node:child_process"
import { forceKillOwnedProcessTree } from "../../../core/process/owned-process"

export type GitCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
  truncated: boolean
}

export const GIT_COMMAND_MAX_OUTPUT_BYTES = 16 * 1024 * 1024
export const GIT_COMMAND_TIMEOUT_MS = 30_000
const MUTATING_GIT_COMMANDS = new Set(["add", "restore", "rm", "switch", "checkout"])

export class GitCommandBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GitCommandBudgetError"
  }
}

export async function runGitCommand(
  cwd: string,
  args: string[],
  options: { maxOutputBytes?: number; timeoutMs?: number; mutating?: boolean } = {},
): Promise<GitCommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const mutating = options.mutating ?? MUTATING_GIT_COMMANDS.has(args[0] ?? "")
    const maxOutputBytes = Math.max(1, options.maxOutputBytes ?? GIT_COMMAND_MAX_OUTPUT_BYTES)
    const timeoutMs = Math.max(1, options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS)
    const child = spawn("git", ["-C", cwd, ...args], {
      env: {
        ...process.env,
        LC_ALL: "C",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let outputBytes = 0
    let truncated = false
    let budgetError: Error | null = null
    let settled = false

    const stop = () => {
      if (!child.pid) return
      forceKillOwnedProcessTree(child.pid, () => {
        try {
          child.kill("SIGKILL")
        } catch {
          // The command may have exited while cancellation was scheduled.
        }
      })
    }
    const timer = setTimeout(() => {
      budgetError = new GitCommandBudgetError(
        mutating
          ? "O comando Git excedeu o prazo; o resultado da operação pode ser incerto."
          : "O comando Git excedeu o prazo de 30 segundos.",
      )
      stop()
    }, timeoutMs)
    const append = (target: "stdout" | "stderr", chunk: string) => {
      const bytes = Buffer.byteLength(chunk)
      const remaining = Math.max(0, maxOutputBytes - outputBytes)
      outputBytes += bytes
      if (remaining > 0) {
        const bounded = Buffer.from(chunk).subarray(0, remaining).toString("utf8")
        if (target === "stdout") stdout += bounded
        else stderr += bounded
      }
      if (outputBytes <= maxOutputBytes || truncated) return
      truncated = true
      if (mutating) return
      budgetError = new GitCommandBudgetError(
        `A saída do Git excedeu ${Math.floor(maxOutputBytes / 1024 / 1024) || 1} MB.`,
      )
      stop()
    }

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => append("stdout", chunk))
    child.stderr.on("data", (chunk: string) => append("stderr", chunk))
    child.once("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectCommand(error)
    })
    child.once("close", (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (budgetError) rejectCommand(budgetError)
      else resolveCommand({ stdout, stderr, exitCode: exitCode ?? 1, truncated })
    })
  })
}
