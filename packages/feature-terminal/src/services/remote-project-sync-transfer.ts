import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import {
  chmod,
  copyFile,
  lutimes,
  mkdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
} from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type {
  RemoteProjectSyncEntry,
  RemoteProjectSyncManifest,
  RemoteProjectSyncPreview,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"
import { projectSyncEntriesEqual } from "./remote-project-sync-diff"
import { RemoteProjectSyncError } from "./remote-project-sync-errors"
import { remoteProjectScriptCommand } from "./remote-project-sync-manifest"

const ARCHIVE_COMMAND_BYTES = 24 * 1024

const REMOTE_SELECTED_ARCHIVE_SCRIPT = `
root=$1
shift
cd "$root" || exit 72
command -v tar >/dev/null 2>&1 || exit 127
exec tar -cf - -- "$@"
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

function safeTreePath(root: string, path: string) {
  const target = resolve(root, ...path.split("/"))
  const separator = process.platform === "win32" ? "\\" : "/"
  if (target !== root && !target.startsWith(`${root}${separator}`))
    throw new RemoteProjectSyncError("O projeto remoto contém um caminho inválido.")
  return target
}

function byDepth(entries: readonly RemoteProjectSyncEntry[], descending = false) {
  return [...entries].sort((left, right) => {
    const depth = left.path.split("/").length - right.path.split("/").length
    return descending ? -depth : depth
  })
}

async function applyEntryMetadata(path: string, entry: RemoteProjectSyncEntry) {
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

async function prepareStaging(
  preview: RemoteProjectSyncPreview,
  staging: string,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  await mkdir(staging)
  const localEntries = entryMap(preview.local)
  const directories = byDepth(preview.remote.entries.filter((entry) => entry.type === "directory"))
  const others = preview.remote.entries.filter((entry) => entry.type !== "directory")
  const total = Math.max(1, directories.length + others.length)
  let completed = 0
  for (const entry of directories) {
    signal.throwIfAborted()
    await mkdir(safeTreePath(staging, entry.path))
    onProgress((++completed / total) * 0.15)
  }
  const transfer: RemoteProjectSyncEntry[] = []
  for (const entry of others) {
    signal.throwIfAborted()
    const target = safeTreePath(staging, entry.path)
    const localEntry = localEntries.get(entry.path)
    if (entry.type === "symlink") {
      await symlink(entry.target, target)
      await applyEntryMetadata(target, entry)
    } else if (entry.type === "file") {
      if (entry.digest === localEntry?.digest) {
        const source = safeTreePath(preview.local.canonicalPath, entry.path)
        await copyFile(source, target)
        await applyEntryMetadata(target, entry)
      } else transfer.push(entry)
    } else
      throw new RemoteProjectSyncError("O projeto remoto contém um tipo de arquivo não suportado.")
    onProgress((++completed / total) * 0.15)
  }
  return { directories, transfer }
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
  if (typeof override === "function") return override(paths)
  if (override) return override
  return remoteNonInteractiveSshCommand(
    remote.profile,
    remoteProjectScriptCommand(REMOTE_SELECTED_ARCHIVE_SCRIPT, [
      remotePath,
      ...paths.map((path) => `./${path}`),
    ]),
  )
}

function abortedError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
}

async function writeRemoteArchive(
  command: readonly string[],
  path: string,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
) {
  signal.throwIfAborted()
  const [executable, ...args] = command
  if (!executable) throw new RemoteProjectSyncError("Comando de sincronização ausente.")
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const output = createWriteStream(path, { flags: "wx", mode: 0o600 })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384)
  })
  child.stdout.on("data", (chunk: Buffer) => onBytes(chunk.length))
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
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
    if (exitCode !== 0)
      throw new RemoteProjectSyncError(stderr.trim() || "Não foi possível copiar o projeto remoto.")
  } finally {
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
  const batches = archiveBatches(options.entries)
  const totalBytes = Math.max(
    1,
    options.entries.reduce((sum, entry) => sum + Math.max(1, entry.size), 0),
  )
  let completedBytes = 0
  for (const [index, batch] of batches.entries()) {
    const archivePath = join(options.transaction, `project-${index}.tar`)
    const batchBytes = batch.reduce((sum, entry) => sum + Math.max(1, entry.size), 0)
    let receivedBytes = 0
    await writeRemoteArchive(
      archiveCommand(
        options.remote,
        options.remotePath,
        batch.map((entry) => entry.path),
        options.archiveOverride,
      ),
      archivePath,
      options.signal,
      (bytes) => {
        receivedBytes += bytes
        const transferred = completedBytes + Math.min(batchBytes, receivedBytes)
        options.onProgress(0.15 + (transferred / totalBytes) * 0.7)
      },
    )
    await extractArchive(archivePath, options.staging, options.signal)
    await rm(archivePath, { force: true })
    completedBytes += batchBytes
    options.onProgress(0.15 + (completedBytes / totalBytes) * 0.7)
  }
  if (!batches.length) options.onProgress(0.85)
}

export async function prepareRemoteProjectSyncStaging(options: {
  remote: RemoteCodexTarget
  preview: RemoteProjectSyncPreview
  staging: string
  transaction: string
  signal: AbortSignal
  archiveOverride: RemoteProjectArchiveCommand
  onProgress: (progress: number) => void
}) {
  const { directories, transfer } = await prepareStaging(
    options.preview,
    options.staging,
    options.signal,
    options.onProgress,
  )
  await transferFiles({
    remote: options.remote,
    remotePath: options.preview.remote.canonicalPath,
    entries: transfer,
    staging: options.staging,
    transaction: options.transaction,
    signal: options.signal,
    archiveOverride: options.archiveOverride,
    onProgress: options.onProgress,
  })
  for (const entry of transfer)
    await applyEntryMetadata(safeTreePath(options.staging, entry.path), entry)
  for (const entry of byDepth(directories, true))
    await applyEntryMetadata(safeTreePath(options.staging, entry.path), entry)
  return transfer.map((entry) => entry.path)
}

export function remoteProjectSyncManifestsEqual(
  left: RemoteProjectSyncManifest,
  right: RemoteProjectSyncManifest,
) {
  if (left.entries.length !== right.entries.length) return false
  const rightEntries = entryMap(right)
  return left.entries.every((entry) => projectSyncEntriesEqual(entry, rightEntries.get(entry.path)))
}

export async function publishRemoteProjectSyncStaging(
  staging: string,
  destination: string,
  verifyPrevious: (previous: string | undefined) => Promise<void>,
) {
  const parent = dirname(destination)
  const backup = join(parent, `.${basename(destination)}.tuiminal-backup-${randomUUID()}`)
  const existing = await stat(destination).then(
    () => true,
    () => false,
  )
  if (existing) await rename(destination, backup)
  try {
    await verifyPrevious(existing ? backup : undefined)
    await rename(staging, destination)
  } catch (error) {
    if (existing) await rename(backup, destination).catch(() => undefined)
    throw error
  }
  if (existing) await rm(backup, { recursive: true, force: true })
}
