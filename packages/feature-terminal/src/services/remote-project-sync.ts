import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import { lstat, mkdir, mkdtemp, opendir, readlink, rename, rm, stat } from "node:fs/promises"
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path"
import type { RemoteCodexTarget } from "../model/sessions"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"

const MANIFEST_TIMEOUT_MS = 15_000
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024
const MAX_MANIFEST_ENTRIES = 250_000

const REMOTE_MANIFEST_SCRIPT = String.raw`
root=$1
cd "$root" || exit 72
canonical=$(pwd -P) || exit 72
printf 'TUIMINAL_ROOT\000%s\000' "$canonical"
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
    metadata=$(stat -c "%f|%s|%Y" -- "$item" 2>/dev/null || stat -f "%p|%z|%m" -- "$item" 2>/dev/null) || exit 74
    printf "TUIMINAL_ENTRY\000%s\000%s\000%s\000%s\000" "$path" "$type" "$metadata" "$target"
  done
' sh {} +
`

const REMOTE_ARCHIVE_SCRIPT = `
root=$1
cd "$root" || exit 72
command -v tar >/dev/null 2>&1 || exit 127
exec tar -cf - .
`

export class RemoteProjectSyncError extends Error {}
export class RemoteProjectSyncCollisionError extends RemoteProjectSyncError {}
export class RemoteProjectSyncLocalChangesError extends RemoteProjectSyncError {}
export class RemoteProjectSyncLocalRaceError extends RemoteProjectSyncError {}

type Manifest = {
  fingerprint: string
  canonicalPath: string
  hasUnsupported: boolean
  hasSymlink: boolean
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function remoteScriptCommand(script: string, path: string) {
  return `exec sh -c ${shellQuote(script)} tuiminal-project-sync ${shellQuote(path)}`
}

function syncCommand(remote: RemoteCodexTarget, script: string) {
  return remoteNonInteractiveSshCommand(
    remote.profile,
    remoteScriptCommand(script, remote.workingDirectory),
  )
}

function abortedError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
}

async function collectProcess(
  command: readonly string[],
  signal: AbortSignal,
  options: { timeoutMs: number; maximumBytes: number },
) {
  signal.throwIfAborted()
  const [executable, ...args] = command
  if (!executable) throw new RemoteProjectSyncError("Comando de sincronização ausente.")
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
      child.once("error", () =>
        reject(new RemoteProjectSyncError("Não foi possível verificar o projeto remoto.")),
      )
      child.once("exit", resolveExit)
    })
    if (signal.aborted) throw abortedError(signal)
    if (limited) throw new RemoteProjectSyncError("O projeto excede o limite de verificação.")
    if (timedOut)
      throw new RemoteProjectSyncError("A verificação do projeto excedeu o tempo limite.")
    if (exitCode !== 0)
      throw new RemoteProjectSyncError(
        stderr.trim() || "Não foi possível verificar o projeto remoto.",
      )
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

function parseRemoteManifest(buffer: Buffer): Manifest {
  const fields = buffer.toString("utf8").split("\0")
  let index = 0
  let canonicalPath = ""
  const entries: string[] = []
  let hasUnsupported = false
  let hasSymlink = false
  while (index < fields.length - 1) {
    const marker = fields[index++]
    if (marker === "TUIMINAL_ROOT") {
      canonicalPath = fields[index++] ?? ""
      continue
    }
    if (marker !== "TUIMINAL_ENTRY") throw new RemoteProjectSyncError("Manifesto remoto inválido.")
    const path = fields[index++] ?? ""
    const type = fields[index++] ?? ""
    const metadata = fields[index++] ?? ""
    const target = fields[index++] ?? ""
    validateManifestEntry(path, type, target)
    hasUnsupported ||= type === "x"
    hasSymlink ||= type === "l"
    entries.push(JSON.stringify([path, type, metadata, target]))
    if (entries.length > MAX_MANIFEST_ENTRIES)
      throw new RemoteProjectSyncError("O projeto excede o limite de verificação.")
  }
  if (!canonicalPath.startsWith("/"))
    throw new RemoteProjectSyncError("O servidor retornou uma pasta de projeto inválida.")
  return { fingerprint: digestEntries(entries), canonicalPath, hasUnsupported, hasSymlink }
}

function validateManifestEntry(path: string, type: string, target: string) {
  if (!path || path.startsWith("/") || path.split("/").includes(".."))
    throw new RemoteProjectSyncError("O projeto remoto contém um caminho inválido.")
  if (type !== "l") return
  const resolvedTarget = posix.normalize(posix.join(posix.dirname(path), target))
  if (target.startsWith("/") || resolvedTarget === ".." || resolvedTarget.startsWith("../"))
    throw new RemoteProjectSyncError("O projeto remoto contém um link simbólico inseguro.")
}

export async function readRemoteProjectFingerprint(
  remote: RemoteCodexTarget,
  signal: AbortSignal,
  options: { command?: readonly string[] } = {},
): Promise<Manifest> {
  const output = await collectProcess(
    options.command ?? syncCommand(remote, REMOTE_MANIFEST_SCRIPT),
    signal,
    {
      timeoutMs: MANIFEST_TIMEOUT_MS,
      maximumBytes: MAX_MANIFEST_BYTES,
    },
  )
  return parseRemoteManifest(output)
}

