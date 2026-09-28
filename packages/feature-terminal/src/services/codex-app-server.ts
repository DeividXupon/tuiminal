import { unusedCodexLoopbackPort, waitForCodexAppServer } from "./codex-app-server-connection"
import {
  codexAppServerUserMessage,
  codexAppServerUserMessageHistory,
} from "./codex-message-history"
import {
  type CodexAppServerEvents,
  type CodexRelay,
  createCodexRelay,
  inspectClientFrame,
  inspectUpstreamFrame,
} from "./codex-relay-observer"
import { remoteCodexAppServerSshCommand, remoteCodexTuiCommand } from "./remote-codex-connection"
import { handshakeRemoteCodex } from "./remote-codex-handshake"
import { type FreeTerminalProcessHandle, startFreeTerminalProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

export type { CodexObservedUserMessage } from "./codex-message-history"
export type { CodexAppServerEvents } from "./codex-relay-observer"
export { codexAppServerActivity, codexAppServerState } from "./codex-relay-observer"
export {
  codexResumeLastResponse,
  codexResumeThreads,
  refreshCodexResumeThreads,
  refreshRemoteCodexResumeThreads,
} from "./codex-resume"
export { codexAppServerUserMessage, codexAppServerUserMessageHistory }

type TerminalOptions = Parameters<typeof startFreeTerminalProcess>[1]
type CodexTerminalOptions = TerminalOptions & {
  resumeThreadId?: string
  remote?: {
    profile: import("../model/sessions").RemoteServerProfile
    workingDirectory: string
  }
}
type StdioAppServerProcess = {
  pid: number
  stdin: { write(value: string | Uint8Array): number | Promise<number>; end(): void }
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  exited: Promise<number>
  kill(signal?: string | number): void
}

let relaySequence = 0

/** Transparently forwards the CLI protocol and inspects only public server events. */
export function startCodexAppServerRelay(url: string, events: CodexAppServerEvents) {
  relaySequence += 1
  const relayId = relaySequence
  const relays = new Set<CodexRelay>()
  const server = Bun.serve<CodexRelay>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const relay = createCodexRelay()
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
          relay.sendUpstream = (value) => upstream.send(value)
          for (const message of relay.pending) relay.sendUpstream(message)
          relay.pending.length = 0
        })
        upstream.addEventListener("message", (event) => {
          const value = String(event.data)
          const internalResponse = inspectUpstreamFrame(value, relay, events, relayId)
          if (!relay.closing && !internalResponse) client.send(value)
        })
        upstream.addEventListener("close", () => {
          relay.sendUpstream = null
          if (!relay.closing) events.onError("Codex app-server desconectou.")
          client.close()
        })
      },
      message(client, message) {
        const relay = client.data
        const value = String(message)
        inspectClientFrame(value, relay, events, relayId)
        if (relay.sendUpstream) relay.sendUpstream(value)
        else if (relay.pending.length < 16) relay.pending.push(value)
        else client.close(1013, "Codex app-server unavailable")
      },
      close(client) {
        const relay = client.data
        relay.closing = true
        relay.sendUpstream = null
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

async function drainStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  try {
    while (!(await reader.read()).done) {
      // Draining stderr prevents a verbose SSH process from blocking on its pipe.
    }
  } finally {
    reader.releaseLock()
  }
}

function writeStdioFrame(
  process: StdioAppServerProcess,
  value: string,
  events: CodexAppServerEvents,
) {
  try {
    void Promise.resolve(process.stdin.write(`${value}\n`)).catch(() =>
      events.onError("Não foi possível enviar dados ao Codex remoto."),
    )
  } catch {
    events.onError("Não foi possível enviar dados ao Codex remoto.")
  }
}

function forwardStdioLine(
  value: string,
  relay: CodexRelay,
  events: CodexAppServerEvents,
  relayId: number,
  downstream: { send: ((value: string) => void) | null },
) {
  if (!value) return
  try {
    const message = JSON.parse(value)
    if (!message || typeof message !== "object" || Array.isArray(message)) return
  } catch {
    return
  }
  const internalResponse = inspectUpstreamFrame(value, relay, events, relayId)
  if (!internalResponse) downstream.send?.(value)
}

