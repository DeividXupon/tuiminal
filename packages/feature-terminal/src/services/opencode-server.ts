import { statSync } from "node:fs"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import {
  mergeOpenCodeResumeThreads,
  upsertOpenCodeResumeThread,
} from "../model/opencode-resume-threads"
import type { RemoteCodexTarget } from "../model/sessions"
import type { OpenCodeObserverEvents } from "./opencode-api"
import { openCodeLastResponse, openCodeResumeThreads } from "./opencode-api"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import { fetchOpenCodeJson, listOpenCodeSessions, OpenCodeObserver } from "./opencode-observer"
import {
  type OpenCodeServerProtocol,
  openCodeTuiCommand,
  openCodeTuiConfigContent,
} from "./opencode-protocol"
import {
  interruptOpenCodeSession,
  startOpenCodeServerConnection,
} from "./opencode-server-connection"
import { listOpenCodeResumeSessions } from "./opencode-session-list"
import { createOpenCodeTuiControl } from "./opencode-tui-control"
import { preflightLocalOpenCode, preflightRemoteOpenCode } from "./remote-opencode-compatibility"
import { type FreeTerminalProcessHandle, startFreeTerminalProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

type TerminalOptions = Parameters<typeof startFreeTerminalProcess>[1]
type OpenCodeTerminalOptions = TerminalOptions & {
  resumeThreadId?: string
  remote?: RemoteCodexTarget
}

/** Runs the official OpenCode TUI against a Tuiminal-owned, observable server. */
export async function startOpenCodeServerTerminal(
  options: OpenCodeTerminalOptions,
  events: OpenCodeObserverEvents,
  signal: AbortSignal,
): Promise<FreeTerminalProcessHandle> {
  const { resumeThreadId, remote, cwd, ...terminalOptions } = options
  const directory = remote?.workingDirectory ?? cwd ?? process.cwd()
  const compatibility = remote
    ? await preflightRemoteOpenCode(remote.profile, signal)
    : await preflightLocalOpenCode(signal)
  const server = await startOpenCodeServerConnection(
    directory,
    remote,
    signal,
    compatibility.remoteVersion ?? "",
  )
  const executable = resolveOpenCodeExecutable()
  const observer = new OpenCodeObserver(
    server.baseUrl,
    directory,
    resumeThreadId,
    {
      ...events,
      onHydrated(hydration) {
        const latest = hydration.messages.at(-1)
        upsertOpenCodeResumeThread(
          {
            id: hydration.session.id,
            title: hydration.session.title,
            preview: latest?.text ?? hydration.session.title,
            lastResponse: latest?.finalResponse ?? "",
            cwd: hydration.session.directory,
            projectName:
              hydration.session.directory
                .replace(/[\\/]+$/u, "")
                .split(/[\\/]/u)
                .at(-1) || hydration.session.directory,
            gitBranch: "",
            updatedAt: hydration.session.updatedAt,
            state:
              hydration.state === "working"
                ? "working"
                : hydration.state === "blocked"
                  ? "blocked"
                  : "idle",
            ...(remote
              ? {
                  remoteProfileId: remote.profile.id,
                  remoteProfileName: remote.profile.name,
                }
              : {}),
          },
          remote?.profile.id,
        )
        events.onHydrated?.(hydration)
      },
    },
    server.protocol,
    server.authorization,
  )
  const tuiControl = createOpenCodeTuiControl({
    onTitle: (title) => observer.observeTerminalTitle(title),
  })
  let stopping: Promise<void> | null = null
  let unregister: () => void = () => undefined
  const disconnectServer = () => {
    if (stopping) return stopping
    stopping = (async () => {
      observer.stop()
      try {
        await server.stop()
      } finally {
        unregister()
      }
    })()
    return stopping
  }
  unregister = registerTerminalResource({ stop: disconnectServer })
  let terminal: FreeTerminalProcessHandle | null = null
  try {
    await observer.start(signal)
    signal.throwIfAborted()
    const clientDirectory =
      remote &&
      server.protocol === "v2" &&
      !statSync(directory, { throwIfNoEntry: false })?.isDirectory()
        ? undefined
        : directory
    const command = openCodeTuiCommand(
      executable,
      server.baseUrl,
      clientDirectory,
      resumeThreadId,
      server.protocol,
    )
    const ownedTerminal = startFreeTerminalProcess(command, {
      ...terminalOptions,
      cwd: remote ? process.cwd() : directory,
      env: {
        ...terminalOptions.env,
        ...(server.protocol === "v2"
          ? {
              OPENCODE_CLI_CONFIG_CONTENT: openCodeTuiConfigContent(
                terminalOptions.env?.OPENCODE_CLI_CONFIG_CONTENT ??
                  process.env.OPENCODE_CLI_CONFIG_CONTENT,
              ),
            }
          : {}),
        OPENCODE_PASSWORD: server.credentials.password,
        OPENCODE_SERVER_USERNAME: server.credentials.username,
        OPENCODE_SERVER_PASSWORD: server.credentials.password,
      },
      onData(data) {
        tuiControl.observeData(data)
        terminalOptions.onData(data)
      },
      onExit(result) {
        void disconnectServer()
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
          await disconnectServer()
        }
      },
      ...(remote
        ? {
            async close() {
              try {
                const sessionId = observer.activeSession()
                if (sessionId)
                  await interruptOpenCodeSession(
                    server.baseUrl,
                    directory,
                    sessionId,
                    server.protocol,
                    server.authorization,
                  )
              } finally {
                try {
                  await ownedTerminal.stop()
                } finally {
                  await disconnectServer()
                }
              }
            },
          }
        : {}),
    }
  } catch (error) {
    await terminal?.stop().catch(() => undefined)
    try {
      await (server.created ? server.close() : server.stop())
    } finally {
      observer.stop()
      unregister()
    }
    throw error
  }
}

async function refreshOpenCodeThreadsFromServer(
  baseUrl: string,
  directory: string,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
  authorization: string | undefined,
  remote?: { id: string; name: string },
  listedSessions?: Awaited<ReturnType<typeof listOpenCodeSessions>>,
) {
  const sessions =
    listedSessions ??
    (await listOpenCodeSessions(
      baseUrl,
      protocol === "v2" ? undefined : directory,
      signal,
      protocol,
      authorization,
    ))
  const threads = openCodeResumeThreads(sessions, remote)
  const hydrated = []
  for (let offset = 0; offset < threads.length; offset += 6) {
    const batch = await Promise.all(
      threads.slice(offset, offset + 6).map(async (thread) => {
        let lastResponse = ""
        try {
          lastResponse = openCodeLastResponse(
            await fetchOpenCodeJson(
              baseUrl,
              `${protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(thread.id)}/message`,
              protocol === "v2" ? undefined : thread.cwd || directory,
              signal,
              { limit: 20 },
              authorization,
            ),
          )
        } catch {
          // A summary remains resumable when an older server cannot hydrate messages.
        }
        return { ...thread, lastResponse }
      }),
    )
    hydrated.push(...batch)
  }
  mergeOpenCodeResumeThreads(hydrated, remote?.id)
  return hydrated
}

async function withTemporaryOpenCodeServer(
  directory: string,
  signal: AbortSignal,
  remote?: RemoteCodexTarget,
) {
  const listedSessions = await listOpenCodeResumeSessions(directory, signal, remote).catch(
    () => undefined,
  )
  const compatibility = remote
    ? await preflightRemoteOpenCode(remote.profile, signal)
    : await preflightLocalOpenCode(signal)
  const server = await startOpenCodeServerConnection(
    directory,
    remote,
    signal,
    compatibility.remoteVersion ?? "",
  )
  const stop = () => server.stop()
  const unregister = registerTerminalResource({ stop })
  try {
    return await refreshOpenCodeThreadsFromServer(
      server.baseUrl,
      directory,
      signal,
      server.protocol,
      server.authorization,
      remote ? { id: remote.profile.id, name: remote.profile.name } : undefined,
      server.protocol === "v2" ? undefined : listedSessions,
    )
  } finally {
    try {
      await stop()
    } finally {
      unregister()
    }
  }
}

export function refreshOpenCodeResumeThreads(directory: string, signal: AbortSignal) {
  return withTemporaryOpenCodeServer(directory, signal)
}

export function refreshRemoteOpenCodeResumeThreads(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
) {
  const remote = { profile, workingDirectory: "/" }
  return withTemporaryOpenCodeServer("/", signal, remote)
}
