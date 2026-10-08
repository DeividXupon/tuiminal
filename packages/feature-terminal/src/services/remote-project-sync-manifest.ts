import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { posix } from "node:path"
import type {
  RemoteProjectSyncEntry,
  RemoteProjectSyncEntryType,
  RemoteProjectSyncManifest,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"
import { remoteProjectSyncProcessError } from "./remote-project-sync-errors"

const MANIFEST_TIMEOUT_MS = 60_000
const DETAILED_MANIFEST_TIMEOUT_MS = 5 * 60_000
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024
const MAX_MANIFEST_ENTRIES = 250_000
const HASH_COMMAND_BYTES = 24 * 1024

const REMOTE_MANIFEST_SCRIPT = String.raw`
root=$1
export LC_ALL=C
cd "$root" || exit 72
canonical=$(pwd -P) || exit 72
printf 'TUIMINAL_ROOT\000%s\000' "$canonical"
printf 'TUIMINAL_SCOPE\000complete\000'
if find . -maxdepth 0 -printf '' >/dev/null 2>&1; then
  find . -mindepth 1 -printf 'TUIMINAL_ENTRY\000%P\000%y\000%m|%s|%T@|%C@\000%l\000%Y\000' || exit 74
  exit 0
fi
find . -mindepth 1 -exec sh -c '
  for item do
    path=${"$"}{item#./}
    type=x
    target=
    link_kind=
    if [ -L "$item" ]; then
      type=l
      target=$(readlink "$item") || exit 74
      if [ -d "$item" ]; then link_kind=d; else link_kind=f; fi
    elif [ -d "$item" ]; then type=d
    elif [ -f "$item" ]; then type=f
    fi
    metadata=$(stat -c "%a|%s|%.9Y|%.9Z" -- "$item" 2>/dev/null || stat -f "%p|%z|%.9Fm|%.9Fc" -- "$item" 2>/dev/null) || exit 74
    printf "TUIMINAL_ENTRY\000%s\000%s\000%s\000%s\000%s\000" "$path" "$type" "$metadata" "$target" "$link_kind"
  done
' sh {} +
`

const REMOTE_HASH_SCRIPT = `
root=$1
shift
cd "$root" || exit 72
command -v git >/dev/null 2>&1 || exit 127
exec git hash-object --no-filters -- "$@"
`

const REMOTE_HASH_STDIN_SCRIPT = `
root=$1
cd "$root" || exit 72
command -v git >/dev/null 2>&1 || exit 127
command -v xargs >/dev/null 2>&1 || exit 127
exec xargs -0 git hash-object --no-filters --
`

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function remoteProjectScriptCommand(script: string, args: readonly string[]) {
  return `exec sh -c ${shellQuote(script)} tuiminal-project-sync ${args.map(shellQuote).join(" ")}`
}

function remoteCommand(remote: RemoteCodexTarget, script: string, args: readonly string[]) {
  return remoteNonInteractiveSshCommand(remote.profile, remoteProjectScriptCommand(script, args))
}

function abortedError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
}

export async function collectProjectSyncProcess(
  command: readonly string[],
  signal: AbortSignal,
  options: { timeoutMs: number; maximumBytes: number; input?: Buffer | undefined },
) {
  signal.throwIfAborted()
  const [executable, ...args] = command
  if (!executable) throw new Error("Comando de sincronização ausente.")
  const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
  const chunks: Buffer[] = []
  let size = 0
  let stderr = ""
  let limited = false
  let timedOut = false
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length
    if (size > options.maximumBytes) {
      limited = true
      child.kill()
    } else chunks.push(chunk)
  })
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384)
  })
  child.stdin.on("error", () => undefined)
  child.stdin.end(options.input)
  const stop = () => child.kill()
  signal.addEventListener("abort", stop, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, options.timeoutMs)
  try {
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      child.once("error", () => reject(new Error("Não foi possível verificar o projeto remoto.")))
      child.once("exit", resolveExit)
    })
    if (signal.aborted) throw abortedError(signal)
    if (limited) throw new Error("O projeto excede o limite de verificação.")
    if (timedOut) throw new Error("A verificação do projeto excedeu o tempo limite.")
    if (exitCode !== 0)
      throw remoteProjectSyncProcessError(stderr, "Não foi possível verificar o projeto remoto.")
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", stop)
  }
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

