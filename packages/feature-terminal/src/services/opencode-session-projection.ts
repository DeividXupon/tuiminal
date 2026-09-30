import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import type { AgentProviderDefinition } from "../model/agent-provider"
import { cleanTerminalName } from "../model/sessions"
import type { OpenCodeHydration } from "./opencode-api"

type ProjectedOpenCodeSession = {
  id: string
  agent: {
    key: string
    label: string
    profile: AgentProviderDefinition["profile"]
    state: OpenCodeHydration["state"]
    activity: OpenCodeHydration["activity"]
    taskTitle?: string
  }
  updatedAt: number
  waitingOnApproval: boolean
}

export class OpenCodeSessionProjection {
  private readonly sessions = new Map<string, ProjectedOpenCodeSession>()
  private readonly messages = new Map<string, readonly AgentMessageHistoryEntry[]>()
  private activeSessionId: string | undefined

  constructor(
    private readonly terminalId: string,
    private readonly provider: AgentProviderDefinition,
    activeSessionId?: string,
  ) {
    this.activeSessionId = activeSessionId
  }

  upsert(hydration: OpenCodeHydration) {
    const title = cleanTerminalName(hydration.session.title)
    this.sessions.set(hydration.session.id, {
      id: hydration.session.id,
      agent: {
        key: `${this.provider.id}-app-server:${this.terminalId}`,
        label: this.provider.label,
        profile: this.provider.profile,
        state: hydration.state,
        activity: hydration.state === "working" ? hydration.activity : null,
        ...(title ? { taskTitle: title } : {}),
      },
      updatedAt: hydration.session.updatedAt,
      waitingOnApproval: hydration.waitingOnApproval,
    })
    this.messages.set(hydration.session.id, hydration.messages)
    if (!this.activeSessionId) this.activeSessionId = hydration.session.id
  }

  remove(sessionId: string) {
    this.sessions.delete(sessionId)
    this.messages.delete(sessionId)
    if (this.activeSessionId === sessionId) this.activeSessionId = undefined
  }

  activate(sessionId: string) {
    this.activeSessionId = sessionId
  }

  has(sessionId: string) {
    return this.sessions.has(sessionId)
  }

  snapshot() {
    const sessions = [...this.sessions.values()]
    const active =
      (this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined) ??
      sessions.at(-1)
    if (active) this.activeSessionId = active.id
    return {
      sessions,
      active,
      messages: active ? (this.messages.get(active.id) ?? []) : [],
    }
  }
}
