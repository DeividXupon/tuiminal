import type { LiveDiffFile, LiveDiffFileStatus } from "../model/live-diff"
import {
  parseLiveDiffNameStatus,
  parseLiveDiffNumstat,
  parseLiveDiffStatus,
} from "../model/live-diff"
import type { RemoteCodexTarget } from "../model/sessions"
import { remoteLiveDiffSshCommand } from "./remote-live-diff-helper"
import {
  RemoteLiveDiffProtocol,
  type RemoteLiveDiffProtocolResult,
} from "./remote-live-diff-protocol"

export {
  localRemoteLiveDiffHelperCommand,
  remoteLiveDiffHelperCommand,
  remoteLiveDiffSshCommand,
} from "./remote-live-diff-helper"

const MAX_FILE_BYTES = 1024 * 1024
const MAX_FILE_ENTRIES = 1000
const MAX_ROOTS = 4

type RemoteLiveDiffSourceOptions = {
  command?: readonly string[]
  requestTimeoutMs?: number
}

export type LiveDiffSource = {
  repositoryRoot: (directory: string, signal: AbortSignal) => Promise<string | null>
  worktrees: (root: string, signal: AbortSignal) => Promise<string[]>
  readRoot: (
    root: string,
    signal: AbortSignal,
  ) => Promise<{ files: Omit<LiveDiffFile, "changedAt">[]; truncated: boolean }>
  readPatch: (file: LiveDiffFile, signal: AbortSignal) => Promise<string>
  close: () => void
}

function commandError(operation: string, result: RemoteLiveDiffProtocolResult) {
  return new Error(
    result.stderr.trim() || `Operação remota ${operation} falhou com código ${result.status}.`,
  )
}

function safeRemotePath(value: string) {
  return Boolean(
    value &&
      !value.startsWith("/") &&
      !value.split("/").includes("..") &&
      !/[\p{Cc}\p{Cf}]/u.test(value),
  )
}

function safeRemoteRoot(value: string) {
  return Boolean(value.startsWith("/") && !/[\p{Cc}\p{Cf}]/u.test(value))
}

function liveDiffChange(code: string, untracked: boolean, headExists: boolean): LiveDiffFileStatus {
  if (untracked || !headExists || code === "A") return "New"
  if (code === "D") return "Delete"
  if (code === "R") return "Rename"
  if (code === "C") return "Copy"
  if (code === "T") return "Type"
  return "Edit"
}

function parseFileInfo(source: string, count: number) {
  const lines = source.trimEnd().split("\n")
  return Array.from({ length: count }, (_, index) => {
    const [rawSize = "-", mtime = "-", hash = "-", rawLines = "-", binary = "-"] = (
      lines[index] ?? ""
    ).split("\t")
    const size = Number(rawSize)
    const lineCount = Number(rawLines)
    return {
      size: Number.isFinite(size) ? size : null,
      mtime,
      hash,
      lines: Number.isFinite(lineCount) ? lineCount : null,
      binary: binary === "1",
    }
  })
}

function untrackedPatch(file: LiveDiffFile, source: string) {
  if (source.includes("\0")) return ""
  const lines = source ? source.replace(/\n$/, "").split("\n") : []
  const header = `diff --git a/${file.path} b/${file.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${file.path}`
  if (!lines.length) return `${header}\n`
  return `${header}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`
}

