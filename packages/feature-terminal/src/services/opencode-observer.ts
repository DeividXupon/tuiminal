import type { AgentMessageFileChange } from "../model/agent-message-history"
import { agentTaskTitle } from "../model/agent-task-title"
import {
  type OpenCodeActivity,
  type OpenCodeHydration,
  type OpenCodeObserverEvents,
  parseOpenCodeSession,
} from "./opencode-api"
import {
  openCodeEventDeletedSessionId,
  openCodeEventDirectory,
  openCodeEventSession,
  openCodeEventSessionId,
  openCodeEventSessionParentId,
  openCodeEventTitle,
  unwrapOpenCodeEvent,
} from "./opencode-events"
import {
  fetchOpenCodeJson,
  hydratedOpenCodeState,
  listOpenCodeSessions,
  openCodeApiUrl,
  openCodeMessageDiffs,
  openCodeMessageHistory,
  openCodeSessionMessages,
  openCodeStatusState,
} from "./opencode-hydration"
import { applyOpenCodeLiveEvent } from "./opencode-live-event"
import type { OpenCodeServerProtocol } from "./opencode-protocol"

export { fetchOpenCodeJson, listOpenCodeSessions } from "./opencode-hydration"

function eventNeedsHydration(type: unknown) {
  return (
    typeof type === "string" &&
    (type.startsWith("message.") ||
      type.startsWith("session.") ||
      type.startsWith("permission.") ||
      type.startsWith("question.") ||
      type.startsWith("form."))
  )
}

type ObservedOpenCodeSession = OpenCodeHydration & {
  diffs: Map<string, readonly AgentMessageFileChange[]>
  toolActivities: Map<string, OpenCodeActivity>
  /** Prevents a lagging /active snapshot from reopening a settled execution. */
  settled: boolean
}

export class OpenCodeObserver {
  private readonly controller = new AbortController()
  private readonly baseline = new Map<string, OpenCodeHydration["session"]>()
  private readonly sessions = new Map<string, ObservedOpenCodeSession>()
  private activeSessionId: string | null
  private readonly hydrationTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingHydrations = new Set<string>()
  private readonly hydrating = new Set<string>()
  private readonly maximumSessions = 24
  private readonly maximumHydrations = 4

  constructor(
    private readonly baseUrl: string,
    private readonly directory: string,
    resumeSessionId: string | undefined,
    private readonly events: OpenCodeObserverEvents,
    private readonly protocol: OpenCodeServerProtocol = "v1",
    private readonly authorization?: string,
  ) {
    this.activeSessionId = resumeSessionId ?? null
  }

  async start(signal: AbortSignal) {
    signal.addEventListener("abort", () => this.stop(), { once: true })
    const sessions = await listOpenCodeSessions(
      this.baseUrl,
      this.directory,
      this.controller.signal,
      this.protocol,
      this.authorization,
    )
    for (const session of sessions) this.baseline.set(session.id, session)
    if (this.activeSessionId) {
      const session = this.baseline.get(this.activeSessionId)
      if (session) this.track(session, true)
    }
    const response = await fetch(
      openCodeApiUrl(
        this.baseUrl,
        this.protocol === "v2" ? "/api/event" : "/event",
        this.directory,
      ),
      {
        headers: {
          accept: "text/event-stream",
          ...(this.authorization ? { authorization: this.authorization } : {}),
        },
        signal: this.controller.signal,
      },
    )
    if (!response.ok || !response.body)
      throw new Error("Não foi possível observar os eventos públicos do OpenCode.")
    void this.consume(response.body).catch((error: unknown) => this.reportError(error))
  }

