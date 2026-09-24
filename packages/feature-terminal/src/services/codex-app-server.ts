import {
  publishCodexResumeThreads,
  updateCodexResumeThreadResponse,
} from "../model/codex-resume-threads"
import {
  type CodexObservedUserMessage,
  codexAppServerUserMessage,
  codexAppServerUserMessageHistory,
} from "./codex-message-history"
import { CodexMessageHistoryObserver } from "./codex-message-history-observer"
import {
  codexResumeThreads,
  resumeListFrame,
  unusedCodexLoopbackPort,
  waitForCodexAppServer,
} from "./codex-resume"
import { type FreeTerminalProcessHandle, startFreeTerminalProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

export {
  codexResumeLastResponse,
  codexResumeThreads,
  refreshCodexResumeThreads,
} from "./codex-resume"
export type { CodexObservedUserMessage }
export { codexAppServerUserMessage, codexAppServerUserMessageHistory }

type RecordValue = Record<string, unknown>
type TerminalOptions = Parameters<typeof startFreeTerminalProcess>[1]
type CodexTerminalOptions = TerminalOptions & { resumeThreadId?: string }
type CodexActivity = "thinking" | "writing" | "running" | "updating" | "coding" | "tooling"
type CodexState = "working" | "blocked" | "done" | "unknown"

export type CodexAppServerEvents = {
  onActivity: (activity: CodexActivity) => void
  onState: (state: CodexState) => void
  onTitle: (title: string) => void
  onUserMessage: (message: CodexObservedUserMessage) => void
  onUserMessageHistory: (messages: readonly CodexObservedUserMessage[], replace: boolean) => void
  onError: (message: string) => void
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

export function codexAppServerActivity(message: unknown): CodexActivity | null {
  const event = object(message)
  const method = event?.method
  if (method === "item/agentMessage/delta") return "writing"
  if (method === "item/plan/delta" || method === "turn/plan/updated") return "updating"
  if (method === "item/fileChange/patchUpdated") return "coding"
  if (method !== "item/started") return null
  const item = object(object(event?.params)?.item)
  switch (item?.type) {
    case "reasoning":
      return "thinking"
    case "agentMessage":
      return "writing"
    case "commandExecution":
      return "running"
    case "fileChange":
      return "coding"
    case "plan":
      return "updating"
    case "mcpToolCall":
    case "dynamicToolCall":
    case "webSearch":
    case "imageView":
      return "tooling"
    default:
      return null
  }
}

export function codexAppServerState(message: unknown): CodexState | null {
  const event = object(message)
  const method = event?.method
  const params = object(event?.params)
  if (method === "turn/started") return "working"
  if (method === "turn/completed")
    return object(params?.turn)?.status === "completed" ? "done" : "unknown"
  if (method === "thread/status/changed") {
    const status = object(params?.status)
    if (status?.type === "active")
      return Array.isArray(status.activeFlags) && status.activeFlags.includes("waitingOnApproval")
        ? "blocked"
        : "working"
  }
  if (typeof method === "string" && method.endsWith("requestApproval")) return "blocked"
  return codexAppServerActivity(message) ? "working" : null
}

function publishObserverEvent(message: RecordValue, events: CodexAppServerEvents) {
  const params = object(message.params)
  if (message.method === "thread/name/updated" && typeof params?.threadName === "string")
    events.onTitle(params.threadName)
  const state = codexAppServerState(message)
  if (state) events.onState(state)
  const activity = codexAppServerActivity(message)
  if (activity) events.onActivity(activity)
}

type Relay = {
  upstream: WebSocket | null
  pending: string[]
  history: CodexMessageHistoryObserver
  resumeRequestIds: Set<string>
  resumeRequestSequence: number
  closing: boolean
}

let relaySequence = 0

function requestResumeThreads(relay: Relay, relayId: number, cwd: string | undefined) {
  const upstream = relay.upstream
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return
  relay.resumeRequestSequence += 1
  const id = `tuiminal-resume-list:${relayId}:${relay.resumeRequestSequence}`
  relay.resumeRequestIds.add(id)
  upstream.send(resumeListFrame(id, cwd))
}

function inspectUpstreamFrame(
  value: string,
  relay: Relay,
  upstream: WebSocket,
  events: CodexAppServerEvents,
  relayId: number,
  cwd: string | undefined,
) {
  try {
    const message = object(JSON.parse(value))
    if (!message) return false
    const resumeResponse =
      typeof message.id === "string" && relay.resumeRequestIds.delete(message.id)
    if (resumeResponse) publishCodexResumeThreads(codexResumeThreads(message))
    if (message.method === "item/completed") {
      const params = object(message.params)
      const item = object(params?.item)
      if (
        typeof params?.threadId === "string" &&
        item?.type === "agentMessage" &&
        typeof item.text === "string"
      )
        updateCodexResumeThreadResponse(params.threadId, item.text)
    }
    if (typeof message.method === "string") publishObserverEvent(message, events)
    const historyResponse =
      !resumeResponse &&
      relay.history.observeServer(message, events, (frame) => upstream.send(frame))
    if (message.method === "turn/completed" || message.method === "thread/name/updated")
      requestResumeThreads(relay, relayId, cwd)
    return resumeResponse || historyResponse
  } catch {
    // Preserve the original frame even if it cannot be inspected.
    return false
  }
}

function inspectClientFrame(
  value: string,
  relay: Relay,
  events: CodexAppServerEvents,
  relayId: number,
  cwd: string | undefined,
) {
  try {
    const request = object(JSON.parse(value))
    if (!request) return
    relay.history.observeClient(request, events)
    if (request.method === "initialized")
      queueMicrotask(() => requestResumeThreads(relay, relayId, cwd))
  } catch {
    // Preserve the original frame even if it cannot be inspected.
  }
}

/** Transparently forwards the CLI protocol and inspects only public server events. */
export function startCodexAppServerRelay(url: string, events: CodexAppServerEvents, cwd?: string) {
  relaySequence += 1
  const relayId = relaySequence
  const relays = new Set<Relay>()
  const server = Bun.serve<Relay>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const relay: Relay = {
        upstream: null,
        pending: [],
        history: new CodexMessageHistoryObserver(),
        resumeRequestIds: new Set(),
        resumeRequestSequence: 0,
        closing: false,
      }
      if (server.upgrade(request, { data: relay })) {
        relays.add(relay)
        return
      }
      return new Response("WebSocket required", { status: 426 })
    },
    websocket: {
      open(client) {
        const relay = client.data
        const upstream = new WebSocket(url)
        relay.upstream = upstream
        upstream.addEventListener("open", () => {
          for (const message of relay.pending) upstream.send(message)
          relay.pending.length = 0
        })
        upstream.addEventListener("message", (event) => {
          const value = String(event.data)
          const internalResponse = inspectUpstreamFrame(
            value,
            relay,
            upstream,
            events,
            relayId,
            cwd,
          )
          if (!relay.closing && !internalResponse) client.send(value)
        })
        upstream.addEventListener("close", () => {
          if (!relay.closing) events.onError("Codex app-server desconectou.")
          client.close()
        })
      },
      message(client, message) {
        const relay = client.data
        const value = String(message)
        inspectClientFrame(value, relay, events, relayId, cwd)
        if (relay.upstream?.readyState === WebSocket.OPEN) relay.upstream.send(value)
        else if (relay.pending.length < 16) relay.pending.push(value)
        else client.close(1013, "Codex app-server unavailable")
      },
      close(client) {
        const relay = client.data
        relay.closing = true
        relay.upstream?.close()
        relays.delete(relay)
      },
    },
  })
  return {
    url: `ws://127.0.0.1:${server.port}`,
    stop() {
      for (const relay of relays) {
        relay.closing = true
        relay.upstream?.close()
      }
      server.stop(true)
      relays.clear()
    },
  }
}

