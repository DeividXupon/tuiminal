import type { AgentProviderId } from "./agent-provider"
import type { AgentState } from "./agent-state"

export type RemoteCodexIncompatibilityReason =
  | "localCodexMissing"
  | "localVersionInvalid"
  | "remoteCodexMissing"
  | "remoteVersionInvalid"
  | "localOpenCodeMissing"
  | "localOpenCodeVersionInvalid"
  | "remoteOpenCodeMissing"
  | "remoteOpenCodeVersionInvalid"
  | "localClaudeMissing"
  | "remoteClaudeMissing"
  | "claudeVersionInvalid"
  | "claudeVersionUnsupported"
  | "daemonUnavailable"
  | "proxyUnavailable"
  | "versionMismatch"

export type RemoteCodexCompatibilityReport = {
  /** Absent on persisted legacy Codex reports. */
  providerId?: AgentProviderId
  compatible: boolean
  reason: RemoteCodexIncompatibilityReason | null
  localVersion: string | null
  remoteVersion: string | null
  daemonAvailable: boolean
  proxyAvailable: boolean
  remoteUserAgent?: string
}

const COMPATIBILITY_MESSAGES: Record<RemoteCodexIncompatibilityReason, string> = {
  localCodexMissing: "O Codex não está instalado nesta máquina.",
  localVersionInvalid: "A versão local do Codex não pôde ser identificada.",
  remoteCodexMissing: "O Codex não está instalado no servidor remoto.",
  remoteVersionInvalid: "A versão remota do Codex não pôde ser identificada.",
  localOpenCodeMissing: "O OpenCode não está instalado nesta máquina.",
  localOpenCodeVersionInvalid: "A versão local do OpenCode não pôde ser identificada.",
  remoteOpenCodeMissing: "O OpenCode não está instalado no servidor remoto.",
  remoteOpenCodeVersionInvalid: "A versão remota do OpenCode não pôde ser identificada.",
  localClaudeMissing: "O Claude Code não está instalado.",
  remoteClaudeMissing: "O Claude Code não está instalado no servidor remoto.",
  claudeVersionInvalid: "Não foi possível verificar o Claude Code.",
  claudeVersionUnsupported: "O Claude Code 2.1.63 ou superior é necessário para a integração.",
  daemonUnavailable: "O Codex remoto não oferece app-server daemon.",
  proxyUnavailable: "O Codex remoto não oferece app-server proxy.",
  versionMismatch: "As versões local e remota do Codex são incompatíveis.",
}

/** Returns the pt-BR source text; callers translate it where it is displayed. */
export function remoteCodexCompatibilityMessage(
  report: Pick<RemoteCodexCompatibilityReport, "providerId" | "reason">,
) {
  const reason = report.reason ?? "versionMismatch"
  return report.providerId === "opencode" && reason === "versionMismatch"
    ? "As versões local e remota do OpenCode são incompatíveis."
    : COMPATIBILITY_MESSAGES[reason]
}

export type RemoteCodexHydration = {
  revision: number
  threadId: string
  state: AgentState
  latestTurnStatus: "inProgress" | "completed" | "failed" | "interrupted" | "unknown" | null
  waitingOnApproval: boolean
}

export type CodexHydratedThread = Omit<RemoteCodexHydration, "revision">

export type RemoteCodexUpdateGuide = {
  flowId: number
  side: "local" | "remote"
  report: RemoteCodexCompatibilityReport
  checking: boolean
  error: string
}
