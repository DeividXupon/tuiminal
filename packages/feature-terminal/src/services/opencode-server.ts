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

async function refreshOpenCodeThreadsFromServer(
  baseUrl: string,
  directory: string,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
  authorization: string | undefined,
  remote?: { id: string; name: string },
  listedSessions?: Awaited<ReturnType<typeof listOpenCodeSessions>>,
  maximum = AGENT_RESUME_PAGE_SIZE,
  hydrateIds?: ReadonlySet<string>,
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
  const threads = openCodeResumeThreads(sessions, remote, maximum)
  const previous = new Map(
    openCodeResumeThreadsSnapshot()
      .filter((thread) => thread.remoteProfileId === remote?.id)
      .map((thread) => [thread.id, thread]),
  )
  const summaries = threads.map((thread) => ({
    ...thread,
    lastResponse: previous.get(thread.id)?.lastResponse ?? thread.lastResponse,
  }))
  mergeOpenCodeResumeThreads(summaries, remote?.id)
  const hydrated = []
  const pending = hydrateIds ? summaries.filter((thread) => hydrateIds.has(thread.id)) : summaries
  for (let offset = 0; offset < pending.length; offset += 6) {
    const batch = await Promise.all(
      pending.slice(offset, offset + 6).map(async (thread) => {
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
    mergeOpenCodeResumeThreads(batch, remote?.id)
  }
  const hydratedById = new Map(hydrated.map((thread) => [thread.id, thread]))
  return summaries.map((thread) => hydratedById.get(thread.id) ?? thread)
}

async function withTemporaryOpenCodeServer(
  directory: string,
  signal: AbortSignal,
  remote?: RemoteCodexTarget,
): Promise<AgentResumePage> {
  const maximum = AGENT_RESUME_PAGE_SIZE
  return withTemporaryOpenCodeServerPage(directory, signal, remote, maximum)
}

async function withTemporaryOpenCodeServerPage(
  directory: string,
  signal: AbortSignal,
  remote: RemoteCodexTarget | undefined,
  requestedMaximum: number,
): Promise<AgentResumePage> {
  const maximum = Math.max(1, Math.min(AGENT_RESUME_SOURCE_LIMIT, Math.floor(requestedMaximum)))
  const previousIds = new Set(
    openCodeResumeThreadsSnapshot()
      .filter((thread) => thread.remoteProfileId === remote?.profile.id)
      .map((thread) => thread.id),
  )
  const listPromise = listOpenCodeResumeSessions(directory, signal, remote, maximum + 1).catch(
    () => undefined,
  )
  const preflightController = new AbortController()
  const preflightSignal = AbortSignal.any([signal, preflightController.signal])
  const compatibilityPromise = remote
    ? preflightRemoteOpenCode(remote.profile, preflightSignal)
    : preflightLocalOpenCode(preflightSignal)
  void compatibilityPromise.catch(() => undefined)
  const listedSessions = await listPromise
  const boundedSessions = listedSessions?.slice(0, maximum)
  const remoteSource = remote ? { id: remote.profile.id, name: remote.profile.name } : undefined
  const listedThreads = boundedSessions
    ? openCodeResumeThreads(boundedSessions, remoteSource, maximum).map((thread) => {
        const previous = openCodeResumeThreadsSnapshot().find(
          (candidate) =>
            candidate.id === thread.id && candidate.remoteProfileId === thread.remoteProfileId,
        )
        return { ...thread, lastResponse: previous?.lastResponse ?? "" }
      })
    : []
  if (boundedSessions) mergeOpenCodeResumeThreads(listedThreads, remote?.profile.id)
  const hydrateIds = new Set(
    listedThreads.filter((thread) => !previousIds.has(thread.id)).map((thread) => thread.id),
  )
  if (boundedSessions && hydrateIds.size === 0) {
    preflightController.abort()
    return {
      threads: listedThreads,
      nextCursor: null,
      hasMore: (listedSessions?.length ?? 0) > maximum,
    }
  }
  const compatibility = await compatibilityPromise
  const server = await startOpenCodeServerConnection(
    directory,
    remote,
    signal,
    compatibility.remoteVersion ?? "",
  )
  const stop = () => retireCreatedOpenCodeServer(server)
  const unregister = registerTerminalResource({ stop })
  try {
    const threads = await refreshOpenCodeThreadsFromServer(
      server.baseUrl,
      directory,
      signal,
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
  return (await withTemporaryOpenCodeServer(directory, signal)).threads
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
