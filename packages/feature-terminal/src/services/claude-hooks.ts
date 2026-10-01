import type {
  AgentMessageActivityEntry,
  AgentMessageHistoryEntry,
  AgentMessageTurnStatus,
} from "../model/agent-message-history"
import {
  cleanAgentDetailText,
  cleanAgentMessage,
  EMPTY_AGENT_MESSAGE_TURN_DETAIL,
} from "../model/agent-message-history"
import type { AgentActivity, AgentIdentity, AgentState } from "../model/agent-state"
import { agentTaskTitle } from "../model/agent-task-title"
import { type ClaudeResumeThread, isClaudeSessionId } from "../model/claude-resume-threads"
import { projectName } from "../model/project-name"
import type { CodexHydratedThread } from "../model/remote-codex"
import { rememberClaudeResumeThread } from "./claude-resume-store"

type RecordValue = Record<string, unknown>

const CLAUDE_IDENTITY: AgentIdentity = {
  key: "claude-title",
  label: "Claude Code",
  profile: "claude",
}

export type ClaudeHookEvents = {
  onActivity: (activity: AgentActivity) => void
  onState: (state: AgentState) => void
  onTitle: (title: string) => void
  onUserMessageHistory: (messages: readonly AgentMessageHistoryEntry[], replace: boolean) => void
  onHydrated?: (thread: CodexHydratedThread) => void
  onObserved?: () => void
  onError: (message: string) => void
}

