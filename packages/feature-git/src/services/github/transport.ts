import { execFile } from "node:child_process"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

export type GitHubTransportErrorKind =
  | "not-found"
  | "not-authenticated"
  | "forbidden"
  | "rate-limited"
  | "timeout"
  | "cancelled"
  | "output-limit"
  | "input-failed"
  | "invalid-json"
  | "command-failed"

export class GitHubTransportError extends Error {
  constructor(
    readonly kind: GitHubTransportErrorKind,
    message: string,
    readonly exitCode: number | null = null,
  ) {
    super(message)
    this.name = "GitHubTransportError"
  }
}

export type GhCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type GhTransportOptions = {
  executable?: string
  cwd?: string
  host?: string
  timeoutMs?: number
  maxOutputBytes?: number
  signal?: AbortSignal
  env?: Readonly<Record<string, string>>
}

type GhCommandRequest = {
  args: readonly string[]
  stdin?: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const STDIN_CHUNK_BYTES = (process.platform === "win32" ? 64 : 8) * 1024
const STDIN_CHUNK_INTERVAL_MS = 1

function safeEnvironment(options: GhTransportOptions) {
  return {
    ...process.env,
    ...options.env,
    GH_PROMPT_DISABLED: "1",
    GH_PAGER: "cat",
    GIT_PAGER: "cat",
    PAGER: "cat",
    NO_COLOR: "1",
    LC_ALL: "C",
    ...(options.host ? { GH_HOST: options.host } : {}),
  }
}

function classifyCommandFailure(error: {
  name: string
  message: string
  killed?: boolean
  code?: string | number
}) {
  const message = error.message || "GitHub CLI command failed"
  if (error.name === "AbortError")
    return new GitHubTransportError("cancelled", "GitHub request cancelled")
  if (error.killed) {
    return new GitHubTransportError("timeout", "GitHub request timed out")
  }
  if (error.code === "ENOENT") {
    return new GitHubTransportError("not-found", "GitHub CLI (gh) was not found")
  }
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return new GitHubTransportError("output-limit", "GitHub CLI response exceeded the safe limit")
  }
  const normalized = message.toLowerCase()
  if (
    normalized.includes("authentication") ||
    normalized.includes("not logged") ||
    normalized.includes("not authenticated") ||
    normalized.includes("bad credentials") ||
    normalized.includes("http 401") ||
    normalized.includes("gh auth login") ||
    normalized.includes("invalid token") ||
    normalized.includes("token is invalid")
  ) {
    return new GitHubTransportError("not-authenticated", message)
  }
  if (normalized.includes("rate limit")) return new GitHubTransportError("rate-limited", message)
  if (normalized.includes("forbidden") || normalized.includes("http 403")) {
    return new GitHubTransportError("forbidden", message)
  }
  return new GitHubTransportError("command-failed", message, Number(error.code) || null)
}

export function runGhCommand(
  request: GhCommandRequest,
  options: GhTransportOptions = {},
): Promise<GhCommandResult> {
  if (request.args.some((argument) => argument.includes("\0"))) {
    return Promise.reject(
      new GitHubTransportError("command-failed", "Invalid null byte in gh argument"),
    )
  }
  if (options.signal?.aborted) {
    return Promise.reject(new GitHubTransportError("cancelled", "GitHub request cancelled"))
  }
  return new Promise((resolve, reject) => {
    let closed = false
    let inputFailed = false
    const input = request.stdin === undefined ? undefined : Buffer.from(request.stdin, "utf8")
    let inputOffset = 0
    let inputComplete = !input?.length
    let finish: (() => void) | undefined
    const settle = () => {
      if (closed) finish?.()
    }
    const child = execFile(
      options.executable ?? "gh",
      [...request.args],
      {
        cwd: options.cwd,
        env: safeEnvironment(options),
        encoding: "utf8",
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
        signal: options.signal,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        finish = () => {
          if (error) {
            const detail = stderr.trim() || stdout.trim() || error.message
            reject(classifyCommandFailure(Object.assign(error, { message: detail })))
          } else if (inputFailed || !inputComplete) {
            reject(
              new GitHubTransportError(
                "input-failed",
                translateUi("O GitHub CLI encerrou antes de receber toda a entrada."),
              ),
            )
          } else resolve({ stdout, stderr, exitCode: 0 })
        }
        settle()
      },
    )
    child.once("close", () => {
      closed = true
      settle()
    })
    child.stdin?.on("error", () => {
      inputFailed = true
    })
    // Bun 1.3.14 can acknowledge one large write while it is still buffered. Keep
    // only a bounded chunk in flight so an early child close remains observable.
    const writeNextInputChunk = () => {
      if (!input?.length || closed || inputFailed) return
      const end = Math.min(inputOffset + STDIN_CHUNK_BYTES, input.length)
      child.stdin?.write(input.subarray(inputOffset, end), (error) => {
        if (error) {
          inputFailed = true
          return
        }
        inputOffset = end
        if (inputOffset === input.length) {
          inputComplete = true
          child.stdin?.end()
          return
        }
        setTimeout(writeNextInputChunk, STDIN_CHUNK_INTERVAL_MS)
      })
    }
    if (input?.length) writeNextInputChunk()
    else child.stdin?.end()
  })
}

export async function runGhJson<T>(
  request: GhCommandRequest,
  options: GhTransportOptions & { validate?: (value: unknown) => value is T } = {},
): Promise<T> {
  const result = await runGhCommand(request, options)
  let value: unknown
  try {
    value = JSON.parse(result.stdout)
  } catch {
    throw new GitHubTransportError("invalid-json", "GitHub CLI returned invalid JSON")
  }
  if (options.validate && !options.validate(value)) {
    throw new GitHubTransportError("invalid-json", "GitHub CLI returned an unexpected JSON shape")
  }
  return value as T
}
