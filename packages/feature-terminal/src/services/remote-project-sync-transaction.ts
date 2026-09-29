import { open } from "node:fs/promises"
import { lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { RemoteProjectSyncEntry, RemoteProjectSyncPreview } from "../model/remote-project-sync"
import { projectSyncEntriesEqual } from "./remote-project-sync-diff"
import { RemoteProjectSyncError } from "./remote-project-sync-errors"
import {
  applyProjectSyncEntryMetadata,
  createProjectSyncSymlink,
  safeProjectSyncTreePath,
} from "./remote-project-sync-transfer"

const MAX_JOURNAL_BYTES = 16 * 1024 * 1024

type JournalOperation =
  | { kind: "root" }
  | { kind: "backup"; path: string }
  | { kind: "install"; path: string }
  | { kind: "metadata"; path: string; entry: RemoteProjectSyncEntry }
  | { kind: "commit" }

function journalPath(transaction: string) {
  return join(transaction, "journal.jsonl")
}

async function appendOperation(transaction: string, operation: JournalOperation) {
  const handle = await open(journalPath(transaction), "a", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(operation)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function pathPresent(path: string) {
  return lstat(path).then(
    () => true,
    () => false,
  )
}

function entryMap(entries: readonly RemoteProjectSyncEntry[]) {
  return new Map(entries.map((entry) => [entry.path, entry]))
}

function depth(path: string) {
  return path.split("/").length
}

function coveredBy(path: string, parents: readonly string[]) {
  return parents.some((parent) => path === parent || path.startsWith(`${parent}/`))
}

function needsBackup(
  local: RemoteProjectSyncEntry | undefined,
  remote: RemoteProjectSyncEntry | undefined,
) {
  if (!local) return false
  if (!remote || local.type !== remote.type) return true
  if (local.type === "file") return local.digest !== remote.digest
  if (local.type === "symlink")
    return local.target !== remote.target || local.linkKind !== remote.linkKind
  return local.type === "unsupported"
}

function backupPaths(preview: RemoteProjectSyncPreview) {
  const local = entryMap(preview.local.entries)
  const remote = entryMap(preview.remote.entries)
  const selected: string[] = []
  for (const change of [...preview.changes].sort(
    (left, right) => depth(left.path) - depth(right.path),
  )) {
    if (coveredBy(change.path, selected)) continue
    if (needsBackup(local.get(change.path), remote.get(change.path))) selected.push(change.path)
  }
  return selected
}

async function readOperations(transaction: string) {
  const path = journalPath(transaction)
  const size = await stat(path).then(
    (value) => value.size,
    () => 0,
  )
  if (!size) return []
  if (size > MAX_JOURNAL_BYTES)
    throw new RemoteProjectSyncError("O journal da sincronização excedeu o limite seguro.")
  const lines = (await readFile(path, "utf8")).split("\n")
  const operations: JournalOperation[] = []
  for (const [index, line] of lines.entries()) {
    if (!line) continue
    try {
      const operation = JSON.parse(line) as JournalOperation
      if (
        "path" in operation &&
        (!operation.path ||
          operation.path.startsWith("/") ||
          operation.path.split("/").includes(".."))
      )
        throw new Error("invalid path")
      operations.push(operation)
    } catch {
      if (index < lines.length - 2)
        throw new RemoteProjectSyncError("O journal da sincronização está corrompido.")
    }
  }
  return operations
}

async function removeInstalledPath(destination: string, path: string) {
  await rm(safeProjectSyncTreePath(destination, path), { recursive: true, force: true })
}

export async function rollbackRemoteProjectSyncDelta(transaction: string, destination: string) {
  const operations = await readOperations(transaction)
  if (operations.some((operation) => operation.kind === "commit")) return
  const backup = join(transaction, "backup")
  for (const operation of [...operations].reverse()) {
    if (operation.kind === "install") {
      await removeInstalledPath(destination, operation.path)
      continue
    }
    if (operation.kind === "backup") {
      const source = safeProjectSyncTreePath(backup, operation.path)
      if (!(await pathPresent(source))) continue
      const target = safeProjectSyncTreePath(destination, operation.path)
      await rm(target, { recursive: true, force: true })
      await mkdir(dirname(target), { recursive: true })
      await rename(source, target)
      continue
    }
    if (operation.kind === "metadata") {
      const target = safeProjectSyncTreePath(destination, operation.path)
      if (await pathPresent(target)) await applyProjectSyncEntryMetadata(target, operation.entry)
      continue
    }
    if (operation.kind === "root") await rm(destination, { recursive: true, force: true })
  }
}

export async function commitRemoteProjectSyncDelta(transaction: string) {
  await appendOperation(transaction, { kind: "commit" })
  await rm(transaction, { recursive: true, force: true })
}

export async function recoverRemoteProjectSyncTransactions(destination: string) {
  const parent = dirname(destination)
  const prefix = `.${basename(destination)}.tuiminal-sync-`
  const names = await readdir(parent).catch(() => [])
  for (const name of names) {
    if (!name.startsWith(prefix)) continue
    const transaction = join(parent, name)
    const operations = await readOperations(transaction)
    if (!operations.some((operation) => operation.kind === "commit"))
      await rollbackRemoteProjectSyncDelta(transaction, destination)
    await rm(transaction, { recursive: true, force: true })
  }
}

async function installRemoteProjectSyncEntry(
  entry: RemoteProjectSyncEntry,
  target: string,
  incoming: string,
) {
  if (entry.type === "file") {
    await rename(safeProjectSyncTreePath(incoming, entry.path), target)
    return
  }
  if (entry.type === "symlink") {
    await createProjectSyncSymlink(entry, target)
    return
  }
  throw new RemoteProjectSyncError("O projeto remoto contém um tipo de arquivo não suportado.")
}

export async function applyRemoteProjectSyncDelta(options: {
  preview: RemoteProjectSyncPreview
  destination: string
  transaction: string
  incoming: string
  signal: AbortSignal
  onProgress: (progress: number) => void
}) {
  const { destination, incoming, preview, signal, transaction } = options
  const localEntries = entryMap(preview.local.entries)
  const remoteEntries = entryMap(preview.remote.entries)
  const backups = backupPaths(preview)
  const changedRemote = preview.changes.flatMap((change) => {
    const entry = remoteEntries.get(change.path)
    return entry ? [entry] : []
  })
  const total = Math.max(1, backups.length + changedRemote.length)
  let completed = 0
  if (!(await pathPresent(destination))) {
    await mkdir(destination)
    await appendOperation(transaction, { kind: "root" })
  }
  const backup = join(transaction, "backup")
  for (const path of backups) {
    signal.throwIfAborted()
    const source = safeProjectSyncTreePath(destination, path)
    if (!(await pathPresent(source)))
      throw new RemoteProjectSyncError(
        "A cópia local mudou durante a sincronização; tente novamente.",
      )
    const target = safeProjectSyncTreePath(backup, path)
    await mkdir(dirname(target), { recursive: true })
    await appendOperation(transaction, { kind: "backup", path })
    await rename(source, target)
    options.onProgress(++completed / total)
  }
  const directories = changedRemote
    .filter((entry) => entry.type === "directory")
    .sort((left, right) => depth(left.path) - depth(right.path))
  for (const entry of directories) {
    signal.throwIfAborted()
    const target = safeProjectSyncTreePath(destination, entry.path)
    const local = localEntries.get(entry.path)
    if (local?.type === "directory") {
      await appendOperation(transaction, { kind: "metadata", path: entry.path, entry: local })
    } else {
      await appendOperation(transaction, { kind: "install", path: entry.path })
      await mkdir(target, { recursive: true })
    }
    options.onProgress(++completed / total)
  }
  for (const entry of changedRemote.filter((candidate) => candidate.type !== "directory")) {
    signal.throwIfAborted()
    const target = safeProjectSyncTreePath(destination, entry.path)
    await mkdir(dirname(target), { recursive: true })
    const local = localEntries.get(entry.path)
    if (
      entry.type === "file" &&
      local?.type === "file" &&
      entry.digest === local.digest &&
      !projectSyncEntriesEqual(entry, local)
    ) {
      await appendOperation(transaction, { kind: "metadata", path: entry.path, entry: local })
      await applyProjectSyncEntryMetadata(target, entry)
    } else {
      await appendOperation(transaction, { kind: "install", path: entry.path })
      await installRemoteProjectSyncEntry(entry, target, incoming)
      await applyProjectSyncEntryMetadata(target, entry)
    }
    options.onProgress(++completed / total)
  }
  for (const entry of [...directories].reverse()) {
    signal.throwIfAborted()
    await applyProjectSyncEntryMetadata(safeProjectSyncTreePath(destination, entry.path), entry)
  }
}