export function localRemoteProjectManifestCommand(path: string) {
  return ["sh", "-c", REMOTE_MANIFEST_SCRIPT, "tuiminal-project-sync", path]
}

export function localRemoteProjectArchiveCommand(path: string) {
  return ["sh", "-c", REMOTE_ARCHIVE_SCRIPT, "tuiminal-project-sync", path]
}

function localType(metadata: Awaited<ReturnType<typeof lstat>>) {
  if (metadata.isSymbolicLink()) return "l"
  if (metadata.isDirectory()) return "d"
  if (metadata.isFile()) return "f"
  return "x"
}

export async function readLocalProjectFingerprint(path: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const root = resolve(path)
  const entries: string[] = []
  const pending = [root]
  while (pending.length) {
    signal.throwIfAborted()
    const directory = pending.pop()
    if (!directory) break
    const handle = await opendir(directory)
    try {
      for await (const entry of handle) {
        signal.throwIfAborted()
        const absolute = join(directory, entry.name)
        const metadata = await lstat(absolute)
        const type = localType(metadata)
        const target = type === "l" ? await readlink(absolute) : ""
        const pathFromRoot = relative(root, absolute).split(sep).join("/")
        entries.push(
          JSON.stringify([
            pathFromRoot,
            type,
            `${metadata.mode.toString(16)}|${metadata.size}|${Math.floor(metadata.mtimeMs / 1000)}`,
            target,
          ]),
        )
        if (type === "d") pending.push(absolute)
        if (entries.length > MAX_MANIFEST_ENTRIES)
          throw new RemoteProjectSyncError("O projeto excede o limite de verificação.")
      }
    } finally {
      await handle.close().catch(() => undefined)
    }
  }
  return digestEntries(entries)
}

export async function pathExists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  )
}

function cleanLocalName(value: string) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]+/gu, "-")
    .replace(/[. ]+$/u, "")
    .trim()
  return cleaned || "project"
}

export function remoteProjectSyncDestination(parent: string, remotePath: string) {
  const normalized = remotePath.replace(/\/+$/u, "")
  const name = normalized ? basename(normalized) : "root"
  return join(parent, `${cleanLocalName(name)}-sync`)
}

async function writeRemoteArchive(
  remote: RemoteCodexTarget,
  path: string,
  signal: AbortSignal,
  commandOverride?: readonly string[],
) {
  signal.throwIfAborted()
  const command = commandOverride ?? syncCommand(remote, REMOTE_ARCHIVE_SCRIPT)
  const [executable, ...args] = command
  if (!executable) throw new RemoteProjectSyncError("Comando de sincronização ausente.")
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const output = createWriteStream(path, { flags: "wx", mode: 0o600 })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384)
  })
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

async function publishStaging(staging: string, destination: string) {
  const parent = dirname(destination)
  const backup = join(parent, `.${basename(destination)}.tuiminal-backup-${randomUUID()}`)
  const existing = await pathExists(destination)
  if (existing) await rename(destination, backup)
  try {
    await rename(staging, destination)
  } catch (error) {
    if (existing) await rename(backup, destination).catch(() => undefined)
    throw error
  }
  if (existing) await rm(backup, { recursive: true, force: true })
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

export async function synchronizeRemoteProject(options: {
  remote: RemoteCodexTarget
  destination: string
  signal: AbortSignal
  beforePublish?: () => Promise<void>
  commands?: { manifest: readonly string[]; archive: readonly string[] }
}) {
  const { remote, destination, signal } = options
  const manifestOptions = options.commands ? { command: options.commands.manifest } : {}
  await mkdir(dirname(destination), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted()
    const before = await readRemoteProjectFingerprint(remote, signal, manifestOptions)
    if (before.hasUnsupported)
      throw new RemoteProjectSyncError("O projeto remoto contém um tipo de arquivo não suportado.")
    if (process.platform === "win32" && before.hasSymlink)
      throw new RemoteProjectSyncError(
        "Este projeto contém links simbólicos não suportados no Windows.",
      )
    const transaction = await mkdtemp(join(dirname(destination), ".tuiminal-project-sync-"))
    const archivePath = join(transaction, "project.tar")
    const staging = join(transaction, "next")
    try {
      await writeRemoteArchive(remote, archivePath, signal, options.commands?.archive)
      const after = await readRemoteProjectFingerprint(remote, signal, manifestOptions)
      if (before.fingerprint !== after.fingerprint) {
        if (attempt === 0) continue
        throw new RemoteProjectSyncError("O projeto remoto mudou durante a sincronização.")
      }
      await mkdir(staging)
      await extractArchive(archivePath, staging, signal)
      const localFingerprint = await readLocalProjectFingerprint(staging, signal)
      await options.beforePublish?.()
      await publishStaging(staging, destination)
      return {
        remotePath: after.canonicalPath,
        remoteFingerprint: after.fingerprint,
        localFingerprint,
      }
    } finally {
      await rm(transaction, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  throw new RemoteProjectSyncError("Não foi possível obter uma cópia estável do projeto remoto.")
}