/** One owned app-server backs one official Codex TUI; Tuiminal only observes it. */
export async function startCodexAppServerTerminal(
  options: CodexTerminalOptions,
  events: CodexAppServerEvents,
  signal: AbortSignal,
): Promise<FreeTerminalProcessHandle> {
  const port = await unusedCodexLoopbackPort()
  signal.throwIfAborted()
  const url = `ws://127.0.0.1:${port}`
  const server = Bun.spawn(["codex", "app-server", "--listen", url], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  let stopping: Promise<void> | null = null
  let relay: ReturnType<typeof startCodexAppServerRelay> | null = null
  const stopServer = () => {
    if (stopping) return stopping
    stopping = (async () => {
      relay?.stop()
      try {
        server.kill()
        await server.exited
      } finally {
        unregister()
      }
    })()
    return stopping
  }
  const unregister = registerTerminalResource({ stop: stopServer })
  let terminal: FreeTerminalProcessHandle | null = null
  try {
    await waitForCodexAppServer(url, server, signal)
    relay = startCodexAppServerRelay(url, events, options.cwd)
    signal.throwIfAborted()
    const terminalCommand = options.resumeThreadId
      ? ["codex", "resume", options.resumeThreadId, "--remote", relay.url]
      : ["codex", "--remote", relay.url]
    const { resumeThreadId: _resumeThreadId, ...terminalOptions } = options
    void _resumeThreadId
    const ownedTerminal = startFreeTerminalProcess(terminalCommand, {
      ...terminalOptions,
      onExit(result) {
        void stopServer()
          .catch((error: unknown) => events.onError(String(error)))
          .finally(() => options.onExit(result))
      },
    })
    terminal = ownedTerminal
    return {
      ...ownedTerminal,
      async stop() {
        try {
          await ownedTerminal.stop()
        } finally {
          await stopServer()
        }
      },
    }
  } catch (error) {
    await terminal?.stop().catch(() => undefined)
    await stopServer()
    throw error
  }
}
