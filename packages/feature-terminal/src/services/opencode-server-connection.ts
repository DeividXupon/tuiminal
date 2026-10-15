import { randomUUID } from "node:crypto"
import type { RemoteCodexTarget } from "../model/sessions"
import { readBoundedText, runBoundedCommand } from "./bounded-command"
import { unusedLoopbackPort } from "./codex-app-server-connection"
import { resolveOpenCodeExecutable } from "./opencode-executable"
import { openCodeApiUrl } from "./opencode-hydration"
import {
  detectOpenCodeServerProtocol,
  type OpenCodeServerCredentials,
  type OpenCodeServerProtocol,
  openCodeAuthorization,
  openCodeServerEnvironment,
} from "./opencode-protocol"
import {
  remoteOpenCodeServerCommand,
  remoteOpenCodeServerKey,
  remoteOpenCodeStopServerCommand,
  remoteOpenCodeTunnelCommand,
} from "./remote-opencode-connection"
import { assertRemoteSshTunnelConfiguration } from "./remote-ssh-command"

type ServerProcess = ReturnType<typeof Bun.spawn>

export type StartedOpenCodeServer = {
  baseUrl: string
  protocol: OpenCodeServerProtocol
  credentials: OpenCodeServerCredentials
  authorization: string | undefined
  created: boolean
  stop: () => Promise<void>
  close: () => Promise<void>
}

export function retireCreatedOpenCodeServer(
  server: Pick<StartedOpenCodeServer, "created" | "stop" | "close">,
) {
  return server.created ? server.close() : server.stop()
}

