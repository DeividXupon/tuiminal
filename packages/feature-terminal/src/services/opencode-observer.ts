import type {
  AgentMessageFileChange,
  AgentMessageHistoryEntry,
} from "../model/agent-message-history"
import {
  type OpenCodeHydration,
  type OpenCodeObserverEvents,
  openCodeEventActivity,
  openCodeEventSession,
  openCodeEventSessionId,
  openCodeEventState,
  openCodeEventTitle,
  openCodeMessageHistory,
  parseOpenCodeFileDiffs,
  parseOpenCodeSession,
  parseOpenCodeSessions,
  unwrapOpenCodeEvent,
} from "./opencode-api"
import { readOpenCodeJsonResponse, type OpenCodeServerProtocol } from "./opencode-protocol"

type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function apiUrl(baseUrl: string, pathname: string, directory: string | undefined, query = {}) {
  const url = new URL(pathname, baseUrl)
  if (directory) url.searchParams.set("directory", directory)
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  return url
}

export async function fetchOpenCodeJson(
  baseUrl: string,
  pathname: string,
  directory: string | undefined,
  signal: AbortSignal,
  query: Record<string, string | number | undefined> = {},
) {
  const timeout = AbortSignal.timeout(15_000)
  const boundedSignal = AbortSignal.any([signal, timeout])
  try {
    const response = await fetch(apiUrl(baseUrl, pathname, directory, query), {
      signal: boundedSignal,
    })
    return await readOpenCodeJsonResponse(response)
  } catch (error) {
    if (!signal.aborted && timeout.aborted)
      throw new Error("A consulta à API do OpenCode excedeu o tempo limite.")
    throw error
  }
}

export async function listOpenCodeSessions(
  baseUrl: string,
  directory: string,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol = "v1",
) {
  const pathname = protocol === "v2" ? "/api/session" : "/session"
  return parseOpenCodeSessions(
    await fetchOpenCodeJson(baseUrl, pathname, directory, signal, {
      roots: "true",
      limit: 100,
      ...(protocol === "v2" ? { order: "desc" } : {}),
    }),
  )
}

async function sessionMessages(
  baseUrl: string,
  directory: string,
  sessionId: string,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
) {
  const messages: unknown[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const response = await fetch(
      apiUrl(
        baseUrl,
        `${protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(sessionId)}/message`,
        protocol === "v2" ? undefined : directory,
        {
          ...(cursor ? { cursor } : {}),
          ...(protocol === "v2" ? { order: "asc" } : {}),
        },
      ),
      { signal },
    )
    const value = await readOpenCodeJsonResponse(response)
    const record = object(value)
    const data = Array.isArray(record?.data) ? record.data : Array.isArray(value) ? value : []
    messages.push(...data)
    const next = response.headers.get("x-next-cursor") ?? object(record?.cursor)?.next
    if (typeof next !== "string" || !next) break
    cursor = next
  }
  return messages
}

async function messageDiffs(
  baseUrl: string,
  directory: string,
  sessionId: string,
  messages: readonly unknown[],
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
  previous: ReadonlyMap<string, readonly AgentMessageFileChange[]> = new Map(),
) {
  const users = messages.flatMap((value): string[] => {
    const record = object(value)
    const info = object(record?.info) ?? record
    return info?.role === "user" && typeof info.id === "string" ? [info.id] : []
  })
  const diffs = new Map(previous)
  if (protocol === "v2") {
    for (const value of messages) {
      const record = object(value)
      const info = object(record?.info) ?? record
      if (info?.role !== "user" || typeof info.id !== "string") continue
      const summary = object(info.summary)
      if (!Array.isArray(summary?.diffs)) continue
      diffs.set(info.id, parseOpenCodeFileDiffs(summary.diffs, info.id))
    }
    return diffs
  }
  const pending = users.filter((messageId) => !diffs.has(messageId))
  for (let offset = 0; offset < pending.length; offset += 8) {
    await Promise.all(
      pending.slice(offset, offset + 8).map(async (messageId) => {
        signal.throwIfAborted()
        try {
          const value = await fetchOpenCodeJson(
            baseUrl,
            `/session/${encodeURIComponent(sessionId)}/diff`,
            directory,
            signal,
            { messageID: messageId },
          )
          diffs.set(messageId, parseOpenCodeFileDiffs(value, messageId))
        } catch {
          // Diff support varies by OpenCode version; transcript hydration remains useful.
        }
      }),
    )
  }
  return diffs
}

function statusState(value: unknown, sessionId: string) {
  const response = object(value)
  const statuses = object(response?.data) ?? response
  const status = object(statuses?.[sessionId])
  if (status?.type === "busy" || status?.type === "retry" || status?.type === "running")
    return "working" as const
  return "idle" as const
}

function eventNeedsHydration(type: unknown) {
  return (
    typeof type === "string" &&
    (type.startsWith("message.") ||
      type.startsWith("session.") ||
      type.startsWith("permission.") ||
      type.startsWith("question."))
  )
}

function hydratedState(
  current: OpenCodeHydration["state"],
  observed: "working" | "idle",
  waitingOnApproval: boolean,
  latestStatus: AgentMessageHistoryEntry["status"] | undefined,
) {
  if (waitingOnApproval) return "blocked" as const
  if (observed === "working") return current
  if (latestStatus === "completed") return "done" as const
  if (latestStatus === "failed" || latestStatus === "interrupted") return "unknown" as const
  return "idle" as const
}

