import {
  publishCodexResumeThreads,
  updateCodexResumeThreadResponse,
} from "../model/codex-resume-threads"
import type { CodexHydratedThread } from "../model/remote-codex"
import {
  type CodexActivity,
  CodexActivityObserver,
  type CodexState,
} from "./codex-activity-observer"
import { CodexAuxiliaryThreads } from "./codex-auxiliary-threads"
import type { CodexObservedUserMessage } from "./codex-message-history"
import { CodexMessageHistoryObserver } from "./codex-message-history-observer"
import { codexResumeThreads, resumeListFrame } from "./codex-resume"
import { CodexTaskTitleObserver } from "./codex-task-title-observer"

type RecordValue = Record<string, unknown>

export type { CodexHydratedThread } from "../model/remote-codex"
export { codexAppServerActivity, codexAppServerState } from "./codex-activity-observer"

export type CodexAppServerEvents = {
  onTaskFailed?: () => void
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
  title: CodexTaskTitleObserver
  activity: CodexActivityObserver
  auxiliary: CodexAuxiliaryThreads
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
  const title = new CodexTaskTitleObserver()
  return {
    upstream: null,
    sendUpstream: null,
    pending: [],
    history: new CodexMessageHistoryObserver(title),
    title,
    activity: new CodexActivityObserver(),
    auxiliary: new CodexAuxiliaryThreads(),
    resumeRequestIds: new Set(),
    resumeRequestSequence: 0,
    closing: false,
    ...(remote ? { remoteProfileId: remote.id, remoteProfileName: remote.name } : {}),
  }
}

function requestResumeThreads(relay: CodexRelay, relayId: number) {
  if (!relay.sendUpstream) return
  relay.resumeRequestSequence += 1
  const id = `tuiminal-resume-list:${relayId}:${relay.resumeRequestSequence}`
  relay.resumeRequestIds.add(id)
  const frame = resumeListFrame(id)
  relay.title.observeClient(JSON.parse(frame))
  relay.sendUpstream(frame)
}

function refreshThreadName(relay: CodexRelay) {
  if (!relay.closing && relay.sendUpstream) relay.title.refresh(relay.sendUpstream)
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
    if (relay.auxiliary.observeServer(message)) return false
    const titleResponse = relay.title.observeServer(message, events)
    const resumeResponse =
      typeof message.id === "string" && relay.resumeRequestIds.delete(message.id)
    if (resumeResponse) {
      publishCodexResumeThreads(
        codexResumeThreads(message, relay.remoteProfileId, relay.remoteProfileName),
        relay.remoteProfileId,
      )
    }
    if (message.method === "item/completed") {
      const params = object(message.params)
      const item = object(params?.item)
      if (
        typeof params?.threadId === "string" &&
        item?.type === "agentMessage" &&
        typeof item.text === "string"
      )
        updateCodexResumeThreadResponse(params.threadId, item.text, relay.remoteProfileId)
    }
    relay.activity.observeServer(message, events)
    const historyResponse =
      !resumeResponse &&
      !titleResponse &&
      relay.history.observeServer(
        message,
        {
          ...events,
          onHydrated(thread) {
            relay.activity.hydrate(thread)
            events.onHydrated?.(thread)
          },
        },
        (frame) => relay.sendUpstream?.(frame),
      )
    if (message.method === "turn/completed") refreshThreadName(relay)
    if (message.method === "turn/completed" || message.method === "thread/name/updated")
      requestResumeThreads(relay, relayId)
    return titleResponse || resumeResponse || historyResponse
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
    if (relay.auxiliary.observeClient(request)) return
    relay.title.observeClient(request)
    relay.activity.observeClient(request, events)
    relay.history.observeClient(request, events)
    if (["turn/start", "turn/steer", "thread/queue/add"].includes(String(request.method)))
      queueMicrotask(() => refreshThreadName(relay))
    if (request.method === "initialized") queueMicrotask(() => requestResumeThreads(relay, relayId))
  } catch {
    // Preserve the original frame even if it cannot be inspected.
  }
}