function entryType(type: string): RemoteProjectSyncEntryType {
  if (type === "f" || type === "regular file") return "file"
  if (type === "d") return "directory"
  if (type === "l") return "symlink"
  return "unsupported"
}

function parseRemoteMode(value: string) {
  const parsed = Number.parseInt(value, 8)
  return Number.isFinite(parsed) ? parsed & 0o7777 : 0
}

function parseRemoteTimestamp(value: string) {
  const parsed = Number(value)
  if (Number.isFinite(parsed)) return Math.floor(parsed * 1_000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function validateManifestEntry(path: string, type: string, target: string) {
  if (!path || path.startsWith("/") || posix.normalize(path) !== path)
    throw new Error("O projeto remoto contém um caminho inválido.")
  if (type !== "l") return
  const resolvedTarget = posix.normalize(posix.join(posix.dirname(path), target))
  if (target.startsWith("/") || resolvedTarget === ".." || resolvedTarget.startsWith("../"))
    throw new Error("O projeto remoto contém um link simbólico inseguro.")
}

function parseRemoteEntry(fields: readonly string[], index: number) {
  const path = fields[index] ?? ""
  const rawType = fields[index + 1] ?? ""
  const metadata = fields[index + 2] ?? ""
  const target = fields[index + 3] ?? ""
  const rawLinkKind = fields[index + 4] ?? ""
  validateManifestEntry(path, rawType, target)
  const [rawMode = "0", rawSize = "0", rawModifiedAt = "0", rawChangedAt = "0"] =
    metadata.split("|")
  const size = Number(rawSize)
  const modifiedAt = parseRemoteTimestamp(rawModifiedAt)
  const changedAt = parseRemoteTimestamp(rawChangedAt)
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !Number.isFinite(modifiedAt) ||
    !Number.isFinite(changedAt)
  )
    throw new Error("Manifesto remoto inválido.")
  return {
    entry: {
      path,
      type: entryType(rawType),
      mode: parseRemoteMode(rawMode),
      size,
      modifiedAt,
      changedAt,
      metadataKey: metadata,
      target,
      ...(rawType === "l"
        ? { linkKind: rawLinkKind === "d" ? ("directory" as const) : ("file" as const) }
        : {}),
    } satisfies RemoteProjectSyncEntry,
    fingerprint: JSON.stringify([path, rawType, metadata, target, rawLinkKind]),
    nextIndex: index + 5,
  }
}

function parseRemoteManifest(buffer: Buffer): RemoteProjectSyncManifest {
  const fields = buffer.toString("utf8").split("\0")
  const fingerprintEntries: string[] = []
  const entries: RemoteProjectSyncEntry[] = []
  let canonicalPath = ""
  let scope: RemoteProjectSyncManifest["scope"] = "complete"
  let index = 0
  while (index < fields.length - 1) {
    const marker = fields[index++]
    if (marker === "TUIMINAL_ROOT") {
      canonicalPath = fields[index++] ?? ""
      continue
    }
    if (marker === "TUIMINAL_SCOPE") {
      const value = fields[index++] ?? ""
      if (value !== "complete" && value !== "git") throw new Error("Manifesto remoto inválido.")
      scope = value
      continue
    }
    if (marker !== "TUIMINAL_ENTRY") throw new Error("Manifesto remoto inválido.")
    const parsed = parseRemoteEntry(fields, index)
    index = parsed.nextIndex
    entries.push(parsed.entry)
    fingerprintEntries.push(parsed.fingerprint)
    if (entries.length > MAX_MANIFEST_ENTRIES)
      throw new Error("O projeto excede o limite de verificação.")
  }
  if (!canonicalPath.startsWith("/"))
    throw new Error("O servidor retornou uma pasta de projeto inválida.")
  return {
    fingerprint: digestEntries([`scope:${scope}`, ...fingerprintEntries]),
    canonicalPath,
    scope,
    entries,
    hasUnsupported: entries.some((entry) => entry.type === "unsupported"),
    hasSymlink: entries.some((entry) => entry.type === "symlink"),
  }
}

export async function readRemoteProjectFingerprint(
  remote: RemoteCodexTarget,
  signal: AbortSignal,
  options: { command?: readonly string[] | undefined; timeoutMs?: number } = {},
) {
  const output = await collectProjectSyncProcess(
    options.command ?? remoteCommand(remote, REMOTE_MANIFEST_SCRIPT, [remote.workingDirectory]),
    signal,
    {
      timeoutMs: options.timeoutMs ?? MANIFEST_TIMEOUT_MS,
      maximumBytes: MAX_MANIFEST_BYTES,
    },
  )
  return parseRemoteManifest(output)
}

export const localRemoteProjectManifestCommand = (path: string) =>
  ["sh", "-c", REMOTE_MANIFEST_SCRIPT, "tuiminal-project-sync", path] as const

export const localRemoteProjectHashCommand = (path: string, paths: readonly string[]) =>
  ["sh", "-c", REMOTE_HASH_SCRIPT, "tuiminal-project-sync", path, ...paths] as const

function pathBatches(paths: readonly string[]) {
  const batches: string[][] = []
  let batch: string[] = []
  let bytes = 0
  for (const path of paths) {
    const pathBytes = Buffer.byteLength(path) * 5 + 8
    if (batch.length && bytes + pathBytes > HASH_COMMAND_BYTES) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(path)
    bytes += pathBytes
  }
  if (batch.length) batches.push(batch)
  return batches
}

function remoteMetadataMatches(
  previous: RemoteProjectSyncEntry | undefined,
  entry: RemoteProjectSyncEntry,
) {
  if (previous?.metadataKey && entry.metadataKey) return previous.metadataKey === entry.metadataKey
  return (
    previous?.mode === entry.mode &&
    previous?.size === entry.size &&
    previous?.modifiedAt === entry.modifiedAt &&
    previous?.changedAt !== undefined &&
    previous.changedAt === entry.changedAt
  )
}

async function readRemoteHashes(options: {
  remote: RemoteCodexTarget
  signal: AbortSignal
  canonicalPath: string
  paths: readonly string[]
  hashCommand?: ((paths: readonly string[]) => readonly string[]) | undefined
  timeoutMs?: number | undefined
}) {
  const input = options.hashCommand
    ? undefined
    : Buffer.from(`${options.paths.join("\0")}\0`, "utf8")
  const command = options.hashCommand
    ? options.hashCommand(options.paths)
    : remoteCommand(options.remote, REMOTE_HASH_STDIN_SCRIPT, [options.canonicalPath])
  const output = await collectProjectSyncProcess(command, options.signal, {
    timeoutMs: options.timeoutMs ?? DETAILED_MANIFEST_TIMEOUT_MS,
    maximumBytes: Math.max(1_024, options.paths.length * 48),
    input,
  })
  const hashes = output.toString("utf8").trim().split(/\r?\n/u)
  if (hashes.length !== options.paths.length || hashes.some((hash) => !/^[a-f\d]{40}$/u.test(hash)))
    throw new Error("Manifesto remoto inválido.")
  return hashes
}

export async function readRemoteProjectManifest(
  remote: RemoteCodexTarget,
  signal: AbortSignal,
  options: {
    manifestCommand?: readonly string[] | undefined
    hashCommand?: ((paths: readonly string[]) => readonly string[]) | undefined
    timeoutMs?: number
    manifest?: RemoteProjectSyncManifest | undefined
    baseline?: RemoteProjectSyncManifest | undefined
  } = {},
) {
  const manifest =
    options.manifest ??
    (await readRemoteProjectFingerprint(remote, signal, {
      command: options.manifestCommand,
      timeoutMs: options.timeoutMs ?? DETAILED_MANIFEST_TIMEOUT_MS,
    }))
  const baseline = new Map(options.baseline?.entries.map((entry) => [entry.path, entry]) ?? [])
  const files = manifest.entries.filter((entry) => entry.type === "file")
  const digests = new Map<string, string>()
  const pending: string[] = []
  for (const entry of files) {
    const previous = baseline.get(entry.path)
    if (previous?.type === "file" && previous.digest && remoteMetadataMatches(previous, entry))
      digests.set(entry.path, previous.digest)
    else pending.push(entry.path)
  }
  const batches = options.hashCommand ? pathBatches(pending) : pending.length ? [pending] : []
  for (const paths of batches) {
    const hashes = await readRemoteHashes({
      remote,
      signal,
      canonicalPath: manifest.canonicalPath,
      paths,
      hashCommand: options.hashCommand,
      timeoutMs: options.timeoutMs,
    })
    for (const [index, path] of paths.entries()) {
      const hash = hashes[index]
      if (hash) digests.set(path, hash)
    }
  }
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({ ...entry, digest: digests.get(entry.path) })),
  }
}
