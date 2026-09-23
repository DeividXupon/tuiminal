import { createServer } from "node:net"
import {
  type CodexObservedUserMessage,
  codexAppServerUserMessage,
  codexAppServerUserMessageHistory,
} from "./codex-message-history"
import { CodexMessageHistoryObserver } from "./codex-message-history-observer"
import { type FreeTerminalProcessHandle, startFreeTerminalProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

export type { CodexObservedUserMessage }
export { codexAppServerUserMessage, codexAppServerUserMessageHistory }

type RecordValue = Record<string, unknown>
type TerminalOptions = Parameters<typeof startFreeTerminalProcess>[1]
type CodexActivity = "thinking" | "running" | "updating" | "coding" | "tooling"
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
  if (method === "item/plan/delta") return "updating"
  if (method === "item/fileChange/patchUpdated") return "coding"
  if (method !== "item/started") return null
  const item = object(object(event?.params)?.item)
  switch (item?.type) {
    case "reasoning":
      return "thinking"
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

async function unusedLoopbackPort() {
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

async function waitUntilReady(
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
  closing: boolean
}

/** Transparently forwards the CLI protocol and inspects only public server events. */
export function startCodexAppServerRelay(url: string, events: CodexAppServerEvents) {
  const relays = new Set<Relay>()
  const server = Bun.serve<Relay>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const relay: Relay = {
        upstream: null,
        pending: [],
        history: new CodexMessageHistoryObserver(),
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
          let internalHistoryResponse = false
          try {
            const message = object(JSON.parse(value))
            if (message) {
              if (typeof message.method === "string") publishObserverEvent(message, events)
              internalHistoryResponse = relay.history.observeServer(message, events, (frame) =>
                upstream.send(frame),
              )
            }
          } catch {
            // Preserve the original frame even if it cannot be inspected.
          }
          if (!relay.closing && !internalHistoryResponse) client.send(value)
        })
        upstream.addEventListener("close", () => {
          if (!relay.closing) events.onError("Codex app-server desconectou.")
          client.close()
        })
      },
      message(client, message) {
        const relay = client.data
        const value = String(message)
        try {
          const request = object(JSON.parse(value))
          if (request) relay.history.observeClient(request, events)
        } catch {
          // Preserve the original frame even if it cannot be inspected.
        }
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
  options: TerminalOptions,
  events: CodexAppServerEvents,
  signal: AbortSignal,
): Promise<FreeTerminalProcessHandle> {
  const port = await unusedLoopbackPort()
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
    await waitUntilReady(url, server, signal)
    relay = startCodexAppServerRelay(url, events)
    signal.throwIfAborted()
    const ownedTerminal = startFreeTerminalProcess(["codex", "--remote", relay.url], {
      ...options,
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
