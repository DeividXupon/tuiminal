import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { AgentResumePage } from "../model/agent-resume-thread"
import {
  type CodexResumeThread,
  mergeCodexResumeThreads,
  publishCodexResumeThreads,
} from "../model/codex-resume-threads"
import { unusedCodexLoopbackPort, waitForCodexAppServer } from "./codex-app-server-connection"
import { resolveCodexExecutable } from "./codex-executable"
import { type CodexProxyProcess, CodexProxyWebSocket } from "./codex-proxy-websocket"
import {
  codexResumeLastResponse,
  codexResumeNextCursor,
  codexResumeThreads,
  resumeListFrame,
  resumeTurnsFrame,
} from "./codex-resume-protocol"
import { remoteCodexAppServerSshCommand } from "./remote-codex-connection"
import { registerTerminalResource } from "./terminal-resources"

type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

export {
  codexResumeLastResponse,
  codexResumeThreads,
  resumeListFrame,
} from "./codex-resume-protocol"

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

type CodexResumePageOptions = {
  cursor?: string | null
  append?: boolean
  limit?: number
}

function publishCodexPage(
  threads: readonly CodexResumeThread[],
  remoteProfileId: string | undefined,
  append: boolean,
) {
  if (append) mergeCodexResumeThreads(threads, remoteProfileId)
  else publishCodexResumeThreads(threads, remoteProfileId)
}

/** Loads the local `/resume` picker without requiring an already-open Codex terminal. */
export async function loadCodexResumeThreadsPage(
  cwd: string,
  signal: AbortSignal,
  options: CodexResumePageOptions = {},
): Promise<AgentResumePage<CodexResumeThread>> {
  const port = await unusedCodexLoopbackPort()
  signal.throwIfAborted()
  const url = `ws://127.0.0.1:${port}`
  const server = Bun.spawn([resolveCodexExecutable(), "app-server", "--listen", url], {
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
    connectedSocket.send(resumeListFrame(listId, options))
    const listResponse = await waitForResponse(connectedSocket, listId, deadline)
    const threads = codexResumeThreads(listResponse)
    const nextCursor = codexResumeNextCursor(listResponse)
    publishCodexPage(threads, undefined, Boolean(options.append))
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
    publishCodexPage(hydrated, undefined, Boolean(options.append))
    return { threads: hydrated, nextCursor, hasMore: nextCursor !== null }
  } finally {
    await stop()
  }
}

export async function refreshCodexResumeThreads(cwd: string, signal: AbortSignal) {
  return (await loadCodexResumeThreadsPage(cwd, signal)).threads
}

async function nextProxyMessage(transport: CodexProxyWebSocket, signal: AbortSignal) {
  while (true) {
    const value = await transport.nextMessage(signal)
    try {
      const message = object(JSON.parse(value))
      if (message) return message
    } catch {
      throw new Error("O proxy remoto retornou uma mensagem incompatível.")
    }
  }
}

async function nextProxyResponse(transport: CodexProxyWebSocket, id: string, signal: AbortSignal) {
  while (true) {
    const message = await nextProxyMessage(transport, signal)
    if (message.id === id) return message
  }
}

async function hydrateRemoteCodexResumeThreads(
  transport: CodexProxyWebSocket,
  threads: readonly CodexResumeThread[],
  profileId: string,
  signal: AbortSignal,
) {
  const pending = new Map<string, number>()
  const responses = new Map<number, string>()
  for (const [index, thread] of threads.entries()) {
    const id = `tuiminal-remote-resume-turns:${profileId}:${index}`
    pending.set(id, index)
    await transport.send(resumeTurnsFrame(id, thread.id))
  }
  while (pending.size > 0) {
    const message = await nextProxyMessage(transport, signal)
    if (typeof message.id !== "string") continue
    const index = pending.get(message.id)
    if (index === undefined) continue
    pending.delete(message.id)
    responses.set(index, codexResumeLastResponse(message))
  }
  return threads.map((thread, index) => ({
    ...thread,
    lastResponse: responses.get(index) ?? "",
  }))
}

type RemoteCodexResumePageOptions = CodexResumePageOptions & {
  executable?: readonly string[]
}

/** Loads the active SSH host's recent threads without opening a visible Codex pane. */
export async function loadRemoteCodexResumeThreadsPage(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  options: RemoteCodexResumePageOptions = {},
): Promise<AgentResumePage<CodexResumeThread>> {
  signal.throwIfAborted()
  const sshCommand = remoteCodexAppServerSshCommand(profile, "/")
  const command = options.executable ? [...options.executable, ...sshCommand.slice(1)] : sshCommand
  const server = Bun.spawn(command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  })
  const proxyProcess = server as unknown as CodexProxyProcess
  let transport: CodexProxyWebSocket | null = null
  let stopping: Promise<void> | null = null
  let unregister: () => void = () => undefined
  const stop = () => {
    if (stopping) return stopping
    stopping = (async () => {
      try {
        if (transport) transport.stop()
        else {
          try {
            proxyProcess.stdin.end()
          } catch {
            // The SSH proxy may have already closed stdin while connecting.
          }
        }
        if (server.exitCode === null) server.kill()
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
    transport = await CodexProxyWebSocket.connect(proxyProcess, deadline)
    const initializeId = `tuiminal-remote-resume-initialize:${profile.id}`
    await transport.send(
      JSON.stringify({
        id: initializeId,
        method: "initialize",
        params: {
          clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
          capabilities: null,
        },
      }),
    )
    await nextProxyResponse(transport, initializeId, deadline)
    await transport.send(JSON.stringify({ method: "initialized", params: {} }))
    const listId = `tuiminal-remote-resume-list:${profile.id}`
    await transport.send(resumeListFrame(listId, options))
    const listResponse = await nextProxyResponse(transport, listId, deadline)
    const threads = codexResumeThreads(listResponse, profile.id, profile.name)
    const nextCursor = codexResumeNextCursor(listResponse)
    publishCodexPage(threads, profile.id, Boolean(options.append))
    const hydrated = await hydrateRemoteCodexResumeThreads(transport, threads, profile.id, deadline)
    deadline.throwIfAborted()
    publishCodexPage(hydrated, profile.id, Boolean(options.append))
    return { threads: hydrated, nextCursor, hasMore: nextCursor !== null }
  } finally {
    signal.removeEventListener("abort", abort)
    deadline?.removeEventListener("abort", abortDeadline)
    await stop()
  }
}

export async function refreshRemoteCodexResumeThreads(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  options: Pick<RemoteCodexResumePageOptions, "executable"> = {},
) {
  return (await loadRemoteCodexResumeThreadsPage(profile, signal, options)).threads
}
