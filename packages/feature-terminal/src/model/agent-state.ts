export type AgentProfile =
  | "amp"
  | "antigravity"
  | "claude"
  | "cline"
  | "codex"
  | "copilot"
  | "cursor"
  | "devin"
  | "droid"
  | "gemini"
  | "grok"
  | "hermes"
  | "kilo"
  | "kimi"
  | "kiro"
  | "letta"
  | "maki"
  | "mastracode"
  | "muse"
  | "omp"
  | "opencode"
  | "pi"
  | "qodercli"
  | "qwen"
  | "generic"
export type AgentState = "unknown" | "working" | "blocked" | "idle" | "done"
export type AgentActivity =
  | "reading"
  | "searching"
  | "thinking"
  | "writing"
  | "running"
  | "updating"
  | "coding"
  | "tooling"
export type AgentIdentity = { key: string; label: string; profile: AgentProfile }
export type AgentStatus = AgentIdentity & {
  state: AgentState
  activity: AgentActivity | null
  /** Optional task/session summary published by the agent through its terminal title. */
  taskTitle?: string | null
}
export type AgentSignal = {
  state: Exclude<AgentState, "done">
  activity?: AgentActivity | null
  source?: "screen" | "title"
  skip?: boolean
}
export type AgentObservation = {
  status: AgentStatus
  hadWork: boolean
  idleSince: number | null
  unknownSince: number | null
}

/** Explicit idle needs a stable prompt; silence alone never means completion. */
export const AGENT_IDLE_CONFIRM_MS = 700
export const AGENT_UNKNOWN_GRACE_MS = 3000

export function observeAgent(
  previous: AgentObservation | undefined,
  identity: AgentIdentity,
  signal: AgentSignal,
  seen: boolean,
  now: number,
): AgentObservation {
  const current = previous?.status.key === identity.key ? previous : undefined
  const next: AgentObservation = current
    ? { ...current, status: { ...current.status } }
    : {
        status: { ...identity, state: "unknown", activity: null },
        hadWork: false,
        idleSince: null,
        unknownSince: null,
      }
  if (seen && next.status.state === "done") next.status.state = "idle"
  if (signal.skip) {
    next.idleSince = null
    next.unknownSince = null
    return next
  }
  if (signal.state === "working") {
    next.hadWork = true
    next.idleSince = null
    next.unknownSince = null
    next.status = { ...identity, state: "working", activity: signal.activity ?? null }
    return next
  }
  if (signal.state === "blocked") {
    next.idleSince = null
    next.unknownSince = null
    next.status = { ...identity, state: "blocked", activity: null }
    return next
  }
  if (signal.state === "unknown") {
    next.idleSince = null
    if (next.status.state === "done") return next
    next.unknownSince ??= now
    if (now - next.unknownSince >= AGENT_UNKNOWN_GRACE_MS) {
      next.status = { ...identity, state: "unknown", activity: null }
    }
    return next
  }
  next.unknownSince = null
  next.idleSince ??= now
  if (next.hadWork && now - next.idleSince < AGENT_IDLE_CONFIRM_MS) return next
  const unseen = next.status.state === "done" || (next.hadWork && !seen)
  next.status = { ...identity, state: unseen && !seen ? "done" : "idle", activity: null }
  next.hadWork = false
  return next
}

export function sameAgentStatus(a: AgentStatus | null, b: AgentStatus | null) {
  return (
    a === b ||
    Boolean(
      a &&
        b &&
        a.key === b.key &&
        a.state === b.state &&
        a.activity === b.activity &&
        (a.taskTitle ?? null) === (b.taskTitle ?? null),
    )
  )
}
