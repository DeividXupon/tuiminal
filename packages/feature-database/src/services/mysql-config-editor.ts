import { EXTERNAL_DATABASE_FILE_LIMIT } from "../model/external-connection-config"

async function boundedText(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > limit) throw new Error("Saída do mysql_config_editor excedeu 256 KiB.")
    chunks.push(next.value)
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

export async function runMysqlConfigEditor(signal?: AbortSignal) {
  if (signal?.aborted) return null
  const executable = Bun.which("mysql_config_editor")
  if (!executable) return null
  const child = Bun.spawn([executable, "print", "--all"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  })
  const stop = () => child.kill()
  signal?.addEventListener("abort", stop, { once: true })
  const timeout = setTimeout(stop, 3_000)
  try {
    const [stdout, exitCode] = await Promise.all([
      boundedText(child.stdout, EXTERNAL_DATABASE_FILE_LIMIT),
      child.exited,
    ])
    return exitCode === 0 ? stdout : null
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", stop)
    if (!child.killed) child.kill()
  }
}