async function waitForOpenCodeServer(
  baseUrl: string,
  process: Pick<ServerProcess, "exitCode">,
  signal: AbortSignal,
  remote: boolean,
  authorization?: string,
): Promise<OpenCodeServerProtocol> {
  const deadline = Date.now() + 15_000
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

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function localOpenCodeServerSupervisorCommand(executable: string, localPort: number) {
  const server = `${shellQuote(executable)} serve --hostname 127.0.0.1 --port ${localPort}`
  return [
    "server_pid=",
    "watcher_pid=",
    'cleanup() { trap - EXIT HUP INT TERM; if [ -n "$watcher_pid" ]; then kill "$watcher_pid" 2>/dev/null || true; wait "$watcher_pid" 2>/dev/null || true; fi; if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi; }',
    "trap cleanup EXIT HUP INT TERM",
    "exec 3<&0",
    `${server} </dev/null &`,
    "server_pid=$!",
    '(IFS= read -r _ <&3 || true; kill "$server_pid" 2>/dev/null || true) &',
    "watcher_pid=$!",
    "exec 3<&-",
    'server_status=0; wait "$server_pid" || server_status=$?',
    "server_pid=",
    'kill "$watcher_pid" 2>/dev/null || true',
    'wait "$watcher_pid" 2>/dev/null || true',
    "watcher_pid=",
    'exit "$server_status"',
  ].join("\n")
}

function spawnLocalOpenCodeServer(
  localPort: number,
  workingDirectory: string,
  credentials: OpenCodeServerCredentials,
) {
  const executable = resolveOpenCodeExecutable()
  return Bun.spawn(
    process.platform === "win32"
      ? [executable, "serve", "--hostname", "127.0.0.1", "--port", String(localPort)]
      : ["/bin/sh", "-c", localOpenCodeServerSupervisorCommand(executable, localPort)],
    {
      cwd: workingDirectory,
      env: openCodeServerEnvironment(process.env, credentials),
      stdin: process.platform === "win32" ? "ignore" : "pipe",
      stdout: "ignore",
      stderr: "ignore",
    },
  )
}

function spawnRemoteOpenCodeTunnel(
  remote: RemoteCodexTarget,
  localPort: number,
  remotePort: number,
) {
  return Bun.spawn(remoteOpenCodeTunnelCommand(remote.profile, localPort, remotePort), {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
}

async function stopServer(process: ServerProcess) {
  if (process.exitCode === null) process.kill()
  await process.exited.catch(() => undefined)
}

export async function interruptOpenCodeSession(
  baseUrl: string,
  directory: string,
  sessionId: string,
  protocol: OpenCodeServerProtocol,
  authorization?: string,
  fetcher: typeof fetch = fetch,
) {
  const pathname = `${protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(sessionId)}/${
    protocol === "v2" ? "interrupt" : "abort"
  }`
  try {
    const response = await fetcher(
      openCodeApiUrl(baseUrl, pathname, protocol === "v1" ? directory : undefined),
      {
        method: "POST",
        ...(authorization ? { headers: { authorization } } : {}),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (response.ok || response.status === 404) return
  } catch {
    // Normalize transport and timeout failures into the pane's localized stop error.
  }
  throw new Error("Não foi possível interromper a sessão remota do OpenCode.")
}

type RemoteOpenCodeServerRecord = {
  port: number
  password: string
  created: boolean
}

class RemoteOpenCodePortError extends Error {}

function parseRemoteOpenCodeServerRecord(value: string): RemoteOpenCodeServerRecord | null {
  const match = value.match(
    /(?:^|\n)TUIMINAL_OPENCODE (\d{1,5}) ([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}) \d+ (created|reused)(?:\n|$)/iu,
  )
  if (!match) return null
  const port = Number(match[1])
  const password = match[2]
  if (!Number.isInteger(port) || port < 1024 || port > 65_535 || !password) return null
  return { port, password, created: match[3] === "created" }
}

async function ensureRemoteOpenCodeServer(
  remote: RemoteCodexTarget,
  stateKey: string,
  excludedPort: number,
  proposedPassword: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const child = Bun.spawn(
    remoteOpenCodeServerCommand(remote.profile, remote.workingDirectory, stateKey),
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  )
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
  const input = child.stdin as { write(data: string): number; end(): void }
  try {
    input.write(`${proposedPassword}\n${excludedPort}\n`)
    input.end()
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedText(child.stdout as ReadableStream<Uint8Array>, 8 * 1024),
      readBoundedText(child.stderr as ReadableStream<Uint8Array>, 8 * 1024),
    ])
    signal.throwIfAborted()
    if (exitCode === 127) throw new Error("O OpenCode não está instalado no servidor remoto.")
    if (exitCode === 72) throw new Error("Não foi possível acessar a pasta selecionada.")
    if (exitCode !== 0)
      throw exitCode === 75
        ? new RemoteOpenCodePortError(
            "O servidor remoto do OpenCode não conseguiu reservar uma porta de loopback.",
          )
        : new Error(stderr.trim() || "Não foi possível iniciar o OpenCode no servidor remoto.")
    const record = parseRemoteOpenCodeServerRecord(stdout)
    if (!record) throw new Error("O servidor remoto do OpenCode retornou metadados inválidos.")
    return record
  } finally {
    signal.removeEventListener("abort", stop)
    if (child.exitCode === null) child.kill()
  }
}

async function stopRemoteOpenCodeServer(
  remote: RemoteCodexTarget,
  stateKey: string,
  signal: AbortSignal = AbortSignal.timeout(15_000),
) {
  const result = await runBoundedCommand(
    remoteOpenCodeStopServerCommand(remote.profile, remote.workingDirectory, stateKey),
    signal,
  )
  if (result.exitCode !== 0)
    throw new Error("Não foi possível encerrar o servidor remoto do OpenCode.")
}

async function startRemoteOpenCodeServer(
  workingDirectory: string,
  remote: RemoteCodexTarget,
  version: string,
  signal: AbortSignal,
): Promise<StartedOpenCodeServer> {
  const stateKey = remoteOpenCodeServerKey(workingDirectory, version)
  await assertRemoteSshTunnelConfiguration(remote.profile, signal)
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    let localPort = await unusedLoopbackPort("o servidor do OpenCode")
    let record: RemoteOpenCodeServerRecord
    try {
      record = await ensureRemoteOpenCodeServer(
        remote,
        stateKey,
        localPort,
        randomUUID(),
        AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      )
    } catch (error) {
      lastError = error
      if (error instanceof RemoteOpenCodePortError && attempt === 0) continue
      throw error
    }
    while (record.port === localPort) localPort = await unusedLoopbackPort("o servidor do OpenCode")
    const credentials = { username: "opencode", password: record.password }
    const authorization = openCodeAuthorization(credentials)
    signal.throwIfAborted()
    const tunnel = spawnRemoteOpenCodeTunnel(remote, localPort, record.port)
    const baseUrl = `http://127.0.0.1:${localPort}`
    const stop = () => stopServer(tunnel)
    const close = async () => {
      await stop()
      await stopRemoteOpenCodeServer(remote, stateKey)
    }
    try {
      const protocol = await waitForOpenCodeServer(baseUrl, tunnel, signal, true, authorization)
      return {
        baseUrl,
        protocol,
        credentials,
        authorization,
        created: record.created,
        stop,
        close,
      }
    } catch (error) {
      lastError = error
      const tunnelFailed = tunnel.exitCode !== null
      await stop()
      if (!record.created && tunnelFailed) throw error
      await stopRemoteOpenCodeServer(remote, stateKey).catch(() => undefined)
      if (!record.created && attempt === 0) continue
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Não foi possível conectar ao servidor remoto do OpenCode.")
}

export async function startOpenCodeServerConnection(
  workingDirectory: string,
  remote: RemoteCodexTarget | undefined,
  signal: AbortSignal,
  remoteVersion = "",
): Promise<StartedOpenCodeServer> {
  if (remote) return startRemoteOpenCodeServer(workingDirectory, remote, remoteVersion, signal)
  const localPort = await unusedLoopbackPort("o servidor do OpenCode")
  const credentials = { username: "opencode", password: randomUUID() }
  const authorization = openCodeAuthorization(credentials)
  signal.throwIfAborted()
  let process: ServerProcess
  try {
    process = spawnLocalOpenCodeServer(localPort, workingDirectory, credentials)
  } catch {
    throw new Error("O OpenCode não está instalado nesta máquina.")
  }
  const baseUrl = `http://127.0.0.1:${localPort}`
  const stop = () => stopServer(process)
  try {
    const protocol = await waitForOpenCodeServer(baseUrl, process, signal, false, authorization)
    return {
      baseUrl,
      protocol,
      credentials,
      authorization,
      created: true,
      stop,
      close: stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
