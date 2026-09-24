import { createServer } from "node:net"
import { type CodexResumeThread, publishCodexResumeThreads } from "../model/codex-resume-threads"
import { registerTerminalResource } from "./terminal-resources"

type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function cleanThreadText(value: unknown, limit: number) {
  if (typeof value !== "string") return ""
  return [
    ...value
      .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, limit)
    .join("")
}

function threadState(value: unknown): CodexResumeThread["state"] {
  const status = object(value)
  if (status?.type === "systemError") return "failed"
  if (status?.type !== "active") return "idle"
  return Array.isArray(status.activeFlags) && status.activeFlags.includes("waitingOnApproval")
    ? "blocked"
    : "working"
}

function responseFromItems(value: unknown) {
  if (!Array.isArray(value)) return ""
  const messages = value
    .map(object)
    .filter(
      (item): item is RecordValue =>
        item !== null && item.type === "agentMessage" && typeof item.text === "string",
    )
  const final = messages.filter((item) => item.phase === "final_answer").at(-1)
  return cleanThreadText((final ?? messages.at(-1))?.text, 1_000)
}

/** Extracts the latest public Codex response from newest-first full turns. */
export function codexResumeLastResponse(message: unknown) {
  const data = object(object(message)?.result)?.data
  if (!Array.isArray(data)) return ""
  for (const value of data) {
    const response = responseFromItems(object(value)?.items)
    if (response) return response
  }
  return ""
}

/** Parses the same public thread summaries used by the Codex `/resume` picker. */
export function codexResumeThreads(message: unknown): CodexResumeThread[] {
  const result = object(object(message)?.result)
  if (!Array.isArray(result?.data)) return []
  return result.data
    .flatMap((value): CodexResumeThread[] => {
      const thread = object(value)
      if (typeof thread?.id !== "string") return []
      const preview = cleanThreadText(thread.preview, 240)
      const name = cleanThreadText(thread.name, 120)
      const cwd = cleanThreadText(thread.cwd, 400)
      const updatedAt =
        typeof thread.recencyAt === "number"
          ? thread.recencyAt
          : typeof thread.updatedAt === "number"
            ? thread.updatedAt
            : 0
      return [
        {
          id: thread.id,
          title: name || preview || "Codex",
          preview,
          lastResponse: "",
          cwd,
          updatedAt,
          state: threadState(thread.status),
        },
      ]
    })
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    .slice(0, 6)
}

export function resumeListFrame(id: string, cwd: string | undefined) {
  return JSON.stringify({
    id,
    method: "thread/list",
    params: {
      cursor: null,
      limit: 6,
      sortKey: "recency_at",
      sortDirection: "desc",
      ...(cwd ? { cwd } : {}),
    },
  })
}

export function resumeTurnsFrame(id: string, threadId: string) {
  return JSON.stringify({
    id,
    method: "thread/turns/list",
    params: {
      threadId,
      cursor: null,
      limit: 10,
      sortDirection: "desc",
      itemsView: "full",
    },
  })
}

export async function unusedCodexLoopbackPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  const port = address && typeof address !== "string" ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (!port) throw new Error("Não foi possível reservar uma porta para o Codex app-server.")
  return port
}

export async function waitForCodexAppServer(
  url: string,
  server: { exitCode: number | null },
  signal: AbortSignal,
) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    if (server.exitCode !== null)
      throw new Error("O Codex app-server encerrou durante a inicialização.")
    const status = await fetch(`${url.replace("ws:", "http:")}/readyz`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(500)]),
    }).then(
      (response) => response.ok,
      () => false,
    )
    if (status) return
    await Bun.sleep(50)
  }
  throw new Error("O Codex app-server não ficou pronto para a interface do Codex.")
}

function waitForOpen(socket: WebSocket, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("open", onOpen)
      socket.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
    }
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("Não foi possível conectar ao Codex app-server."))
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    socket.addEventListener("open", onOpen, { once: true })
    socket.addEventListener("error", onError, { once: true })
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function waitForResponse(socket: WebSocket, id: string, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<RecordValue>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("message", onMessage)
      socket.removeEventListener("close", onClose)
      signal.removeEventListener("abort", onAbort)
    }
    const onMessage = (event: MessageEvent) => {
      try {
        const message = object(JSON.parse(String(event.data)))
        if (message?.id !== id) return
        cleanup()
        resolve(message)
      } catch {
        // Ignore unrelated malformed frames while waiting for the exact response.
      }
    }
    const onClose = () => {
      cleanup()
      reject(new Error("Codex app-server desconectou durante a consulta ao /resume."))
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    socket.addEventListener("message", onMessage)
    socket.addEventListener("close", onClose, { once: true })
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/** Loads the local `/resume` picker without requiring an already-open Codex terminal. */
export async function refreshCodexResumeThreads(cwd: string, signal: AbortSignal) {
  const port = await unusedCodexLoopbackPort()
  signal.throwIfAborted()
  const url = `ws://127.0.0.1:${port}`
  const server = Bun.spawn(["codex", "app-server", "--listen", url], {
    cwd,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  let socket: WebSocket | null = null
  let stopping: Promise<void> | null = null
  let unregister: () => void = () => undefined
  const stop = () => {
    if (stopping) return stopping
    stopping = (async () => {
      socket?.close()
      try {
        server.kill()
        await server.exited
      } finally {
        unregister()
      }
    })()
    return stopping
  }
  unregister = registerTerminalResource({ stop })
  try {
    await waitForCodexAppServer(url, server, signal)
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)])
    const connectedSocket = new WebSocket(url)
    socket = connectedSocket
    await waitForOpen(connectedSocket, deadline)
    const initializeId = "tuiminal-resume-initialize"
    connectedSocket.send(
      JSON.stringify({
        id: initializeId,
        method: "initialize",
        params: {
          clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
          capabilities: null,
        },
      }),
    )
    await waitForResponse(connectedSocket, initializeId, deadline)
    connectedSocket.send(JSON.stringify({ method: "initialized", params: {} }))
    const listId = "tuiminal-resume-list"
    connectedSocket.send(resumeListFrame(listId, cwd))
    const threads = codexResumeThreads(await waitForResponse(connectedSocket, listId, deadline))
    publishCodexResumeThreads(threads)
    const lastResponses = await Promise.all(
      threads.map(async (thread, index) => {
        const id = `tuiminal-resume-turns-${index}`
        const response = waitForResponse(connectedSocket, id, deadline)
        connectedSocket.send(resumeTurnsFrame(id, thread.id))
        return response.then(codexResumeLastResponse, () => "")
      }),
    )
    signal.throwIfAborted()
    const hydrated = threads.map((thread, index) => ({
      ...thread,
      lastResponse: lastResponses[index] ?? "",
    }))
    publishCodexResumeThreads(hydrated)
    return hydrated
  } finally {
    await stop()
  }
}
