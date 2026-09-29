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

const MANIFEST_TIMEOUT_MS = 60_000
const DETAILED_MANIFEST_TIMEOUT_MS = 5 * 60_000
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024
const MAX_MANIFEST_ENTRIES = 250_000
const HASH_COMMAND_BYTES = 24 * 1024

const REMOTE_MANIFEST_SCRIPT = String.raw`
root=$1
cd "$root" || exit 72
canonical=$(pwd -P) || exit 72
printf 'TUIMINAL_ROOT\000%s\000' "$canonical"
if find . -maxdepth 0 -printf '' >/dev/null 2>&1; then
  find . -mindepth 1 -printf 'TUIMINAL_ENTRY\000%P\000%y\000%m|%s|%T@|%C@\000%l\000' || exit 74
  exit 0
fi
find . -mindepth 1 -exec sh -c '
  for item do
    path=${"$"}{item#./}
    type=x
    target=
    if [ -L "$item" ]; then
      type=l
      target=$(readlink "$item") || exit 74
    elif [ -d "$item" ]; then type=d
    elif [ -f "$item" ]; then type=f
    fi
    metadata=$(stat -c "%f|%s|%Y|%Z" -- "$item" 2>/dev/null || stat -f "%p|%z|%m|%c" -- "$item" 2>/dev/null) || exit 74
    printf "TUIMINAL_ENTRY\000%s\000%s\000%s\000%s\000" "$path" "$type" "$metadata" "$target"
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
  options: { timeoutMs: number; maximumBytes: number },
) {
  signal.throwIfAborted()
  const [executable, ...args] = command
  if (!executable) throw new Error("Comando de sincronização ausente.")
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
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
      throw new Error(stderr.trim() || "Não foi possível verificar o projeto remoto.")
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
  if (type === "f") return "file"
  if (type === "d") return "directory"
  if (type === "l") return "symlink"
  return "unsupported"
}

function parseRemoteMode(value: string) {
  const radix = value.length <= 4 && /^[0-7]+$/u.test(value) ? 8 : 16
  const parsed = Number.parseInt(value, radix)
  return Number.isFinite(parsed) ? parsed & 0o7777 : 0
}

function parseRemoteTimestamp(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed * 1_000) : Number.NaN
}

function validateManifestEntry(path: string, type: string, target: string) {
  if (!path || path.startsWith("/") || posix.normalize(path) !== path)
    throw new Error("O projeto remoto contém um caminho inválido.")
  if (type !== "l") return
  const resolvedTarget = posix.normalize(posix.join(posix.dirname(path), target))
  if (target.startsWith("/") || resolvedTarget === ".." || resolvedTarget.startsWith("../"))
    throw new Error("O projeto remoto contém um link simbólico inseguro.")
}

function parseRemoteManifest(buffer: Buffer): RemoteProjectSyncManifest {
  const fields = buffer.toString("utf8").split("\0")
  const fingerprintEntries: string[] = []
  const entries: RemoteProjectSyncEntry[] = []
  let canonicalPath = ""
  let index = 0
  while (index < fields.length - 1) {
    const marker = fields[index++]
    if (marker === "TUIMINAL_ROOT") {
      canonicalPath = fields[index++] ?? ""
      continue
    }
    if (marker !== "TUIMINAL_ENTRY") throw new Error("Manifesto remoto inválido.")
    const path = fields[index++] ?? ""
    const rawType = fields[index++] ?? ""
    const metadata = fields[index++] ?? ""
    const target = fields[index++] ?? ""
    validateManifestEntry(path, rawType, target)
    const [rawMode = "0", rawSize = "0", rawModifiedAt = "0", rawChangedAt = "0"] =
      metadata.split("|")
    const type = entryType(rawType)
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
    entries.push({
      path,
      type,
      mode: parseRemoteMode(rawMode),
      size,
      modifiedAt,
      changedAt,
      target,
    })
    fingerprintEntries.push(JSON.stringify([path, rawType, metadata, target]))
    if (entries.length > MAX_MANIFEST_ENTRIES)
      throw new Error("O projeto excede o limite de verificação.")
  }
  if (!canonicalPath.startsWith("/"))
    throw new Error("O servidor retornou uma pasta de projeto inválida.")
  return {
    fingerprint: digestEntries(fingerprintEntries),
    canonicalPath,
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
    if (
      previous?.type === "file" &&
      previous.digest &&
      previous.mode === entry.mode &&
      previous.size === entry.size &&
      previous.modifiedAt === entry.modifiedAt &&
      previous.changedAt !== undefined &&
      previous.changedAt === entry.changedAt
    )
      digests.set(entry.path, previous.digest)
    else pending.push(entry.path)
  }
  for (const paths of pathBatches(pending)) {
    const command =
      options.hashCommand?.(paths) ??
      remoteCommand(remote, REMOTE_HASH_SCRIPT, [manifest.canonicalPath, ...paths])
    const output = await collectProjectSyncProcess(command, signal, {
      timeoutMs: options.timeoutMs ?? DETAILED_MANIFEST_TIMEOUT_MS,
      maximumBytes: Math.max(1_024, paths.length * 48),
    })
    const hashes = output.toString("utf8").trim().split(/\r?\n/u)
    if (hashes.length !== paths.length || hashes.some((hash) => !/^[a-f\d]{40}$/u.test(hash)))
      throw new Error("Manifesto remoto inválido.")
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
