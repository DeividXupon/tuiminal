import type {
  RemoteCodexCompatibilityReport,
  RemoteCodexIncompatibilityReason,
} from "../model/remote-codex"
import { REMOTE_CODEX_PREFLIGHT_MARKER } from "./remote-codex-connection"

export type {
  RemoteCodexCompatibilityReport,
  RemoteCodexIncompatibilityReason,
} from "../model/remote-codex"

const COMPATIBILITY_MESSAGES: Record<RemoteCodexIncompatibilityReason, string> = {
  localCodexMissing: "O Codex não está instalado nesta máquina.",
  localVersionInvalid: "A versão local do Codex não pôde ser identificada.",
  remoteCodexMissing: "O Codex não está instalado no servidor remoto.",
  remoteVersionInvalid: "A versão remota do Codex não pôde ser identificada.",
  localOpenCodeMissing: "O OpenCode não está instalado nesta máquina.",
  localOpenCodeVersionInvalid: "A versão local do OpenCode não pôde ser identificada.",
  remoteOpenCodeMissing: "O OpenCode não está instalado no servidor remoto.",
  remoteOpenCodeVersionInvalid: "A versão remota do OpenCode não pôde ser identificada.",
  daemonUnavailable: "O Codex remoto não oferece app-server daemon.",
  proxyUnavailable: "O Codex remoto não oferece app-server proxy.",
  versionMismatch: "As versões local e remota do Codex são incompatíveis.",
}

export class RemoteCodexCompatibilityError extends Error {
  constructor(readonly report: RemoteCodexCompatibilityReport) {
    super(
      report.providerId === "opencode" && (report.reason ?? "versionMismatch") === "versionMismatch"
        ? "As versões local e remota do OpenCode são incompatíveis."
        : COMPATIBILITY_MESSAGES[report.reason ?? "versionMismatch"],
    )
    this.name = "RemoteCodexCompatibilityError"
  }
}

export function parseCodexVersion(value: string) {
  const match = value.match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?:[-+][\d.A-Za-z-]+)?/u)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return {
    value: `${match[1]}.${match[2]}.${match[3]}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function compatibleCodexVersions(localValue: string, remoteValue: string) {
  const local = parseCodexVersion(localValue)
  const remote = parseCodexVersion(remoteValue)
  if (!local || !remote || local.major !== remote.major) return false
  return local.major === 0 ? local.minor === remote.minor : true
}

export function localCodexCompatibility(exitCode: number, stdout: string, stderr: string) {
  const version = parseCodexVersion(`${stdout}\n${stderr}`)?.value ?? null
  if (exitCode === 127 || (!stdout.trim() && !stderr.trim()))
    return { version: null, reason: "localCodexMissing" as const }
  if (exitCode !== 0 || !version) return { version: null, reason: "localVersionInvalid" as const }
  return { version, reason: null }
}

export function remoteCodexCompatibility(stdout: string) {
  const marker = stdout.indexOf(`${REMOTE_CODEX_PREFLIGHT_MARKER}\nVERSION\n`)
  const daemonMarker = stdout.lastIndexOf("\nDAEMON=")
  const proxyMarker = stdout.lastIndexOf("\nPROXY=")
  const version =
    marker >= 0 && daemonMarker > marker
      ? (parseCodexVersion(
          stdout.slice(marker + REMOTE_CODEX_PREFLIGHT_MARKER.length + 9, daemonMarker),
        )?.value ?? null)
      : null
  const daemonAvailable = daemonMarker >= 0 && stdout.slice(daemonMarker).startsWith("\nDAEMON=1")
  const proxyAvailable = proxyMarker >= 0 && stdout.slice(proxyMarker).startsWith("\nPROXY=1")
  return {
    version,
    daemonAvailable,
    proxyAvailable,
    reason: version ? null : ("remoteVersionInvalid" as const),
  }
}

export function remoteCodexCompatibilityReport(
  local: { version: string | null; reason: RemoteCodexIncompatibilityReason | null },
  remote: {
    version: string | null
    reason: RemoteCodexIncompatibilityReason | null
    daemonAvailable: boolean
    proxyAvailable: boolean
  },
): RemoteCodexCompatibilityReport {
  const reason =
    local.reason ??
    remote.reason ??
    (!remote.daemonAvailable
      ? "daemonUnavailable"
      : !remote.proxyAvailable
        ? "proxyUnavailable"
        : local.version && remote.version && !compatibleCodexVersions(local.version, remote.version)
          ? "versionMismatch"
          : null)
  return {
    compatible: reason === null,
    reason,
    localVersion: local.version,
    remoteVersion: remote.version,
    daemonAvailable: remote.daemonAvailable,
    proxyAvailable: remote.proxyAvailable,
  }
}
