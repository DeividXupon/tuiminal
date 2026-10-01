import { randomBytes } from "node:crypto"
import type { ClaudeHookObserver } from "./claude-hooks"

const MAX_HOOK_BYTES = 256 * 1024

async function boundedHookBody(request: Request) {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > MAX_HOOK_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export function startClaudeHookServer(observer: ClaudeHookObserver) {
  const path = `/claude-hook/${randomBytes(24).toString("hex")}`
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method !== "POST" || url.pathname !== path)
        return new Response("Not found", { status: 404 })
      const declared = Number(request.headers.get("content-length") ?? 0)
      if (declared > MAX_HOOK_BYTES) {
        void request.body?.cancel().catch(() => undefined)
        return Response.json({})
      }
      try {
        const bytes = await boundedHookBody(request)
        if (bytes) observer.receive(JSON.parse(new TextDecoder().decode(bytes)))
      } catch {
        // Hook observation is best effort and must never alter Claude's behavior.
      }
      return Response.json({})
    },
  })
  const port = server.port
  if (!port) {
    server.stop(true)
    throw new Error("Não foi possível iniciar o observador local do Claude Code.")
  }
  return {
    port,
    path,
    url: `http://127.0.0.1:${port}${path}`,
    stop() {
      server.stop(true)
    },
  }
}
