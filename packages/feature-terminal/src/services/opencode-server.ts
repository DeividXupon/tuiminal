import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { OpenCodeObserverEvents } from "./opencode-api"
import { openCodeLastResponse, openCodeResumeThreads, parseOpenCodeSessions } from "./opencode-api"
import { unusedLoopbackPort } from "./codex-app-server-connection"
import {
  publishOpenCodeResumeThreads,
  upsertOpenCodeResumeThread,
} from "../model/opencode-resume-threads"
import type { RemoteCodexTarget } from "../model/sessions"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import { listOpenCodeSessions, OpenCodeObserver, fetchOpenCodeJson } from "./opencode-observer"
import {
  detectOpenCodeServerProtocol,
  openCodeCliProtocol,
  openCodeTuiCommand,
  type OpenCodeServerProtocol,
} from "./opencode-protocol"
import {
  remoteOpenCodeServerCommand,
  remoteOpenCodeSessionListCommand,
} from "./remote-opencode-connection"
import { type FreeTerminalProcessHandle, startFreeTerminalProcess } from "./terminal"
import { registerTerminalResource } from "./terminal-resources"

type TerminalOptions = Parameters<typeof startFreeTerminalProcess>[1]
type OpenCodeTerminalOptions = TerminalOptions & {
  resumeThreadId?: string
  remote?: RemoteCodexTarget
}

type ServerProcess = ReturnType<typeof Bun.spawn>

export function openCodeServerEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] =>
        entry[0] !== "OPENCODE_SERVER_PASSWORD" && typeof entry[1] === "string",
    ),
  )
}

async function waitForOpenCodeServer(
  baseUrl: string,
  process: Pick<ServerProcess, "exitCode">,
  signal: AbortSignal,
  remote: boolean,
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
    )
    if (protocol) return protocol
    await Bun.sleep(50)
  }
  throw new Error("O servidor do OpenCode não ficou pronto para a interface.")
}

function spawnOpenCodeServer(port: number, workingDirectory: string, remote?: RemoteCodexTarget) {
  const command = remote
    ? remoteOpenCodeServerCommand(remote.profile, workingDirectory, port)
    : [resolveOpenCodeExecutable(), "serve", "--hostname", "127.0.0.1", "--port", String(port)]
  return Bun.spawn(command, {
    ...(remote ? {} : { cwd: workingDirectory }),
    ...(!remote
      ? {
          env: openCodeServerEnvironment(),
        }
      : {}),
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
}

async function stopServer(process: ServerProcess) {
  if (process.exitCode === null) process.kill()
  await process.exited.catch(() => undefined)
}

async function detectOpenCodeCliProtocol(executable: string, signal: AbortSignal) {
  const timeout = AbortSignal.timeout(5_000)
  const boundedSignal = AbortSignal.any([signal, timeout])
  const child = Bun.spawn([executable, "--version"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stop = () => child.kill()
  boundedSignal.addEventListener("abort", stop, { once: true })
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedOutput(child.stdout as ReadableStream<Uint8Array>, 64 * 1024),
      readBoundedOutput(child.stderr as ReadableStream<Uint8Array>, 64 * 1024),
    ])
    if (code !== 0) return null
    return openCodeCliProtocol(`${stdout}\n${stderr}`)
  } finally {
    boundedSignal.removeEventListener("abort", stop)
    if (child.exitCode === null) child.kill()
  }
}

async function startOwnedOpenCodeServer(
  workingDirectory: string,
  remote: RemoteCodexTarget | undefined,
  signal: AbortSignal,
) {
  const port = await unusedLoopbackPort("o servidor do OpenCode")
  signal.throwIfAborted()
  let process: ServerProcess
  try {
    process = spawnOpenCodeServer(port, workingDirectory, remote)
  } catch {
    throw new Error(
      remote
        ? "Não foi possível iniciar o OpenCode no servidor remoto."
        : "O OpenCode não está instalado nesta máquina.",
    )
  }
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    const protocol = await waitForOpenCodeServer(baseUrl, process, signal, Boolean(remote))
    return { baseUrl, process, protocol }
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
  const server = await startOwnedOpenCodeServer(directory, remote, signal)
  const executable = resolveOpenCodeExecutable()
  const cliProtocol = remote
    ? ((await detectOpenCodeCliProtocol(executable, signal).catch(() => null)) ?? server.protocol)
    : server.protocol
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
  )
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
    const command = openCodeTuiCommand(
      executable,
      server.baseUrl,
      directory,
      resumeThreadId,
      cliProtocol,
    )
    const ownedTerminal = startFreeTerminalProcess(command, {
      ...terminalOptions,
      cwd: remote ? process.cwd() : directory,
      env: { ...terminalOptions.env, OPENCODE_SERVER_PASSWORD: undefined },
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
  remote?: { id: string; name: string },
  listedSessions?: Awaited<ReturnType<typeof listOpenCodeSessions>>,
) {
  const sessions =
    listedSessions ?? (await listOpenCodeSessions(baseUrl, directory, signal, protocol))
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
  publishOpenCodeResumeThreads(hydrated, remote?.id)
  return hydrated
}

async function readBoundedOutput(stream: ReadableStream<Uint8Array>, maximumBytes: number) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let remaining = maximumBytes
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (chunk.value.byteLength > remaining)
        throw new Error("A lista de sessões do OpenCode excedeu o limite seguro.")
      remaining -= chunk.value.byteLength
      output += decoder.decode(chunk.value, { stream: true })
    }
    return output + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

async function listOpenCodeResumeSessions(
  directory: string,
  signal: AbortSignal,
  remote?: RemoteCodexTarget,
) {
  signal.throwIfAborted()
  const timeout = AbortSignal.timeout(15_000)
  const boundedSignal = AbortSignal.any([signal, timeout])
  const command = remote
    ? remoteOpenCodeSessionListCommand(remote.profile)
    : [resolveOpenCodeExecutable(), "session", "list", "--format", "json", "--max-count", "20"]
  const child = Bun.spawn(command, {
    ...(remote ? {} : { cwd: directory }),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stop = () => child.kill()
  boundedSignal.addEventListener("abort", stop, { once: true })
  try {
    const [code, stdout] = await Promise.all([
      child.exited,
      readBoundedOutput(child.stdout as ReadableStream<Uint8Array>, 2 * 1024 * 1024),
      readBoundedOutput(child.stderr as ReadableStream<Uint8Array>, 64 * 1024),
    ])
    if (!signal.aborted && timeout.aborted)
      throw new Error("A listagem de sessões do OpenCode excedeu o tempo limite.")
    signal.throwIfAborted()
    if (code !== 0) throw new Error("Não foi possível listar as sessões do OpenCode.")
    return parseOpenCodeSessions(JSON.parse(stdout))
  } finally {
    boundedSignal.removeEventListener("abort", stop)
    if (child.exitCode === null) child.kill()
  }
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
      remote ? { id: remote.profile.id, name: remote.profile.name } : undefined,
      listedSessions,
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