export type ClaudeHookContext = {
  cwd: string
  remoteProfileId?: string
  remoteProfileName?: string
  remoteProfileHost?: string
  resumeThreadId?: string
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function string(value: unknown) {
  return typeof value === "string" ? value : ""
}

function identifier(value: unknown) {
  return Array.from(cleanAgentMessage(string(value)))
    .slice(0, 256)
    .join("")
}

function toolActivity(name: string): AgentActivity {
  if (/^(?:Read|NotebookRead)$/iu.test(name)) return "reading"
  if (/^(?:Glob|Grep|WebFetch|WebSearch)$/iu.test(name)) return "searching"
  if (/^(?:Write|Edit|NotebookEdit)$/iu.test(name)) return "coding"
  if (/^(?:Bash|PowerShell)$/iu.test(name)) return "running"
  if (/^(?:TaskCreate|TaskUpdate|TodoWrite)$/iu.test(name)) return "updating"
  return "tooling"
}

function toolDetail(name: string, value: unknown) {
  const input = object(value)
  if (!input) return ""
  const candidate =
    string(input.file_path) ||
    string(input.path) ||
    string(input.pattern) ||
    string(input.query) ||
    string(input.command) ||
    string(input.description)
  if (candidate) return cleanAgentDetailText(candidate, 4_000)
  if (/^(?:AskUserQuestion|Agent|Task|Workflow)$/iu.test(name))
    return cleanAgentDetailText(JSON.stringify(input), 4_000)
  return ""
}

// Claude submits its own task notifications, channel and teammate messages as prompts
// wrapped in one element; the hook payload carries no origin to tell them apart.
const INJECTED_PROMPT = /^<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*<\/\1>$/u

function hookTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value < 10_000_000_000 ? value * 1_000 : value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

export class ClaudeHookObserver {
  private sequence = 0
  private sessionId: string | null
  private active: AgentMessageHistoryEntry | null = null
  private title = ""
  private promptTitle = ""
  private terminalTitle: string | null = null
  private activity: AgentActivity = "thinking"
  private preview = ""
  private lastResponse = ""

  constructor(
    private readonly context: ClaudeHookContext,
    private readonly events: ClaudeHookEvents,
  ) {
    this.sessionId = isClaudeSessionId(context.resumeThreadId) ? context.resumeThreadId : null
  }

  private hydration(state: AgentState, status: AgentMessageTurnStatus | null, waiting: boolean) {
    if (!this.sessionId) return
    this.events.onHydrated?.({
      threadId: this.sessionId,
      state,
      latestTurnStatus: status === "queued" ? "inProgress" : status,
      waitingOnApproval: waiting,
    })
  }

  private remember(state: ClaudeResumeThread["state"]) {
    if (!this.sessionId) return
    try {
      rememberClaudeResumeThread({
        id: this.sessionId,
        title: this.title || "Claude Code",
        preview: this.preview,
        lastResponse: this.lastResponse,
        cwd: this.context.cwd,
        projectName: projectName(this.context.cwd),
        gitBranch: "",
        updatedAt: Date.now(),
        state,
        ...(this.context.remoteProfileId ? { remoteProfileId: this.context.remoteProfileId } : {}),
        ...(this.context.remoteProfileName
          ? { remoteProfileName: this.context.remoteProfileName }
          : {}),
        ...(this.context.remoteProfileHost
          ? { remoteProfileHost: this.context.remoteProfileHost }
          : {}),
      })
    } catch {
      // Resume metadata must never interrupt the official Claude TUI.
    }
  }

  private publishActive() {
    if (this.active) this.events.onUserMessageHistory([this.active], false)
  }

  private updateActive(update: Partial<AgentMessageHistoryEntry>) {
    if (!this.active) return
    this.active = { ...this.active, ...update }
    this.publishActive()
  }

  private addActivity(entry: AgentMessageActivityEntry) {
    if (!this.active) return
    this.active = {
      ...this.active,
      activities: [
        ...this.active.activities.filter((candidate) => candidate.id !== entry.id),
        entry,
      ].slice(-200),
    }
    this.publishActive()
  }

  private acceptSession(event: RecordValue) {
    const incomingSessionId = event.session_id
    if (!isClaudeSessionId(incomingSessionId) || incomingSessionId === this.sessionId) return
    this.sessionId = incomingSessionId
    this.active = null
    this.promptTitle = ""
    this.publishTitle()
    this.events.onUserMessageHistory([], true)
  }

  private startSession() {
    this.events.onState("idle")
    this.hydration("idle", null, false)
    this.remember("idle")
  }

  private submitPrompt(event: RecordValue) {
    const prompt = cleanAgentMessage(string(event.prompt))
    const sentAt = hookTimestamp(event.timestamp)
    const promptId = identifier(event.prompt_id) || `${sentAt}:${++this.sequence}`
    if (!INJECTED_PROMPT.test(string(event.prompt).trim())) {
      this.preview = prompt
      if (!this.promptTitle) this.promptTitle = Array.from(prompt).slice(0, 160).join("")
    }
    this.active = {
      id: `claude:${this.sessionId ?? "pending"}:${promptId}`,
      turnId: promptId,
      text: prompt,
      sentAt,
      durationMs: null,
      status: "inProgress",
      hasImage: false,
      hasAudio: false,
      hasSkill: false,
      model: cleanAgentMessage(string(event.model)) || null,
      effort: null,
      serviceTier: null,
      ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
    }
    this.publishTitle()
    this.publishActive()
    this.activity = "thinking"
    this.events.onState("working")
    this.events.onActivity(this.activity)
    this.hydration("working", "inProgress", false)
    this.remember("working")
  }

  private observeTool(event: RecordValue, name: string) {
    const tool = cleanAgentMessage(string(event.tool_name)) || "Ferramenta"
    const id = identifier(event.tool_use_id) || `${tool}:${++this.sequence}`
    this.addActivity({
      id,
      kind: /^(?:Bash|PowerShell)$/iu.test(tool)
        ? "command"
        : /^(?:Write|Edit|NotebookEdit)$/iu.test(tool)
          ? "change"
          : "tool",
      label: tool,
      detail: toolDetail(tool, event.tool_input),
      at: Date.now(),
    })
    // Hooks expose no model-generation event, so the latest public activity holds
    // until the next tool, displayed text or turn boundary, as Codex items do.
    if (name === "PreToolUse") this.activity = toolActivity(tool)
    // State first: entering "working" resets the launcher's activity to "thinking".
    this.events.onState("working")
    this.events.onActivity(this.activity)
    this.hydration("working", "inProgress", false)
  }

  private displayMessage() {
    // A late display after Stop must not reopen a finished turn.
    if (this.active?.status !== "inProgress") return
    this.activity = "writing"
    this.events.onActivity(this.activity)
  }

  /** Claude's published OSC title: /rename, its generated session title, or its default. */
  observeTerminalTitle(raw: string) {
    const title = agentTaskTitle(CLAUDE_IDENTITY, raw)
    if (title === undefined) return
    this.terminalTitle = title
    this.publishTitle()
  }

  // The first prompt only stands in until Claude publishes its own session title.
  private publishTitle() {
    const title = this.terminalTitle ?? this.promptTitle
    if (title === this.title) return
    this.title = title
    this.events.onTitle(title)
  }

  private block() {
    this.events.onState("blocked")
    this.hydration("blocked", "inProgress", true)
    this.remember("blocked")
  }

  private notify(event: RecordValue) {
    const type = string(event.notification_type)
    if (
      type === "permission_prompt" ||
      type === "elicitation_dialog" ||
      type === "elicitation_url_dialog" ||
      type === "agent_needs_input"
    )
      this.block()
    else if (type === "idle_prompt") {
      this.events.onState("idle")
      this.hydration("idle", this.active?.status ?? null, false)
      this.remember("idle")
    }
  }

  private stop(event: RecordValue, failed: boolean) {
    const response = cleanAgentDetailText(string(event.last_assistant_message), 40_000)
    this.lastResponse = response || this.lastResponse
    if (this.active) {
      const durationMs = Math.max(0, Date.now() - this.active.sentAt)
      this.updateActive({
        durationMs,
        status: failed ? "failed" : "completed",
        finalResponse: response,
      })
      if (response)
        this.addActivity({
          id: `${this.active.id}:response`,
          kind: "response",
          label: response,
          detail: "",
          at: Date.now(),
        })
    }
    this.hydration(failed ? "unknown" : "done", failed ? "failed" : "completed", false)
    this.events.onState(failed ? "unknown" : "done")
    this.remember(failed ? "failed" : "idle")
  }

  private endSession() {
    const completed = this.active?.status === "completed"
    if (this.active?.status === "inProgress")
      this.updateActive({
        durationMs: Math.max(0, Date.now() - this.active.sentAt),
        status: "interrupted",
      })
    this.events.onState(completed ? "done" : "unknown")
    this.remember("idle")
  }

  receive(value: unknown) {
    const event = object(value)
    if (!event) return
    const name = string(event.hook_event_name)
    if (
      !OBSERVED_HOOKS.includes(name as (typeof OBSERVED_HOOKS)[number]) &&
      name !== "StopFailure" &&
      name !== "MessageDisplay"
    )
      return
    this.events.onObserved?.()
    this.acceptSession(event)
    switch (name) {
      case "SessionStart":
        return this.startSession()
      case "UserPromptSubmit":
        return this.submitPrompt(event)
      case "PreToolUse":
      case "PostToolUse":
      case "PostToolUseFailure":
        return this.observeTool(event, name)
      case "PermissionRequest":
        return this.block()
      case "Notification":
        return this.notify(event)
      case "MessageDisplay":
        return this.displayMessage()
      case "Stop":
        return this.stop(event, false)
      case "StopFailure":
        return this.stop(event, true)
      case "SessionEnd":
        return this.endSession()
    }
  }
}

const OBSERVED_HOOKS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "Stop",
  "SessionEnd",
] as const

/**
 * MessageDisplay (Claude Code 2.1.152+) holds each displayed text chunk until its hook
 * answers, so its shorter timeout bounds a stalled SSH tunnel.
 */
export function claudeHookSettings(
  url: string,
  options: { messageDisplay?: boolean; backgroundInPlace?: boolean } = {},
) {
  const handler = { type: "http", url, timeout: 2 }
  const hooks: Record<string, unknown> = Object.fromEntries(
    OBSERVED_HOOKS.map((event) => [event, [{ hooks: [{ ...handler }] }]]),
  )
  if (options.messageDisplay) hooks.MessageDisplay = [{ hooks: [{ ...handler, timeout: 1 }] }]
  return JSON.stringify({
    hooks,
    ...(options.backgroundInPlace ? { worktree: { bgIsolation: "none" } } : {}),
  })
}

/** Persistent workers must not retain a hook URL owned by one disposable attachment. */
export function claudeBackgroundSettings() {
  return JSON.stringify({ worktree: { bgIsolation: "none" } })
}
