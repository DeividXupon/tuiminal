import { randomUUID } from "node:crypto"
import { AgentOutput } from "../model/agent-output"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  type ClaudeBackgroundLaunch,
  ensureRemoteClaudeBackgroundSession,
  retireCreatedRemoteClaudeBackgroundSession,
  startRemoteClaudeBackgroundObserver,
  stopRemoteClaudeBackgroundSession,
} from "./claude-background"
import { preflightClaude } from "./claude-compatibility"
import { resolveClaudeExecutable } from "./claude-executable"
import { startClaudeHookServer } from "./claude-hook-server"
import {
  type ClaudeHookEvents,
  ClaudeHookObserver,
  claudeBackgroundSettings,
  claudeHookSettings,
} from "./claude-hooks"
import {
  claudeArguments,
  claudeVersionAtLeast,
  remoteClaudeAttachCommand,
  remoteClaudeTerminalCommand,
  remoteClaudeTunnelCommand,
  supportedClaudeBackgroundSessions,
} from "./remote-claude-connection"
import { assertRemoteSshTunnelConfiguration } from "./remote-ssh-command"
import {
  type TermAgentsExit,
  type TermAgentsProcessHandle,
  startTermAgentsProcess,
} from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

type ClaudeTerminalOptions = {
  cwd?: string
  columns?: number
  rows?: number
  resumeThreadId?: string
  remote?: RemoteCodexTarget
  onData: (data: Uint8Array) => void
  onExit: (result: TermAgentsExit) => void
}

type Tunnel = { port: number; stop: () => Promise<void> }

const MESSAGE_DISPLAY_CLAUDE_VERSION = [2, 1, 152] as const

function remoteClaudeSessionId(background: boolean, resumeThreadId?: string) {
  return background ? (resumeThreadId ?? randomUUID()) : resumeThreadId
}

async function prepareRemoteClaudeBackground(
  remote: RemoteCodexTarget | undefined,
  backgroundCapable: boolean,
  requestedSessionId: string | undefined,
  settings: string,
  resume: boolean,
  signal: AbortSignal,
) {
  if (!remote || !backgroundCapable || !requestedSessionId) return null
  return ensureRemoteClaudeBackgroundSession(
    remote,
    requestedSessionId,
    settings,
    resume,
    AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  )
}

function observeRemoteClaudeBackground(
  remote: RemoteCodexTarget | undefined,
  session: ClaudeBackgroundLaunch | null,
  events: ClaudeHookEvents,
  signal: AbortSignal,
) {
  return remote && session
    ? startRemoteClaudeBackgroundObserver(remote, session.sessionId, events, signal)
    : null
}

export function remoteClaudeClose(
  remote: RemoteCodexTarget | undefined,
  session: ClaudeBackgroundLaunch | null,
  owned: TermAgentsProcessHandle,
  cleanup: () => Promise<void>,
  stopSession: (
    target: RemoteCodexTarget,
    sessionId: string,
    knownShortId?: string,
  ) => Promise<void> = stopRemoteClaudeBackgroundSession,
): Pick<TermAgentsProcessHandle, "cancelLaunch" | "close" | "retainCloseAfterExit"> {
  if (!remote || !session) return {}
  let detaching: Promise<void> | null = null
  let closing: Promise<void> | null = null
  const detach = () => {
    if (detaching) return detaching
    detaching = (async () => {
      try {
        await owned.stop()
      } finally {
        await cleanup()
      }
    })()
    return detaching
  }
  const close = () => {
    if (closing) return closing
    closing = detach()
      .finally(() => stopSession(remote, session.sessionId, session.shortId))
      .catch((error: unknown) => {
        closing = null
        throw error
      })
    return closing
  }
  return {
    retainCloseAfterExit: true,
    cancelLaunch: session.created ? close : detach,
    close,
  }
}

export async function retireFailedClaudeTerminalLaunch(
  terminal: TermAgentsProcessHandle | null,
  cleanup: () => Promise<void>,
  remote: RemoteCodexTarget | undefined,
  backgroundSession: ClaudeBackgroundLaunch | null,
  stopSession: (
    target: RemoteCodexTarget,
    sessionId: string,
    knownShortId?: string,
  ) => Promise<void> = stopRemoteClaudeBackgroundSession,
) {
  await terminal?.stop().catch(() => undefined)
  try {
    await cleanup()
  } finally {
    if (remote && backgroundSession)
      await retireCreatedRemoteClaudeBackgroundSession(remote, backgroundSession, stopSession)
  }
}

function claudeTerminalCommand(
  executable: string,
  remote: RemoteCodexTarget | undefined,
  directory: string,
  settings: string,
  backgroundShortId: string | undefined,
  resumeThreadId: string | undefined,
  persistentRemote: boolean,
) {
  if (!remote) return [executable, ...claudeArguments(settings, resumeThreadId)]
  if (!persistentRemote)
    return remoteClaudeTerminalCommand(remote.profile, directory, settings, resumeThreadId)
  if (!backgroundShortId) throw new Error("A sessão remota do Claude Code é inválida.")
  return remoteClaudeAttachCommand(remote.profile, directory, backgroundShortId)
}

