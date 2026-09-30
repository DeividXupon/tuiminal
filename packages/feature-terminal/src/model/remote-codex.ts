import type { AgentState } from "./agent-state"

export type RemoteCodexIncompatibilityReason =
  | "localCodexMissing"
  | "localVersionInvalid"
  | "remoteCodexMissing"
  | "remoteVersionInvalid"
  | "daemonUnavailable"
  | "proxyUnavailable"
  | "versionMismatch"

export type RemoteCodexCompatibilityReport = {
  compatible: boolean
  reason: RemoteCodexIncompatibilityReason | null
  localVersion: string | null
  remoteVersion: string | null
  daemonAvailable: boolean
  proxyAvailable: boolean
  remoteUserAgent?: string
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
