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
import { resolveCodexExecutable } from "./codex-executable"
import { CodexProxyWebSocket } from "./codex-proxy-websocket"
import { createRemoteCodexAppServerLaunch, remoteCodexTuiCommand } from "./remote-codex-connection"
import { preflightRemoteCodex } from "./remote-codex-handshake"
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
  exitCode: number | null
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

function forwardProxyMessage(
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

/** Bridges the daemon's WebSocket through the raw SSH proxy to the local official Codex TUI. */
async function startCodexProxyRelay(
  process: StdioAppServerProcess,
  events: CodexAppServerEvents,
  remoteProfileId: string,
  remoteProfileName: string,
  signal: AbortSignal,
) {
  relaySequence += 1
  const relayId = relaySequence
  const downstream: {
    send: ((value: string) => void) | null
    close: ((code?: number, reason?: string) => void) | null
  } = { send: null, close: null }
  const relay = createCodexRelay({ id: remoteProfileId, name: remoteProfileName })
  const disconnected = (message: string) => {
    if (relay.closing) return
    events.onError(message)
    downstream.close?.(1011, "Remote Codex app-server disconnected")
  }
  const transport = await CodexProxyWebSocket.connect(process, signal, {
    onMessage(value) {
      forwardProxyMessage(value, relay, events, relayId, downstream)
    },
    onError(error) {
      disconnected(error.message)
    },
    onClose() {
      disconnected("Codex app-server remoto desconectou.")
    },
  })
  relay.sendUpstream = (value) => void transport.send(value)
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
  return {
    url: `ws://127.0.0.1:${server.port}`,
    stop() {
      relay.closing = true
      relay.sendUpstream = null
      transport.stop()
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
  await preflightRemoteCodex(remote.profile, remote.workingDirectory, signal)
  signal.throwIfAborted()
  const launch = createRemoteCodexAppServerLaunch(remote.profile, remote.workingDirectory)
  const server = Bun.spawn(launch.proxyCommand, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  }) as unknown as StdioAppServerProcess
  let relay: Awaited<ReturnType<typeof startCodexProxyRelay>>
  try {
    relay = await startCodexProxyRelay(
      server,
      events,
      remote.profile.id,
      remote.profile.name,
      signal,
    )
  } catch (error) {
    if (server.exitCode === null) server.kill()
    await server.exited
    throw error
  }
  let stopping: Promise<void> | null = null
  const stopServer = () => {
    if (stopping) return stopping
    stopping = (async () => {
      relay.stop()
      try {
        if (server.exitCode === null) server.kill()
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
    const command = remoteCodexTuiCommand(
      relay.url,
      remote.workingDirectory,
      resumeThreadId,
      resolveCodexExecutable(),
    )
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
  const codexExecutable = resolveCodexExecutable()
  const server = Bun.spawn([codexExecutable, "app-server", "--listen", url], {
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
      ? [codexExecutable, "resume", options.resumeThreadId, "--remote", relay.url]
      : [codexExecutable, "--remote", relay.url]
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
