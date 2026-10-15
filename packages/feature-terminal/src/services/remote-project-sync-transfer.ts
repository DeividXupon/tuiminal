import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { chmod, lutimes, mkdir, rm, symlink, utimes } from "node:fs/promises"
import { join, resolve } from "node:path"
import type {
  RemoteProjectSyncEntry,
  RemoteProjectSyncManifest,
  RemoteProjectSyncPreview,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"
import { projectSyncEntriesEqual } from "./remote-project-sync-diff"
import { RemoteProjectSyncError, remoteProjectSyncProcessError } from "./remote-project-sync-errors"
import { remoteProjectScriptCommand } from "./remote-project-sync-manifest"

const ARCHIVE_COMMAND_BYTES = 24 * 1024
const TRANSFER_IDLE_TIMEOUT_MS = 90_000

const REMOTE_SELECTED_ARCHIVE_SCRIPT = `
root=$1
shift
cd "$root" || exit 72
command -v tar >/dev/null 2>&1 || exit 127
exec tar -cf - -- "$@"
`

const REMOTE_SELECTED_ARCHIVE_STDIN_SCRIPT = `
root=$1
cd "$root" || exit 72
command -v tar >/dev/null 2>&1 || exit 127
exec tar -cf - --null -T -
`

export type RemoteProjectArchiveCommand =
  | readonly string[]
  | ((paths: readonly string[]) => readonly string[])
  | undefined

export const localRemoteProjectArchiveCommand = (path: string, paths: readonly string[] = ["."]) =>
  [
    "sh",
    "-c",
    REMOTE_SELECTED_ARCHIVE_SCRIPT,
    "tuiminal-project-sync",
    path,
    ...paths.map((entry) => (entry === "." ? entry : `./${entry}`)),
  ] as const

export function safeProjectSyncTreePath(root: string, path: string) {
  const target = resolve(root, ...path.split("/"))
  const separator = process.platform === "win32" ? "\\" : "/"
  if (target !== root && !target.startsWith(`${root}${separator}`))
    throw new RemoteProjectSyncError("O projeto remoto contém um caminho inválido.")
  return target
}

export async function applyProjectSyncEntryMetadata(path: string, entry: RemoteProjectSyncEntry) {
  const modified = new Date(entry.modifiedAt)
  if (entry.type === "symlink") {
    await lutimes(path, modified, modified).catch(() => undefined)
    return
  }
  if (process.platform !== "win32") await chmod(path, entry.mode)
  await utimes(path, modified, modified)
}

function entryMap(manifest: RemoteProjectSyncManifest) {
  return new Map(manifest.entries.map((entry) => [entry.path, entry]))
}

function requiredDirectories(entries: readonly RemoteProjectSyncEntry[]) {
  const directories = new Set(
    entries.filter((entry) => entry.type === "directory").map((entry) => entry.path),
  )
  for (const entry of entries) {
    const parts = entry.path.split("/")
    parts.pop()
    while (parts.length) {
      directories.add(parts.join("/"))
      parts.pop()
    }
  }
  return [...directories].sort((left, right) => left.split("/").length - right.split("/").length)
}

function archiveBatches(entries: readonly RemoteProjectSyncEntry[]) {
  const batches: RemoteProjectSyncEntry[][] = []
  let batch: RemoteProjectSyncEntry[] = []
  let bytes = 0
  for (const entry of entries) {
    const nextBytes = Buffer.byteLength(entry.path) * 5 + 8
    if (batch.length && bytes + nextBytes > ARCHIVE_COMMAND_BYTES) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(entry)
    bytes += nextBytes
  }
  if (batch.length) batches.push(batch)
  return batches
}

function archiveCommand(
  remote: RemoteCodexTarget,
  remotePath: string,
  paths: readonly string[],
  override: RemoteProjectArchiveCommand,
) {
  if (typeof override === "function") return { command: override(paths) }
  if (override) return { command: override }
  return {
    command: remoteNonInteractiveSshCommand(
      remote.profile,
      remoteProjectScriptCommand(REMOTE_SELECTED_ARCHIVE_STDIN_SCRIPT, [remotePath]),
    ),
    input: Buffer.from(`${paths.map((path) => `./${path}`).join("\0")}\0`, "utf8"),
  }
}

function abortedError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
}