export function createRemoteLiveDiffSource(
  remote: RemoteCodexTarget,
  options: RemoteLiveDiffSourceOptions = {},
): LiveDiffSource {
  let protocol: RemoteLiveDiffProtocol | null = null
  let disposed = false
  const command =
    options.command ?? remoteLiveDiffSshCommand(remote.profile, remote.workingDirectory)
  const request = (operation: string, fields: readonly string[], signal: AbortSignal) => {
    if (disposed) return Promise.reject(new Error("Live Diff remoto fechado."))
    if (!protocol || protocol.closed)
      protocol = new RemoteLiveDiffProtocol(command, options.requestTimeoutMs)
    return protocol.request(operation, fields, signal)
  }

  return {
    async repositoryRoot(_directory, signal) {
      const result = await request("root", [], signal)
      if (result.status !== 0) return null
      const root = result.stdout.trim()
      return safeRemoteRoot(root) ? root : null
    },
    async worktrees(root, signal) {
      if (!safeRemoteRoot(root)) return []
      const result = await request("worktrees", [root], signal)
      if (result.status !== 0) throw commandError("worktrees", result)
      return result.stdout
        .split("\n")
        .filter((line) => line.startsWith("worktree "))
        .map((line) => line.slice(9))
        .filter(safeRemoteRoot)
        .slice(0, MAX_ROOTS)
    },
    async readRoot(root, signal) {
      if (!safeRemoteRoot(root)) throw new Error("Raiz remota inválida.")
      const statusResult = await request("status", [root], signal)
      if (statusResult.status !== 0) throw commandError("status", statusResult)
      const parsedStatus = parseLiveDiffStatus(statusResult.stdout)
      const safeStatus = parsedStatus.filter(
        (entry) =>
          safeRemotePath(entry.path) && (!entry.originalPath || safeRemotePath(entry.originalPath)),
      )
      const limited = safeStatus.slice(0, MAX_FILE_ENTRIES)
      const headResult = await request("head", [root], signal)
      const headExists = headResult.status === 0
      const [nameStatusResult, numstatResult] = headExists
        ? await Promise.all([
            request("name-status", [root], signal),
            request("numstat", [root], signal),
          ])
        : [
            { status: 0, stdout: "", stderr: "" },
            { status: 0, stdout: "", stderr: "" },
          ]
      if (nameStatusResult.status !== 0) throw commandError("name-status", nameStatusResult)
      if (numstatResult.status !== 0) throw commandError("numstat", numstatResult)
      const detected = parseLiveDiffNameStatus(nameStatusResult.stdout)
      const numstat = parseLiveDiffNumstat(numstatResult.stdout)
      const records = limited
        .map((entry) => `${entry.status === "??" ? "U" : "T"}${entry.path}`)
        .join("\n")
      const infoResult = await request("file-info", [root, records], signal)
      if (infoResult.status !== 0) throw commandError("file-info", infoResult)
      const info = parseFileInfo(infoResult.stdout, limited.length)
      const files = limited.map((entry, index) => {
        const untracked = entry.status === "??"
        const detectedChange = detected.get(entry.path)
        const code = detectedChange?.code ?? entry.status.replaceAll(" ", "")[0] ?? "M"
        const change = liveDiffChange(code, untracked, headExists)
        const metadata = info[index]
        let stats = numstat.get(entry.path) ?? { additions: null, deletions: null }
        if (untracked && metadata && metadata.size !== null && metadata.size <= MAX_FILE_BYTES)
          stats = metadata.binary
            ? { additions: null, deletions: null }
            : { additions: metadata.lines, deletions: 0 }
        return {
          root,
          path: entry.path,
          additions: stats.additions,
          deletions: stats.deletions,
          ...(detectedChange?.originalPath ? { originalPath: detectedChange.originalPath } : {}),
          fingerprint: `${change}\0${detectedChange?.originalPath ?? ""}\0${stats.additions}\0${stats.deletions}\0${metadata?.mtime ?? "-"}\0${metadata?.size ?? "-"}\0${metadata?.hash ?? "-"}`,
          untracked,
          newFile: change === "New",
          change,
          headExists,
        }
      })
      return {
        files,
        truncated:
          parsedStatus.length > MAX_FILE_ENTRIES || safeStatus.length !== parsedStatus.length,
      }
    },
    async readPatch(file, signal) {
      if (file.additions === null && file.deletions === null) return ""
      if (!safeRemoteRoot(file.root) || !safeRemotePath(file.path)) return ""
      if (!file.untracked && file.headExists) {
        const result = await request(
          "patch",
          [file.root, file.path, file.originalPath ?? ""],
          signal,
        )
        if (result.status !== 0) return ""
        return Buffer.byteLength(result.stdout) <= MAX_FILE_BYTES ? result.stdout : ""
      }
      const result = await request("read-file", [file.root, file.path], signal)
      if (result.status !== 0 || Buffer.byteLength(result.stdout) > MAX_FILE_BYTES) return ""
      return untrackedPatch(file, result.stdout)
    },
    close() {
      disposed = true
      protocol?.close()
      protocol = null
    },
  }
}