async function startRemoteTunnel(
  remote: RemoteCodexTarget,
  localPort: number,
  signal: AbortSignal,
): Promise<Tunnel> {
  await assertRemoteSshTunnelConfiguration(remote.profile, signal)
  signal.throwIfAborted()
  const process = Bun.spawn(remoteClaudeTunnelCommand(remote.profile, localPort), {
    env: { ...Bun.env, LANG: "C", LC_ALL: "C" },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  })
  const reader = (process.stderr as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let output = ""
  let stopped = false
  const stop = async () => {
    if (!stopped) {
      stopped = true
      if (process.exitCode === null) process.kill()
    }
    await process.exited.catch(() => undefined)
  }
  const abort = () => void stop()
  signal.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(() => {
    void stop()
  }, 10_000)
  try {
    while (output.length < 64 * 1024) {
      const chunk = await reader.read()
      if (chunk.done) break
      output += decoder.decode(chunk.value, { stream: true })
      const allocated = output.match(/Allocated port (\d+) for remote forward/iu)
      if (allocated) {
        clearTimeout(timer)
        const port = Number(allocated[1])
        void (async () => {
          try {
            while (!(await reader.read()).done) {
              // Keep verbose SSH stderr drained for the tunnel lifetime.
            }
          } catch {
            /* Tunnel shutdown closes the stream. */
          } finally {
            reader.releaseLock()
          }
        })()
        return {
          port,
          async stop() {
            signal.removeEventListener("abort", abort)
            await stop()
          },
        }
      }
    }
    throw new Error(
      output.toLowerCase().includes("remote port forwarding failed")
        ? "O servidor SSH recusou o túnel necessário para observar o Claude Code."
        : "Não foi possível abrir o túnel do Claude Code pelo SSH.",
    )
  } catch (error) {
    await stop()
    reader.releaseLock()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function startClaudeHooksTerminal(
  options: ClaudeTerminalOptions,
  events: ClaudeHookEvents,
  signal: AbortSignal,
): Promise<TermAgentsProcessHandle> {
  const remote = options.remote
  const directory = remote?.workingDirectory ?? options.cwd ?? process.cwd()
  const executable = resolveClaudeExecutable()
  const compatibility = await preflightClaude(
    { cwd: directory, ...(remote ? { remote } : {}) },
    signal,
  )
  const backgroundCapable = Boolean(
    remote && supportedClaudeBackgroundSessions(compatibility.remoteVersion ?? ""),
  )
  const requestedSessionId = remoteClaudeSessionId(backgroundCapable, options.resumeThreadId)
  const observer = new ClaudeHookObserver(
    {
      cwd: directory,
      ...(options.resumeThreadId ? { resumeThreadId: options.resumeThreadId } : {}),
      ...(remote
        ? {
            remoteProfileId: remote.profile.id,
            remoteProfileName: remote.profile.name,
            remoteProfileHost: remote.profile.host,
          }
        : {}),
    },
    events,
  )
  const titles = new AgentOutput()
  let titleRevision = titles.titleRevision
  let receiver: ReturnType<typeof startClaudeHookServer> | null = null
  let tunnel: Tunnel | null = null
  let backgroundObserver: ReturnType<typeof startRemoteClaudeBackgroundObserver> | null = null
  let backgroundSession: ClaudeBackgroundLaunch | null = null
  let terminal: TermAgentsProcessHandle | null = null
  let cleanupPromise: Promise<void> | null = null
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      receiver?.stop()
      try {
        await backgroundObserver?.stop()
      } finally {
        try {
          await tunnel?.stop()
        } finally {
          unregister()
        }
      }
    })()
    return cleanupPromise
  }
  const unregister = registerTerminalResource({ stop: cleanup })
  try {
    const backgroundSettings = claudeBackgroundSettings()
    backgroundSession = await prepareRemoteClaudeBackground(
      remote,
      backgroundCapable,
      requestedSessionId,
      backgroundSettings,
      Boolean(options.resumeThreadId),
      signal,
    )
    signal.throwIfAborted()
    const persistentRemote = Boolean(backgroundSession)
    let settings = backgroundSettings
    if (!persistentRemote) {
      receiver = startClaudeHookServer(observer)
      if (remote) tunnel = await startRemoteTunnel(remote, receiver.port, signal)
      signal.throwIfAborted()
      const hookUrl = tunnel ? `http://127.0.0.1:${tunnel.port}${receiver.path}` : receiver.url
      const messageDisplay = claudeVersionAtLeast(
        (remote ? compatibility.remoteVersion : compatibility.localVersion) ?? "",
        MESSAGE_DISPLAY_CLAUDE_VERSION,
      )
      settings = claudeHookSettings(hookUrl, { messageDisplay })
    }
    backgroundObserver = observeRemoteClaudeBackground(remote, backgroundSession, events, signal)
    signal.throwIfAborted()
    const command = claudeTerminalCommand(
      executable,
      remote,
      directory,
      settings,
      backgroundSession?.shortId,
      options.resumeThreadId,
      persistentRemote,
    )
    const owned = startTermAgentsProcess(command, {
      cwd: remote ? process.cwd() : directory,
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.rows === undefined ? {} : { rows: options.rows }),
      ...(persistentRemote ? { interruptOnStop: false } : {}),
      onData(data) {
        titles.write(data)
        if (titles.titleRevision !== titleRevision) {
          titleRevision = titles.titleRevision
          observer.observeTerminalTitle(titles.title)
        }
        options.onData(data)
      },
      onExit(result) {
        void cleanup()
          .catch((error: unknown) => events.onError(String(error)))
          .finally(() => options.onExit(result))
      },
    })
    terminal = owned
    return {
      ...owned,
      async stop() {
        try {
          await owned.stop()
        } finally {
          await cleanup()
        }
      },
      ...remoteClaudeClose(remote, backgroundSession, owned, cleanup),
    }
  } catch (error) {
    await retireFailedClaudeTerminalLaunch(terminal, cleanup, remote, backgroundSession)
    throw error
  }
}