async function forwardStdioOutput(
  process: StdioAppServerProcess,
  relay: CodexRelay,
  events: CodexAppServerEvents,
  relayId: number,
  downstream: {
    send: ((value: string) => void) | null
    close: ((code?: number, reason?: string) => void) | null
  },
) {
  const reader = process.stdout.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  try {
    while (!relay.closing) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffered += decoder.decode(chunk.value, { stream: true })
      if (buffered.length > 16 * 1024 * 1024)
        throw new Error("A resposta remota do Codex excedeu o limite permitido.")
      const lines = buffered.split("\n")
      buffered = lines.pop() ?? ""
      for (const line of lines)
        forwardStdioLine(line.replace(/\r$/, ""), relay, events, relayId, downstream)
    }
  } catch (error) {
    if (!relay.closing) events.onError(error instanceof Error ? error.message : String(error))
  } finally {
    reader.releaseLock()
    if (!relay.closing) {
      events.onError("Codex app-server remoto desconectou.")
      downstream.close?.(1011, "Remote Codex app-server disconnected")
    }
  }
}

/** Bridges the remote JSONL stdio transport to the local official Codex TUI. */
function startCodexStdioRelay(
  process: StdioAppServerProcess,
  events: CodexAppServerEvents,
  remoteProfileId: string,
  remoteProfileName: string,
) {
  relaySequence += 1
  const relayId = relaySequence
  const downstream: {
    send: ((value: string) => void) | null
    close: ((code?: number, reason?: string) => void) | null
  } = { send: null, close: null }
  const relay = createCodexRelay({ id: remoteProfileId, name: remoteProfileName })
  relay.sendUpstream = (value) => writeStdioFrame(process, value, events)
  const server = Bun.serve<CodexRelay>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (downstream.send || !server.upgrade(request, { data: relay }))
        return new Response("WebSocket unavailable", { status: 409 })
      return undefined
    },
    websocket: {
      open(socket) {
        downstream.send = (value) => socket.send(value)
        downstream.close = (code, reason) => socket.close(code, reason)
      },
      message(_socket, message) {
        const value = String(message)
        inspectClientFrame(value, relay, events, relayId)
        relay.sendUpstream?.(value)
      },
      close() {
        downstream.send = null
        downstream.close = null
      },
    },
  })
  void drainStream(process.stderr).catch(() => undefined)
  void forwardStdioOutput(process, relay, events, relayId, downstream)
  return {
    url: `ws://127.0.0.1:${server.port}`,
    stop() {
      relay.closing = true
      relay.sendUpstream = null
      downstream.close?.()
      server.stop(true)
      downstream.send = null
      downstream.close = null
    },
  }
}

async function startRemoteCodexAppServerTerminal(
  options: CodexTerminalOptions & { remote: NonNullable<CodexTerminalOptions["remote"]> },
  events: CodexAppServerEvents,
  signal: AbortSignal,
): Promise<FreeTerminalProcessHandle> {
  signal.throwIfAborted()
  const { remote, resumeThreadId, cwd: _localCwd, ...terminalOptions } = options
  void _localCwd
  await handshakeRemoteCodex(remote.profile, remote.workingDirectory, signal)
  signal.throwIfAborted()
  const server = Bun.spawn(
    remoteCodexAppServerSshCommand(remote.profile, remote.workingDirectory),
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  ) as unknown as StdioAppServerProcess
  const relay = startCodexStdioRelay(server, events, remote.profile.id, remote.profile.name)
  let stopping: Promise<void> | null = null
  const stopServer = () => {
    if (stopping) return stopping
    stopping = (async () => {
      relay.stop()
      try {
        server.stdin.end()
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
    signal.throwIfAborted()
    const command = remoteCodexTuiCommand(relay.url, remote.workingDirectory, resumeThreadId)
    const ownedTerminal = startFreeTerminalProcess(command, {
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

/** One owned app-server backs one official Codex TUI; Tuiminal only observes it. */
export async function startCodexAppServerTerminal(
  options: CodexTerminalOptions,
  events: CodexAppServerEvents,
  signal: AbortSignal,
): Promise<FreeTerminalProcessHandle> {
  if (options.remote)
    return startRemoteCodexAppServerTerminal(
      options as CodexTerminalOptions & { remote: NonNullable<CodexTerminalOptions["remote"]> },
      events,
      signal,
    )
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
    relay = startCodexAppServerRelay(url, events)
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
