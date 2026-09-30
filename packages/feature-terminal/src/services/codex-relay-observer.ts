import {
  publishCodexResumeThreads,
  updateCodexResumeThreadResponse,
} from "../model/codex-resume-threads"
import type { CodexHydratedThread } from "../model/remote-codex"
import type { CodexObservedUserMessage } from "./codex-message-history"
import { CodexMessageHistoryObserver } from "./codex-message-history-observer"
import { codexResumeThreads, resumeListFrame } from "./codex-resume"

type RecordValue = Record<string, unknown>
type CodexActivity = "thinking" | "writing" | "running" | "updating" | "coding" | "tooling"
type CodexState = "working" | "blocked" | "done" | "unknown" | "idle"
export type { CodexHydratedThread } from "../model/remote-codex"

export type CodexAppServerEvents = {
  onActivity: (activity: CodexActivity) => void
  onState: (state: CodexState) => void
  onTitle: (title: string) => void
  onUserMessage: (message: CodexObservedUserMessage) => void
  onUserMessageHistory: (messages: readonly CodexObservedUserMessage[], replace: boolean) => void
  onHydrated?: (thread: CodexHydratedThread) => void
  onError: (message: string) => void
}

export type CodexRelay = {
  upstream: WebSocket | null
  sendUpstream: ((value: string) => void) | null
  pending: string[]
  history: CodexMessageHistoryObserver
  resumeRequestIds: Set<string>
  resumeRequestSequence: number
  closing: boolean
  remoteProfileId?: string
  remoteProfileName?: string
}

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

export function createCodexRelay(remote?: { id: string; name: string }): CodexRelay {
  return {
    upstream: null,
    sendUpstream: null,
    pending: [],
    history: new CodexMessageHistoryObserver(),
    resumeRequestIds: new Set(),
    resumeRequestSequence: 0,
    closing: false,
    ...(remote ? { remoteProfileId: remote.id, remoteProfileName: remote.name } : {}),
  }
}

export function codexAppServerActivity(message: unknown): CodexActivity | null {
  const event = object(message)
  const method = event?.method
  if (method === "item/agentMessage/delta") return "writing"
  if (method === "item/plan/delta" || method === "turn/plan/updated") return "updating"
  if (method === "item/fileChange/patchUpdated") return "coding"
  if (method !== "item/started") return null
  const item = object(object(event?.params)?.item)
  switch (item?.type) {
    case "reasoning":
      return "thinking"
    case "agentMessage":
      return "writing"
    case "commandExecution":
      return "running"
    case "fileChange":
      return "coding"
    case "plan":
      return "updating"
    case "mcpToolCall":
    case "dynamicToolCall":
    case "webSearch":
    case "imageView":
      return "tooling"
    default:
      return null
  }
}

export function codexAppServerState(message: unknown): CodexState | null {
  const event = object(message)
  const method = event?.method
  const params = object(event?.params)
  if (method === "turn/started") return "working"
  if (method === "turn/completed")
    return object(params?.turn)?.status === "completed" ? "done" : "unknown"
  if (method === "thread/status/changed") {
    const status = object(params?.status)
    if (status?.type === "active")
      return Array.isArray(status.activeFlags) && status.activeFlags.includes("waitingOnApproval")
        ? "blocked"
        : "working"
  }
  if (typeof method === "string" && method.endsWith("requestApproval")) return "blocked"
  return codexAppServerActivity(message) ? "working" : null
}

function publishObserverEvent(message: RecordValue, events: CodexAppServerEvents) {
  const params = object(message.params)
  if (message.method === "thread/name/updated" && typeof params?.threadName === "string")
    events.onTitle(params.threadName)
  const state = codexAppServerState(message)
  if (state) events.onState(state)
  const activity = codexAppServerActivity(message)
  if (activity) events.onActivity(activity)
}

function requestResumeThreads(relay: CodexRelay, relayId: number) {
  if (!relay.sendUpstream) return
  relay.resumeRequestSequence += 1
  const id = `tuiminal-resume-list:${relayId}:${relay.resumeRequestSequence}`
  relay.resumeRequestIds.add(id)
  relay.sendUpstream(resumeListFrame(id))
}

export function inspectUpstreamFrame(
  value: string,
  relay: CodexRelay,
  events: CodexAppServerEvents,
  relayId: number,
) {
  try {
    const message = object(JSON.parse(value))
    if (!message) return false
    const resumeResponse =
      typeof message.id === "string" && relay.resumeRequestIds.delete(message.id)
    if (resumeResponse)
      publishCodexResumeThreads(
        codexResumeThreads(message, relay.remoteProfileId, relay.remoteProfileName),
        relay.remoteProfileId,
      )
    if (message.method === "item/completed") {
      const params = object(message.params)
      const item = object(params?.item)
      if (
        typeof params?.threadId === "string" &&
        item?.type === "agentMessage" &&
        typeof item.text === "string"
      )
        updateCodexResumeThreadResponse(params.threadId, item.text)
    }
    if (typeof message.method === "string") publishObserverEvent(message, events)
    const historyResponse =
      !resumeResponse &&
      relay.history.observeServer(message, events, (frame) => relay.sendUpstream?.(frame))
    if (message.method === "turn/completed" || message.method === "thread/name/updated")
      requestResumeThreads(relay, relayId)
    return resumeResponse || historyResponse
  } catch {
    // Preserve the original frame even if it cannot be inspected.
    return false
  }
}

export function inspectClientFrame(
  value: string,
  relay: CodexRelay,
  events: CodexAppServerEvents,
  relayId: number,
) {
  try {
    const request = object(JSON.parse(value))
    if (!request) return
    relay.history.observeClient(request, events)
    if (request.method === "initialized") queueMicrotask(() => requestResumeThreads(relay, relayId))
  } catch {
    // Preserve the original frame even if it cannot be inspected.
  }
}
