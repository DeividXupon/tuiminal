import { statSync } from "node:fs"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePage,
} from "../model/agent-resume-thread"
import {
  mergeOpenCodeResumeThreads,
  openCodeResumeThreadsSnapshot,
  upsertOpenCodeResumeThread,
} from "../model/opencode-resume-threads"
import type { RemoteCodexTarget } from "../model/sessions"
import type { OpenCodeObserverEvents } from "./opencode-api"
import { openCodeResumeThreads } from "./opencode-api"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import { OpenCodeObserver } from "./opencode-observer"
import { openCodeTuiCommand, openCodeTuiConfigContent } from "./opencode-protocol"
import { refreshOpenCodeThreadsFromServer } from "./opencode-resume-hydration"
import { openCodeResumePageWithFallback } from "./opencode-resume-page"
import {
  interruptOpenCodeSession,
  retireCreatedOpenCodeServer,
  startOpenCodeServerConnection,
} from "./opencode-server-connection"
import { listOpenCodeResumeSessions } from "./opencode-session-list"
import { createOpenCodeTuiControl } from "./opencode-tui-control"
import { preflightLocalOpenCode, preflightRemoteOpenCode } from "./remote-opencode-compatibility"
import { type TermAgentsProcessHandle, startTermAgentsProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

type TerminalOptions = Parameters<typeof startTermAgentsProcess>[1]
type OpenCodeTerminalOptions = TerminalOptions & {
  resumeThreadId?: string
  remote?: RemoteCodexTarget
}

/** Runs the official OpenCode TUI against a Tuiminal-owned, observable server. */
export async function startOpenCodeServerTerminal(
  options: OpenCodeTerminalOptions,
  events: OpenCodeObserverEvents,
  signal: AbortSignal,
): Promise<TermAgentsProcessHandle> {
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
  let terminal: TermAgentsProcessHandle | null = null
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
    const ownedTerminal = startTermAgentsProcess(command, {
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

async function withTemporaryOpenCodeServerPage(
  directory: string,
  signal: AbortSignal,
  remote: RemoteCodexTarget | undefined,
  requestedMaximum: number,
): Promise<AgentResumePage> {
  const maximum = Math.max(1, Math.min(AGENT_RESUME_SOURCE_LIMIT, Math.floor(requestedMaximum)))
  const previous = new Map(
    openCodeResumeThreadsSnapshot()
      .filter((thread) => thread.remoteProfileId === remote?.profile.id)
      .map((thread) => [thread.id, thread]),
  )
  const listedSessions = await listOpenCodeResumeSessions(
    directory,
    signal,
    remote,
    maximum + 1,
  ).catch(() => undefined)
  signal.throwIfAborted()
  const boundedSessions = listedSessions?.slice(0, maximum)
  const remoteSource = remote ? { id: remote.profile.id, name: remote.profile.name } : undefined
  const listedThreads = boundedSessions
    ? openCodeResumeThreads(boundedSessions, remoteSource, maximum).map((thread) => {
        return { ...thread, lastResponse: previous.get(thread.id)?.lastResponse ?? "" }
      })
    : []
  if (boundedSessions) mergeOpenCodeResumeThreads(listedThreads, remote?.profile.id)
  const hydrateIds = new Set(
    listedThreads
      .filter(
        (thread) => !thread.lastResponse || previous.get(thread.id)?.updatedAt !== thread.updatedAt,
      )
      .map((thread) => thread.id),
  )
  const listedPage = boundedSessions
    ? {
        threads: listedThreads,
        nextCursor: null,
        hasMore: (listedSessions?.length ?? 0) > maximum,
      }
    : undefined
  if (listedPage && hydrateIds.size === 0) {
    return listedPage
  }
  // Once the list is usable, optional compatibility/server/history work gets one
  // short shared budget rather than extending the loading state per conversation.
  const detailSignal = listedPage ? AbortSignal.any([signal, AbortSignal.timeout(1_500)]) : signal
  const compatibilityPromise = remote
    ? preflightRemoteOpenCode(remote.profile, detailSignal)
    : preflightLocalOpenCode(detailSignal)
  let compatibility: Awaited<typeof compatibilityPromise>
  try {
    compatibility = await compatibilityPromise
  } catch (error) {
    return openCodeResumePageWithFallback(signal, listedPage, () => Promise.reject(error))
  }
  let server: Awaited<ReturnType<typeof startOpenCodeServerConnection>>
  try {
    server = await startOpenCodeServerConnection(
      directory,
      remote,
      detailSignal,
      compatibility.remoteVersion ?? "",
    )
  } catch (error) {
    return openCodeResumePageWithFallback(signal, listedPage, () => Promise.reject(error))
  }
  const stop = () => retireCreatedOpenCodeServer(server)
  const unregister = registerTerminalResource({ stop })
  try {
    return await openCodeResumePageWithFallback(signal, listedPage, async () => {
      const threads = await refreshOpenCodeThreadsFromServer(
        server.baseUrl,
        directory,
        detailSignal,
        server.protocol,
        server.authorization,
        remote ? { id: remote.profile.id, name: remote.profile.name } : undefined,
        boundedSessions,
        maximum,
        boundedSessions ? hydrateIds : undefined,
      )
      return {
        threads,
        nextCursor: null,
        hasMore: listedSessions ? listedSessions.length > maximum : threads.length >= maximum,
      }
    })
  } finally {
    try {
      await stop()
    } finally {
      unregister()
    }
  }
}

export function loadOpenCodeResumeThreadsPage(
  directory: string,
  signal: AbortSignal,
  maximum = AGENT_RESUME_PAGE_SIZE,
) {
  return withTemporaryOpenCodeServerPage(directory, signal, undefined, maximum)
}

export async function refreshOpenCodeResumeThreads(directory: string, signal: AbortSignal) {
  return (await loadOpenCodeResumeThreadsPage(directory, signal)).threads
}

export function loadRemoteOpenCodeResumeThreadsPage(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
  maximum = AGENT_RESUME_PAGE_SIZE,
) {
  const remote = { profile, workingDirectory: "/" }
  return withTemporaryOpenCodeServerPage("/", signal, remote, maximum)
}

export async function refreshRemoteOpenCodeResumeThreads(
  profile: TerminalRemoteCodexProfile,
  signal: AbortSignal,
) {
  return (await loadRemoteOpenCodeResumeThreadsPage(profile, signal)).threads
}
