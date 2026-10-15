import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, opendir, readlink, stat } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import type {
  RemoteProjectSyncEntry,
  RemoteProjectSyncEntryType,
  RemoteProjectSyncManifest,
} from "../model/remote-project-sync"

const MAX_MANIFEST_ENTRIES = 250_000
const LOCAL_DIRECTORY_CONCURRENCY = 4
const LOCAL_ENTRY_CONCURRENCY = 16
const LOCAL_HASH_CONCURRENCY = 4

function abortedError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
}

function digestEntries(entries: readonly string[]) {
  const hash = createHash("sha256")
  for (const entry of [...entries].sort()) {
    const value = Buffer.from(entry)
    hash.update(String(value.length))
    hash.update(":")
    hash.update(value)
  }
  return hash.digest("hex")
}

function localType(metadata: Awaited<ReturnType<typeof lstat>>): RemoteProjectSyncEntryType {
  if (metadata.isSymbolicLink()) return "symlink"
  if (metadata.isDirectory()) return "directory"
  if (metadata.isFile()) return "file"
  return "unsupported"
}

function rawEntryType(type: RemoteProjectSyncEntryType) {
  if (type === "file") return "f"
  if (type === "directory") return "d"
  if (type === "symlink") return "l"
  return "x"
}

async function readLocalDirectory(directory: string, root: string, signal: AbortSignal) {
  const entries: RemoteProjectSyncEntry[] = []
  const fingerprints: string[] = []
  const directories: string[] = []
  const handle = await opendir(directory)
  const names: string[] = []
  try {
    for await (const directoryEntry of handle) {
      signal.throwIfAborted()
      names.push(directoryEntry.name)
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
  for (let offset = 0; offset < names.length; offset += LOCAL_ENTRY_CONCURRENCY) {
    const batch = names.slice(offset, offset + LOCAL_ENTRY_CONCURRENCY)
    const values = await Promise.all(
      batch.map(async (name) => {
        signal.throwIfAborted()
        const absolute = resolve(directory, name)
        const metadata = await lstat(absolute)
        const type = localType(metadata)
        return {
          absolute,
          metadata,
          path: relative(root, absolute).split(sep).join("/"),
          target: type === "symlink" ? await readlink(absolute) : "",
          linkKind:
            type === "symlink"
              ? await stat(absolute).then(
                  (target) => (target.isDirectory() ? ("directory" as const) : ("file" as const)),
                  () => "file" as const,
                )
              : undefined,
          type,
        }
      }),
    )
    for (const { absolute, metadata, path, target, linkKind, type } of values) {
      if (type === "directory") directories.push(absolute)
      const metadataKey = `${metadata.mode.toString(16)}|${metadata.size}|${metadata.mtimeMs}|${metadata.ctimeMs}`
      entries.push({
        path,
        type,
        mode: metadata.mode & 0o7777,
        size: metadata.size,
        modifiedAt: Math.floor(metadata.mtimeMs),
        changedAt: Math.floor(metadata.ctimeMs),
        metadataKey,
        target,
        ...(linkKind ? { linkKind } : {}),
      })
      fingerprints.push(JSON.stringify([path, rawEntryType(type), metadataKey, target, linkKind]))
    }
  }
  return { entries, fingerprints, directories }
}

export async function readLocalProjectMetadata(
  path: string,
  signal: AbortSignal,
  options: { scope?: RemoteProjectSyncManifest["scope"] } = {},
) {
  signal.throwIfAborted()
  const root = resolve(path)
  const scope = options.scope ?? "complete"
  const entries: RemoteProjectSyncEntry[] = []
  const fingerprintEntries: string[] = []
  const pending = [root]
  while (pending.length) {
    signal.throwIfAborted()
    const directories = pending.splice(-LOCAL_DIRECTORY_CONCURRENCY)
    const results = await Promise.all(
      directories.map((directory) => readLocalDirectory(directory, root, signal)),
    )
    for (const current of results) {
      entries.push(...current.entries)
      fingerprintEntries.push(...current.fingerprints)
      pending.push(...current.directories)
    }
    if (entries.length > MAX_MANIFEST_ENTRIES)
      throw new Error("O projeto excede o limite de verificação.")
  }
  return {
    fingerprint: digestEntries([`scope:${scope}`, ...fingerprintEntries]),
    canonicalPath: root,
    scope,
    entries,
    hasUnsupported: entries.some((entry) => entry.type === "unsupported"),
    hasSymlink: entries.some((entry) => entry.type === "symlink"),
  } satisfies RemoteProjectSyncManifest
}

export async function readLocalProjectFingerprint(path: string, signal: AbortSignal) {
  return (await readLocalProjectMetadata(path, signal)).fingerprint
}

export async function readLocalProjectFileDigest(path: string, size: number, signal: AbortSignal) {
  const hash = createHash("sha1")
  hash.update(`blob ${size}\0`)
  const stream = createReadStream(path)
  const stop = () => stream.destroy(abortedError(signal))
  signal.addEventListener("abort", stop, { once: true })
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted()
      hash.update(chunk as Buffer)
    }
    return hash.digest("hex")
  } finally {
    signal.removeEventListener("abort", stop)
  }
}

export async function readLocalProjectManifest(
  path: string,
  signal: AbortSignal,
  options: {
    manifest?: RemoteProjectSyncManifest | undefined
    baseline?: RemoteProjectSyncManifest | undefined
    forceHashPaths?: ReadonlySet<string> | undefined
    requireChangedAt?: boolean | undefined
  } = {},
) {
  const manifest =
    options.manifest ??
    (await readLocalProjectMetadata(path, signal, {
      scope: options.baseline?.scope,
    }))
  const baseline = new Map(options.baseline?.entries.map((entry) => [entry.path, entry]) ?? [])
  const digests = new Map<string, string>()
  const pending: RemoteProjectSyncEntry[] = []
  for (const entry of manifest.entries) {
    if (entry.type !== "file") continue
    const previous = baseline.get(entry.path)
    const sameMetadata =
      options.requireChangedAt !== false && previous?.metadataKey && entry.metadataKey
        ? previous.metadataKey === entry.metadataKey
        : (process.platform === "win32" || previous?.mode === entry.mode) &&
          previous?.size === entry.size &&
          previous?.modifiedAt === entry.modifiedAt &&
          (options.requireChangedAt === false ||
            (previous?.changedAt !== undefined && previous.changedAt === entry.changedAt))
    if (
      !options.forceHashPaths?.has(entry.path) &&
      previous?.type === "file" &&
      previous.digest &&
      sameMetadata
    )
      digests.set(entry.path, previous.digest)
    else pending.push(entry)
  }
  let next = 0
  const workers = Array.from(
    { length: Math.min(LOCAL_HASH_CONCURRENCY, pending.length) },
    async () => {
      while (next < pending.length) {
        signal.throwIfAborted()
        const entry = pending[next++]
        if (!entry) continue
        digests.set(
          entry.path,
          await readLocalProjectFileDigest(
            resolve(manifest.canonicalPath, ...entry.path.split("/")),
            entry.size,
            signal,
          ),
        )
      }
    },
  )
  await Promise.all(workers)
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({ ...entry, digest: digests.get(entry.path) })),
  }
}