  private async consume(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        buffer = buffer.replaceAll("\r\n", "\n")
        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n")
          if (data) {
            try {
              this.observeEvent(JSON.parse(data))
            } catch {}
          }
          boundary = buffer.indexOf("\n\n")
        }
        if (buffer.length > 1_000_000) buffer = ""
      }
    } finally {
      reader.releaseLock()
    }
  }

  /** Consumes one decoded public event. Public for protocol-level regression tests. */
  observeEvent(value: unknown) {
    const eventDirectory = openCodeEventDirectory(value)
    if (eventDirectory && eventDirectory !== this.directory) return
    const event = unwrapOpenCodeEvent(value)
    const removed = openCodeEventDeletedSessionId(value)
    if (removed) {
      this.remove(removed)
      return
    }
    const matched = this.matchEventSession(value, event?.type)
    if (!matched) return
    const { sessionId, observed } = matched
    const title = openCodeEventTitle(value)
    if (title) observed.session = { ...observed.session, title }
    applyOpenCodeLiveEvent(observed, value, event?.type)
    this.publish(observed)
    if (eventNeedsHydration(event?.type)) this.scheduleHydration(sessionId)
  }

  private matchEventSession(value: unknown, type: unknown) {
    const candidate = openCodeEventSession(value)
    const isChild = Boolean(openCodeEventSessionParentId(value))
    if (candidate && !isChild) {
      this.baseline.set(candidate.id, candidate)
      if (type === "session.created") this.track(candidate, true)
      else if (this.sessions.has(candidate.id)) this.track(candidate, false)
    }
    const sessionId = openCodeEventSessionId(value) ?? candidate?.id ?? null
    if (!sessionId) return null
    if (!this.sessions.has(sessionId)) {
      const known = this.baseline.get(sessionId)
      if (!known || isChild) return null
      this.track(known, false)
    }
    const observed = this.sessions.get(sessionId)
    return observed ? { sessionId, observed } : null
  }

  private track(session: OpenCodeHydration["session"], activate: boolean) {
    if (session.directory && session.directory !== this.directory) return
    let observed = this.sessions.get(session.id)
    if (!observed) {
      if (this.sessions.size >= this.maximumSessions) return
      observed = {
        session,
        state: "idle",
        activity: null,
        messages: [],
        waitingOnApproval: false,
        diffs: new Map(),
        toolActivities: new Map(),
        settled: false,
      }
      this.sessions.set(session.id, observed)
    } else observed.session = session
    if (activate || !this.activeSessionId) this.setActiveSession(session.id)
    this.publish(observed)
    this.scheduleHydration(session.id, 0)
  }

  private remove(sessionId: string) {
    const timer = this.hydrationTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.hydrationTimers.delete(sessionId)
    this.pendingHydrations.delete(sessionId)
    if (!this.sessions.delete(sessionId)) return
    if (this.protocol === "v2") this.events.onSessionRemoved?.(sessionId)
    if (this.activeSessionId !== sessionId) return
    const replacement = [...this.sessions.values()].sort(
      (left, right) => right.session.updatedAt - left.session.updatedAt,
    )[0]
    this.activeSessionId = null
    if (replacement) this.setActiveSession(replacement.session.id)
  }

  private publish(observed: ObservedOpenCodeSession, hydrated = false, publishHistory = hydrated) {
    const snapshot: OpenCodeHydration = {
      session: observed.session,
      state: observed.state,
      activity: observed.activity,
      messages: observed.messages,
      waitingOnApproval: observed.waitingOnApproval,
    }
    if (this.protocol === "v2") this.events.onSessionUpdated?.(snapshot)
    if (observed.session.id === this.activeSessionId) {
      this.events.onTitle(observed.session.title)
      this.events.onState(observed.state)
      if (observed.state === "working" && observed.activity)
        this.events.onActivity(observed.activity)
      if (publishHistory) this.events.onUserMessageHistory(observed.messages, true)
    }
    if (hydrated) this.events.onHydrated?.(snapshot)
  }

  setActiveSession(sessionId: string) {
    const known = this.sessions.get(sessionId) ?? this.baseline.get(sessionId)
    if (!known) return false
    if (!("messages" in known)) this.track(known, false)
    const observed = this.sessions.get(sessionId)
    if (!observed) return false
    this.activeSessionId = sessionId
    if (this.protocol === "v2") this.events.onActiveSessionChanged?.(sessionId)
    this.publish(observed, false, true)
    return true
  }

  observeTerminalTitle(title: string) {
    const taskTitle = agentTaskTitle(
      { key: "opencode-title", label: "OpenCode", profile: "opencode" },
      title,
    )
    const normalized = (taskTitle ?? title).trim().toLocaleLowerCase()
    if (!normalized) return
    const matches = [...this.baseline.values()].filter((session) => {
      const sessionTitle = session.title.trim()
      const visibleTitle = sessionTitle.length > 40 ? `${sessionTitle.slice(0, 37)}…` : sessionTitle
      return visibleTitle.toLocaleLowerCase() === normalized
    })
    const match = matches[0]
    if (matches.length === 1 && match) this.setActiveSession(match.id)
  }

  private scheduleHydration(sessionId: string, delay = 40) {
    const current = this.hydrationTimers.get(sessionId)
    if (current) clearTimeout(current)
    this.hydrationTimers.set(
      sessionId,
      setTimeout(() => {
        this.hydrationTimers.delete(sessionId)
        this.pendingHydrations.add(sessionId)
        this.pumpHydrations()
      }, delay),
    )
  }

  private pumpHydrations() {
    if (this.controller.signal.aborted) return
    while (this.hydrating.size < this.maximumHydrations) {
      const sessionId = [...this.pendingHydrations].find((id) => !this.hydrating.has(id))
      if (!sessionId) break
      this.pendingHydrations.delete(sessionId)
      this.hydrating.add(sessionId)
      void this.hydrate(sessionId).finally(() => {
        this.hydrating.delete(sessionId)
        this.pumpHydrations()
      })
    }
  }

  private async hydrate(sessionId: string) {
    const observed = this.sessions.get(sessionId)
    if (!observed || this.controller.signal.aborted) return
    try {
      const [sessionValue, statusValue, messages] = await Promise.all([
        fetchOpenCodeJson(
          this.baseUrl,
          `${this.protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(sessionId)}`,
          this.protocol === "v2" ? undefined : this.directory,
          this.controller.signal,
          {},
          this.authorization,
        ).catch(() => null),
        fetchOpenCodeJson(
          this.baseUrl,
          this.protocol === "v2" ? "/api/session/active" : "/session/status",
          this.protocol === "v2" ? undefined : this.directory,
          this.controller.signal,
          {},
          this.authorization,
        ).catch(() => null),
        openCodeSessionMessages(
          this.baseUrl,
          this.directory,
          sessionId,
          this.controller.signal,
          this.protocol,
          this.authorization,
        ).catch(() => null),
      ])
      const session = parseOpenCodeSession(sessionValue) ?? observed.session
      if (!this.sessions.has(sessionId)) return
      const observedState = openCodeStatusState(statusValue, sessionId)
      observed.session = session
      if (messages) {
        const diffs = await openCodeMessageDiffs(
          this.baseUrl,
          this.directory,
          sessionId,
          messages,
          this.controller.signal,
          this.protocol,
          observed.diffs,
          this.authorization,
        )
        observed.diffs.clear()
        for (const [messageId, changes] of diffs) observed.diffs.set(messageId, changes)
        observed.messages = openCodeMessageHistory(messages, observed.state, diffs)
      }
      if (observedState && !(observed.settled && observedState === "working"))
        observed.state = hydratedOpenCodeState(
          observed.state,
          observedState,
          observed.waitingOnApproval,
          observed.messages.at(-1)?.status,
        )
      if (observed.state !== "working") observed.activity = null
      this.publish(observed, true)
    } catch (error) {
      this.reportError(error)
    }
  }

  private reportError(error: unknown) {
    if (this.controller.signal.aborted) return
    this.events.onError(error instanceof Error ? error.message : String(error))
  }

  stop() {
    for (const timer of this.hydrationTimers.values()) clearTimeout(timer)
    this.hydrationTimers.clear()
    this.pendingHydrations.clear()
    this.controller.abort()
  }
}
