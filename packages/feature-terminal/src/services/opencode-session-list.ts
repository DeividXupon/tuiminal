import type { RemoteCodexTarget } from "../model/sessions"
import { parseOpenCodeSessions } from "./opencode-api"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import { remoteOpenCodeSessionListCommand } from "./remote-opencode-connection"

async function readBoundedOutput(stream: ReadableStream<Uint8Array>, maximumBytes: number) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let remaining = maximumBytes
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (chunk.value.byteLength > remaining)
        throw new Error("A lista de sessões do OpenCode excedeu o limite seguro.")
      remaining -= chunk.value.byteLength
      output += decoder.decode(chunk.value, { stream: true })
    }
    return output + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export async function listOpenCodeResumeSessions(
  directory: string,
  signal: AbortSignal,
  remote?: RemoteCodexTarget,
) {
  signal.throwIfAborted()
  const timeout = AbortSignal.timeout(15_000)
  const boundedSignal = AbortSignal.any([signal, timeout])
  const command = remote
    ? remoteOpenCodeSessionListCommand(remote.profile)
    : [resolveOpenCodeExecutable(), "session", "list", "--format", "json", "--max-count", "20"]
  const child = Bun.spawn(command, {
    ...(remote ? {} : { cwd: directory }),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stop = () => child.kill()
  boundedSignal.addEventListener("abort", stop, { once: true })
  try {
    const [code, stdout] = await Promise.all([
      child.exited,
      readBoundedOutput(child.stdout as ReadableStream<Uint8Array>, 2 * 1024 * 1024),
      readBoundedOutput(child.stderr as ReadableStream<Uint8Array>, 64 * 1024),
    ])
    if (!signal.aborted && timeout.aborted)
      throw new Error("A listagem de sessões do OpenCode excedeu o tempo limite.")
    signal.throwIfAborted()
    if (code !== 0) throw new Error("Não foi possível listar as sessões do OpenCode.")
    return parseOpenCodeSessions(JSON.parse(stdout))
  } finally {
    boundedSignal.removeEventListener("abort", stop)
    if (child.exitCode === null) child.kill()
  }
}
