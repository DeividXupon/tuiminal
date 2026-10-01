export type BoundedCommandResult = { exitCode: number; stdout: string; stderr: string }

export const MISSING_COMMAND_RESULT: BoundedCommandResult = {
  exitCode: 127,
  stdout: "",
  stderr: "",
}

export async function readBoundedText(
  stream: ReadableStream<Uint8Array>,
  maximumBytes = 64 * 1024,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let remaining = maximumBytes
  let output = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (remaining <= 0) continue
      const value = chunk.value.subarray(0, remaining)
      remaining -= value.byteLength
      output += decoder.decode(value, { stream: true })
    }
    return output + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

/** Runs a short-lived probe with bounded output; `spawnFailed` maps executables that cannot start. */
export async function runBoundedCommand(
  command: readonly string[],
  signal: AbortSignal,
  spawnFailed: () => BoundedCommandResult = () => MISSING_COMMAND_RESULT,
): Promise<BoundedCommandResult> {
  signal.throwIfAborted()
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn([...command], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  } catch {
    return spawnFailed()
  }
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedText(child.stdout as ReadableStream<Uint8Array>),
      readBoundedText(child.stderr as ReadableStream<Uint8Array>),
    ])
    signal.throwIfAborted()
    return { exitCode, stdout, stderr }
  } finally {
    signal.removeEventListener("abort", stop)
    if (child.exitCode === null) child.kill()
  }
}
