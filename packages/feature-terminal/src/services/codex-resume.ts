import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { type CodexResumeThread, publishCodexResumeThreads } from "../model/codex-resume-threads"
import { unusedCodexLoopbackPort, waitForCodexAppServer } from "./codex-app-server-connection"
import { remoteCodexAppServerSshCommand } from "./remote-codex-connection"
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
export function codexResumeThreads(
  message: unknown,
  remoteProfileId?: string,
  remoteProfileName?: string,
): CodexResumeThread[] {
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
          ...(remoteProfileId ? { remoteProfileId } : {}),
          ...(remoteProfileName ? { remoteProfileName } : {}),
        },
      ]
    })
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    .slice(0, 6)
}

export function resumeListFrame(id: string) {
  return JSON.stringify({
    id,
    method: "thread/list",
    params: {
      cursor: null,
      limit: 6,
      sortKey: "recency_at",
      sortDirection: "desc",
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
    connectedSocket.send(resumeListFrame(listId))
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

type JsonlReader = {
  reader: ReadableStreamDefaultReader<Uint8Array>
  decoder: TextDecoder
  buffered: string
}

async function nextJsonlMessage(state: JsonlReader, signal: AbortSignal): Promise<RecordValue> {
  while (true) {
    signal.throwIfAborted()
    const newline = state.buffered.indexOf("\n")
    if (newline >= 0) {
      const line = state.buffered.slice(0, newline).replace(/\r$/, "")
      state.buffered = state.buffered.slice(newline + 1)
      try {
        const message = object(JSON.parse(line))
        if (message) return message
      } catch {
        // Ignore shell startup output and wait for a JSONL protocol frame.
      }
      continue
    }
    const chunk = await state.reader.read()
    if (chunk.done) throw new Error("Codex app-server remoto desconectou durante a consulta.")
    state.buffered += state.decoder.decode(chunk.value, { stream: true })
    if (state.buffered.length > 16 * 1024 * 1024)
      throw new Error("A resposta remota do Codex excedeu o limite permitido.")
  }
}

async function nextJsonlResponse(state: JsonlReader, id: string, signal: AbortSignal) {
  while (true) {
    const message = await nextJsonlMessage(state, signal)
    if (message.id === id) return message
  }
}

function writeJsonl(
  stdin: { write(value: string | Uint8Array): number | Promise<number> },
  message: string,
) {
  return Promise.resolve(stdin.write(`${message}\n`))
}

/** Loads the active SSH host's recent threads without opening a visible Codex pane. */
export async function refreshRemoteCodexResumeThreads(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  options: { executable?: readonly string[] } = {},
) {
  signal.throwIfAborted()
  const sshCommand = remoteCodexAppServerSshCommand(profile, "/")
  const command = options.executable ? [...options.executable, ...sshCommand.slice(1)] : sshCommand
  const server = Bun.spawn(command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  })
  const stdout = server.stdout as ReadableStream<Uint8Array>
  const stdin = server.stdin as {
    write(value: string | Uint8Array): number | Promise<number>
    end(): void
  }
  const state: JsonlReader = {
    reader: stdout.getReader(),
    decoder: new TextDecoder(),
    buffered: "",
  }
  let stopping: Promise<void> | null = null
  let unregister: () => void = () => undefined
  const stop = () => {
    if (stopping) return stopping
    stopping = (async () => {
      try {
        stdin.end()
        server.kill()
        await server.exited
      } finally {
        unregister()
      }
    })()
    return stopping
  }
  unregister = registerTerminalResource({ stop })
  const abort = () => void stop()
  const abortDeadline = () => void stop()
  let deadline: AbortSignal | null = null
  signal.addEventListener("abort", abort, { once: true })
  try {
    deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    deadline.addEventListener("abort", abortDeadline, { once: true })
    const initializeId = `tuiminal-remote-resume-initialize:${profile.id}`
    await writeJsonl(
      stdin,
      JSON.stringify({
        id: initializeId,
        method: "initialize",
        params: {
          clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
          capabilities: null,
        },
      }),
    )
    await nextJsonlResponse(state, initializeId, deadline)
    await writeJsonl(stdin, JSON.stringify({ method: "initialized", params: {} }))
    const listId = `tuiminal-remote-resume-list:${profile.id}`
    await writeJsonl(stdin, resumeListFrame(listId))
    const threads = codexResumeThreads(
      await nextJsonlResponse(state, listId, deadline),
      profile.id,
      profile.name,
    )
    publishCodexResumeThreads(threads, profile.id)
    const hydrated: CodexResumeThread[] = []
    for (const [index, thread] of threads.entries()) {
      const id = `tuiminal-remote-resume-turns:${profile.id}:${index}`
      await writeJsonl(stdin, resumeTurnsFrame(id, thread.id))
      const response = await nextJsonlResponse(state, id, deadline)
      hydrated.push({ ...thread, lastResponse: codexResumeLastResponse(response) })
    }
    deadline.throwIfAborted()
    publishCodexResumeThreads(hydrated, profile.id)
    return hydrated
  } finally {
    signal.removeEventListener("abort", abort)
    deadline?.removeEventListener("abort", abortDeadline)
    state.reader.releaseLock()
    await stop()
  }
}
