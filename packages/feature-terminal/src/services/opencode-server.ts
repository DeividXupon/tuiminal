import { randomUUID } from "node:crypto"
import { statSync } from "node:fs"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { OpenCodeObserverEvents } from "./opencode-api"
import { openCodeLastResponse, openCodeResumeThreads } from "./opencode-api"
import { unusedLoopbackPort } from "./codex-app-server-connection"
import {
  mergeOpenCodeResumeThreads,
  upsertOpenCodeResumeThread,
} from "../model/opencode-resume-threads"
import type { RemoteCodexTarget } from "../model/sessions"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import { listOpenCodeSessions, OpenCodeObserver, fetchOpenCodeJson } from "./opencode-observer"
import {
  detectOpenCodeServerProtocol,
  openCodeAuthorization,
  openCodeServerEnvironment,
  openCodeTuiConfigContent,
  openCodeTuiCommand,
  type OpenCodeServerCredentials,
  type OpenCodeServerProtocol,
} from "./opencode-protocol"
import { createOpenCodeTuiControl } from "./opencode-tui-control"
import { listOpenCodeResumeSessions } from "./opencode-session-list"
import { remoteOpenCodeServerCommand } from "./remote-opencode-connection"
import { preflightRemoteOpenCode } from "./remote-opencode-compatibility"
import { type FreeTerminalProcessHandle, startFreeTerminalProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

type TerminalOptions = Parameters<typeof startFreeTerminalProcess>[1]
type OpenCodeTerminalOptions = TerminalOptions & {
  resumeThreadId?: string
  remote?: RemoteCodexTarget
}

type ServerProcess = ReturnType<typeof Bun.spawn>

async function waitForOpenCodeServer(
  baseUrl: string,
  process: Pick<ServerProcess, "exitCode">,
  signal: AbortSignal,
  remote: boolean,
  authorization?: string,
): Promise<OpenCodeServerProtocol> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    if (process.exitCode !== null) {
      if (remote && process.exitCode === 127)
        throw new Error("O OpenCode não está instalado no servidor remoto.")
      if (remote && process.exitCode === 72)
        throw new Error("Não foi possível acessar a pasta selecionada.")
      throw new Error("O servidor do OpenCode encerrou durante a inicialização.")
    }
    const protocol = await detectOpenCodeServerProtocol(
      baseUrl,
      AbortSignal.any([signal, AbortSignal.timeout(500)]),
      fetch,
      authorization,
    )
    if (protocol) return protocol
    await Bun.sleep(50)
  }
  throw new Error("O servidor do OpenCode não ficou pronto para a interface.")
}

function spawnOpenCodeServer(
  localPort: number,
  remotePort: number,
  workingDirectory: string,
  credentials: OpenCodeServerCredentials,
  remote?: RemoteCodexTarget,
) {
  const command = remote
    ? remoteOpenCodeServerCommand(remote.profile, workingDirectory, localPort, remotePort)
    : [resolveOpenCodeExecutable(), "serve", "--hostname", "127.0.0.1", "--port", String(localPort)]
  const serverProcess = Bun.spawn(command, {
    ...(remote ? {} : { cwd: workingDirectory }),
    ...(!remote
      ? {
          env: openCodeServerEnvironment(process.env, credentials),
        }
      : {}),
    stdin: remote ? "pipe" : "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  if (remote) {
    const input = serverProcess.stdin as { write(data: string): number; end(): void }
    input.write(`${credentials.password}\n`)
    input.end()
  }
  return serverProcess
}

async function stopServer(process: ServerProcess) {
  if (process.exitCode === null) process.kill()
  await process.exited.catch(() => undefined)
}

async function startOwnedOpenCodeServer(
  workingDirectory: string,
  remote: RemoteCodexTarget | undefined,
  signal: AbortSignal,
) {
  const localPort = await unusedLoopbackPort("o servidor do OpenCode")
  let remotePort = localPort
  if (remote) {
    remotePort = await unusedLoopbackPort("o servidor remoto do OpenCode")
    while (remotePort === localPort)
      remotePort = await unusedLoopbackPort("o servidor remoto do OpenCode")
  }
  const credentials = { username: "opencode", password: randomUUID() }
  const authorization = openCodeAuthorization(credentials)
  signal.throwIfAborted()
  let process: ServerProcess
  try {
    process = spawnOpenCodeServer(localPort, remotePort, workingDirectory, credentials, remote)
  } catch {
    throw new Error(
      remote
        ? "Não foi possível iniciar o OpenCode no servidor remoto."
        : "O OpenCode não está instalado nesta máquina.",
    )
  }
  const baseUrl = `http://127.0.0.1:${localPort}`
  try {
    const protocol = await waitForOpenCodeServer(
      baseUrl,
      process,
      signal,
      Boolean(remote),
      authorization,
    )
    return { baseUrl, process, protocol, credentials, authorization }
  } catch (error) {
    await stopServer(process)
    throw error
  }
}

/** Runs the official OpenCode TUI against a Tuiminal-owned, observable server. */
export async function startOpenCodeServerTerminal(
  options: OpenCodeTerminalOptions,
  events: OpenCodeObserverEvents,
  signal: AbortSignal,
): Promise<FreeTerminalProcessHandle> {
  const { resumeThreadId, remote, cwd, ...terminalOptions } = options
  const directory = remote?.workingDirectory ?? cwd ?? process.cwd()
  if (remote) await preflightRemoteOpenCode(remote.profile, signal)
  const server = await startOwnedOpenCodeServer(directory, remote, signal)
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
  const stopOwnedServer = () => {
    if (stopping) return stopping
    stopping = (async () => {
      observer.stop()
      try {
        await stopServer(server.process)
      } finally {
        unregister()
      }
    })()
    return stopping
  }
  unregister = registerTerminalResource({ stop: stopOwnedServer })
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
        void stopOwnedServer()
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
          await stopOwnedServer()
        }
      },
    }
  } catch (error) {
    await terminal?.stop().catch(() => undefined)
    await stopOwnedServer()
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
  const server = await startOwnedOpenCodeServer(directory, remote, signal)
  const stop = () => stopServer(server.process)
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