export class OpenCodeObserver {
  private readonly controller = new AbortController()
  private readonly baseline = new Set<string>()
  private sessionId: string | null
  private state: OpenCodeHydration["state"] = "idle"
  private waitingOnApproval = false
  private hydrationTimer: ReturnType<typeof setTimeout> | null = null
  private hydration: Promise<void> | null = null
  private hydrationRequested = false
  private readonly diffs = new Map<string, readonly AgentMessageFileChange[]>()

  constructor(
    private readonly baseUrl: string,
    private readonly directory: string,
    resumeSessionId: string | undefined,
    private readonly events: OpenCodeObserverEvents,
    private readonly protocol: OpenCodeServerProtocol = "v1",
  ) {
    this.sessionId = resumeSessionId ?? null
  }

  async start(signal: AbortSignal) {
    signal.addEventListener("abort", () => this.stop(), { once: true })
    const sessions = await listOpenCodeSessions(
      this.baseUrl,
      this.directory,
      this.controller.signal,
      this.protocol,
    )
    for (const session of sessions) this.baseline.add(session.id)
    if (this.sessionId) this.scheduleHydration(0)
    const response = await fetch(
      apiUrl(this.baseUrl, this.protocol === "v2" ? "/api/event" : "/event", this.directory),
      {
        headers: { accept: "text/event-stream" },
        signal: this.controller.signal,
      },
    )
    if (!response.ok || !response.body)
      throw new Error("Não foi possível observar os eventos públicos do OpenCode.")
    void this.consume(response.body).catch((error: unknown) => {
      if (!this.controller.signal.aborted)
        this.events.onError(error instanceof Error ? error.message : String(error))
    })
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
              this.observe(JSON.parse(data))
            } catch {
              // Ignore malformed or forward-incompatible events.
            }
          }
          boundary = buffer.indexOf("\n\n")
        }
        if (buffer.length > 1_000_000) buffer = ""
      }
    } finally {
      reader.releaseLock()
    }
  }

  private observe(value: unknown) {
    const event = unwrapOpenCodeEvent(value)
    const candidate = openCodeEventSession(value)
    if (
      !this.sessionId &&
      candidate &&
      candidate.directory === this.directory &&
      (!this.baseline.has(candidate.id) || event?.type === "session.created")
    )
      this.sessionId = candidate.id
    const eventSessionId = openCodeEventSessionId(value)
    if (!this.sessionId || (eventSessionId && eventSessionId !== this.sessionId)) return
    const title = openCodeEventTitle(value)
    if (title) this.events.onTitle(title)
    const state = openCodeEventState(value)
    if (state) {
      this.state = state
      this.waitingOnApproval = state === "blocked"
      this.events.onState(state)
    }
    if (
      event?.type === "permission.replied" ||
      event?.type === "permission.updated" ||
      event?.type === "question.replied"
    )
      this.waitingOnApproval = false
    const activity = openCodeEventActivity(value)
    if (activity) this.events.onActivity(activity)
    if (eventNeedsHydration(event?.type)) this.scheduleHydration()
  }

  private scheduleHydration(delay = 40) {
    this.hydrationRequested = true
    if (this.hydrationTimer) clearTimeout(this.hydrationTimer)
    this.hydrationTimer = setTimeout(() => {
      this.hydrationTimer = null
      void this.hydrate()
    }, delay)
  }

  private async hydrate() {
    if (!this.sessionId || this.controller.signal.aborted) return
    if (this.hydration) return this.hydration
    this.hydrationRequested = false
    this.hydration = (async () => {
      const sessionId = this.sessionId!
      const [sessionValue, statusValue, messages] = await Promise.all([
        fetchOpenCodeJson(
          this.baseUrl,
          `${this.protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(sessionId)}`,
          this.protocol === "v2" ? undefined : this.directory,
          this.controller.signal,
        ),
        fetchOpenCodeJson(
          this.baseUrl,
          this.protocol === "v2" ? "/api/session/active" : "/session/status",
          this.protocol === "v2" ? undefined : this.directory,
          this.controller.signal,
        ).catch(() => null),
        sessionMessages(
          this.baseUrl,
          this.directory,
          sessionId,
          this.controller.signal,
          this.protocol,
        ),
      ])
      const session = parseOpenCodeSession(sessionValue)
      if (!session) return
      const observedState = statusState(statusValue, sessionId)
      if (!this.waitingOnApproval && this.state !== "unknown" && this.state !== "done")
        this.state = observedState
      const diffs = await messageDiffs(
        this.baseUrl,
        this.directory,
        sessionId,
        messages,
        this.controller.signal,
        this.protocol,
        this.diffs,
      )
      this.diffs.clear()
      for (const [messageId, changes] of diffs) this.diffs.set(messageId, changes)
      const history = openCodeMessageHistory(messages, this.state, diffs)
      const latest = history.at(-1)
      this.state = hydratedState(this.state, observedState, this.waitingOnApproval, latest?.status)
      this.events.onTitle(session.title)
      this.events.onState(this.state)
      this.events.onUserMessageHistory(history, true)
      this.events.onHydrated?.({
        session,
        state: this.state,
        messages: history,
        waitingOnApproval: this.waitingOnApproval,
      })
    })()
      .catch((error: unknown) => {
        if (!this.controller.signal.aborted)
          this.events.onError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        this.hydration = null
        if (this.hydrationRequested && !this.controller.signal.aborted) this.scheduleHydration(0)
      })
    return this.hydration
  }

  stop() {
    if (this.hydrationTimer) clearTimeout(this.hydrationTimer)
    this.hydrationTimer = null
    this.controller.abort()
  }
}