async function writeRemoteArchive(
  command: readonly string[],
  path: string,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
  input?: Buffer,
) {
  signal.throwIfAborted()
  const [executable, ...args] = command
  if (!executable) throw new RemoteProjectSyncError("Comando de sincronização ausente.")
  const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
  const output = createWriteStream(path, { flags: "wx", mode: 0o600 })
  let stderr = ""
  let timedOut = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const refreshTimeout = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, TRANSFER_IDLE_TIMEOUT_MS)
  }
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384)
    refreshTimeout()
  })
  child.stdin.on("error", () => undefined)
  child.stdin.end(input)
  child.stdout.on("data", (chunk: Buffer) => {
    refreshTimeout()
    onBytes(chunk.length)
  })
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
  refreshTimeout()
  child.stdout.pipe(output)
  try {
    const [exitCode] = await Promise.all([
      new Promise<number | null>((resolveExit, reject) => {
        child.once("error", () =>
          reject(new RemoteProjectSyncError("Não foi possível copiar o projeto remoto.")),
        )
        child.once("exit", resolveExit)
      }),
      new Promise<void>((resolveOutput, reject) => {
        output.once("finish", resolveOutput)
        output.once("error", reject)
      }),
    ])
    if (signal.aborted) throw abortedError(signal)
    if (timedOut)
      throw new RemoteProjectSyncError("A transferência ficou sem progresso e foi cancelada.")
    if (exitCode !== 0)
      throw remoteProjectSyncProcessError(stderr, "Não foi possível copiar o projeto remoto.")
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    signal.removeEventListener("abort", stop)
    if (!output.closed) output.destroy()
  }
}

async function extractArchive(path: string, destination: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const child = spawn("tar", ["-xf", path, "-C", destination], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384)
  })
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
  try {
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      child.once("error", () =>
        reject(new RemoteProjectSyncError("Não foi possível iniciar o utilitário tar local.")),
      )
      child.once("exit", resolveExit)
    })
    if (signal.aborted) throw abortedError(signal)
    if (exitCode !== 0)
      throw new RemoteProjectSyncError(
        stderr.trim() || "Não foi possível extrair o projeto remoto.",
      )
  } finally {
    signal.removeEventListener("abort", stop)
  }
}

async function transferFiles(options: {
  remote: RemoteCodexTarget
  remotePath: string
  entries: readonly RemoteProjectSyncEntry[]
  staging: string
  transaction: string
  signal: AbortSignal
  archiveOverride: RemoteProjectArchiveCommand
  onProgress: (progress: number) => void
}) {
  const batches = options.archiveOverride
    ? archiveBatches(options.entries)
    : options.entries.length
      ? [options.entries]
      : []
  const totalBytes = Math.max(
    1,
    options.entries.reduce((sum, entry) => sum + Math.max(1, entry.size), 0),
  )
  let completedBytes = 0
  for (const [index, batch] of batches.entries()) {
    const archivePath = join(options.transaction, `project-${index}.tar`)
    const batchBytes = batch.reduce((sum, entry) => sum + Math.max(1, entry.size), 0)
    let receivedBytes = 0
    const archive = archiveCommand(
      options.remote,
      options.remotePath,
      batch.map((entry) => entry.path),
      options.archiveOverride,
    )
    await writeRemoteArchive(
      archive.command,
      archivePath,
      options.signal,
      (bytes) => {
        receivedBytes += bytes
        const transferred = completedBytes + Math.min(batchBytes, receivedBytes)
        options.onProgress(0.15 + (transferred / totalBytes) * 0.7)
      },
      archive.input,
    )
    await extractArchive(archivePath, options.staging, options.signal)
    await rm(archivePath, { force: true })
    completedBytes += batchBytes
    options.onProgress(0.15 + (completedBytes / totalBytes) * 0.7)
  }
  if (!batches.length) options.onProgress(0.85)
}

export async function createProjectSyncSymlink(entry: RemoteProjectSyncEntry, target: string) {
  try {
    await symlink(entry.target, target, entry.linkKind === "directory" ? "dir" : "file")
  } catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM")
      throw new RemoteProjectSyncError(
        "O Windows bloqueou um link simbólico; habilite o Modo de Desenvolvedor e tente novamente.",
      )
    throw error
  }
}

export async function downloadRemoteProjectSyncDelta(options: {
  remote: RemoteCodexTarget
  preview: RemoteProjectSyncPreview
  incoming: string
  transaction: string
  signal: AbortSignal
  archiveOverride: RemoteProjectArchiveCommand
  onProgress: (progress: number) => void
}) {
  const localEntries = entryMap(options.preview.local)
  const transfer = options.preview.remote.entries.filter(
    (entry) => entry.type === "file" && entry.digest !== localEntries.get(entry.path)?.digest,
  )
  await mkdir(options.incoming, { recursive: true })
  for (const directory of requiredDirectories(transfer))
    await mkdir(safeProjectSyncTreePath(options.incoming, directory), { recursive: true })
  await transferFiles({
    remote: options.remote,
    remotePath: options.preview.remote.canonicalPath,
    entries: transfer,
    staging: options.incoming,
    transaction: options.transaction,
    signal: options.signal,
    archiveOverride: options.archiveOverride,
    onProgress: options.onProgress,
  })
  for (const entry of transfer)
    await applyProjectSyncEntryMetadata(
      safeProjectSyncTreePath(options.incoming, entry.path),
      entry,
    )
  return transfer
}

export function remoteProjectSyncManifestsEqual(
  left: RemoteProjectSyncManifest,
  right: RemoteProjectSyncManifest,
) {
  if ((left.scope ?? "complete") !== (right.scope ?? "complete")) return false
  if (left.entries.length !== right.entries.length) return false
  const rightEntries = entryMap(right)
  return left.entries.every((entry) => projectSyncEntriesEqual(entry, rightEntries.get(entry.path)))
}
