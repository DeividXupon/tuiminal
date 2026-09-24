import { randomUUID } from "node:crypto"
import { EMPTY_AGENT_MESSAGE_TURN_DETAIL } from "../model/agent-message-history"
import {
  type CodexObservedUserMessage,
  detailFromItems,
  detailsFromItemEntries,
  historyFromItemEntries,
  historyFromTurns,
  messagesFromTurnStart,
  object,
  type RecordValue,
  requestKey,
  turnMetadata,
  turnNotificationUpdate,
  uniqueMessages,
  userInputDetails,
} from "./codex-message-history"
import { CodexMessagePublisher } from "./codex-message-publisher"

export type CodexMessageHistoryEvents = {
  onUserMessage: (message: CodexObservedUserMessage) => void
  onUserMessageHistory: (messages: readonly CodexObservedUserMessage[], replace: boolean) => void
}

type ObservedRequest = {
  method: string
  threadId: string | null
  userMessage: CodexObservedUserMessage | null
}
type HistoryPageRequest = { threadId: string; generation: number }

const HISTORY_RESPONSE_METHODS = new Set([
  "thread/start",
  "thread/resume",
  "thread/fork",
  "thread/read",
  "thread/turns/list",
  "thread/items/list",
  "turn/start",
])

export class CodexMessageHistoryObserver {
  private readonly requests = new Map<string, ObservedRequest>()
  private readonly historyPages = new Map<string, HistoryPageRequest>()
  private readonly historyCursors = new Set<string>()
  private readonly turnTimes = new Map<string, number>()
  private readonly publisher = new CodexMessagePublisher()
  private readonly observerId = randomUUID()
  private currentThreadId: string | null = null
  private currentModel: string | null = null
  private currentEffort: string | null = null
  private currentServiceTier: string | null = null
  private historyGeneration = 0
  private messageSequence = 0
  private historyRequestSequence = 0

  private withCurrentConfiguration(message: CodexObservedUserMessage) {
    return {
      ...message,
      model: message.model ?? this.currentModel,
      effort: message.effort ?? this.currentEffort,
      serviceTier: message.serviceTier ?? this.currentServiceTier,
    }
  }

  private publish(
    messages: readonly CodexObservedUserMessage[],
    replace: boolean,
    events: CodexMessageHistoryEvents,
  ) {
    this.publisher.publish(
      messages,
      replace,
      (message) => this.withCurrentConfiguration(message),
      events,
    )
  }

  private updateTurnDetail(
    turnId: string,
    detail: ReturnType<typeof detailFromItems>,
    events: CodexMessageHistoryEvents,
  ) {
    this.publisher.updateTurn(
      turnId,
      detail,
      (message) => this.withCurrentConfiguration(message),
      events,
    )
  }

  private updateTurnMessage(
    turnId: string,
    update: Parameters<CodexMessagePublisher["updateTurnMessage"]>[1],
    events: CodexMessageHistoryEvents,
  ) {
    this.publisher.updateTurnMessage(
      turnId,
      update,
      (message) => this.withCurrentConfiguration(message),
      events,
    )
  }

  private requestHistoryPage(
    threadId: string,
    cursor: string | null,
    generation: number,
    send: (frame: string) => void,
  ) {
    const cursorKey = cursor ?? "<first>"
    if (this.historyCursors.has(cursorKey)) return
    this.historyCursors.add(cursorKey)
    this.historyRequestSequence += 1
    const id = `tuiminal-history:${this.observerId}:${this.historyRequestSequence}`
    const key = requestKey(id)
    if (!key) return
    this.historyPages.set(key, { threadId, generation })
    send(
      JSON.stringify({
        id,
        method: "thread/turns/list",
        params: {
          threadId,
          cursor,
          limit: 100,
          sortDirection: "desc",
          itemsView: "full",
        },
      }),
    )
  }

  private observeHistoryPage(
    key: string,
    message: RecordValue,
    events: CodexMessageHistoryEvents,
    send: (frame: string) => void,
  ) {
    const historyPage = this.historyPages.get(key)
    if (!historyPage) return false
    this.historyPages.delete(key)
    const result = object(message.result)
    if (
      !result ||
      historyPage.threadId !== this.currentThreadId ||
      historyPage.generation !== this.historyGeneration
    )
      return true
    this.publish(historyFromTurns(result.data, this.turnTimes), false, events)
    if (typeof result.nextCursor === "string" && result.nextCursor)
      this.requestHistoryPage(historyPage.threadId, result.nextCursor, historyPage.generation, send)
    return true
  }

  private observeThreadSelection(
    request: ObservedRequest,
    result: RecordValue,
    events: CodexMessageHistoryEvents,
    send: (frame: string) => void,
  ) {
    if (!["thread/start", "thread/resume", "thread/fork"].includes(request.method)) return false
    const thread = object(result.thread)
    if (typeof thread?.id !== "string") return true
    this.currentThreadId = thread.id
    this.currentModel =
      typeof result.model === "string"
        ? result.model
        : typeof thread.model === "string"
          ? thread.model
          : null
    this.currentEffort =
      typeof result.reasoningEffort === "string"
        ? result.reasoningEffort
        : typeof thread.reasoningEffort === "string"
          ? thread.reasoningEffort
          : null
    this.currentServiceTier = typeof result.serviceTier === "string" ? result.serviceTier : null
    this.turnTimes.clear()
    this.historyCursors.clear()
    this.historyGeneration += 1
    const initialPage = object(result.initialTurnsPage)
    this.publish(
      uniqueMessages([
        ...historyFromTurns(thread.turns, this.turnTimes),
        ...historyFromTurns(initialPage?.data, this.turnTimes),
      ]),
      true,
      events,
    )
    if (request.method !== "thread/start")
      this.requestHistoryPage(thread.id, null, this.historyGeneration, send)
    return true
  }

  private createUserMessage(
    method: string,
    params: RecordValue | null,
    key: string | null,
  ): CodexObservedUserMessage | null {
    const input = userInputDetails(params?.input)
    if (!input) return null
    this.messageSequence += 1
    const clientId =
      typeof params?.clientUserMessageId === "string" ? params.clientUserMessageId : null
    return {
      id: clientId
        ? `client:${clientId}`
        : `request:${key ?? `${Date.now()}:${this.messageSequence}`}`,
      turnId: null,
      ...input,
      sentAt: Date.now(),
      durationMs: null,
      status: method === "thread/queue/add" ? "queued" : "inProgress",
      model: typeof params?.model === "string" ? params.model : this.currentModel,
      effort: typeof params?.effort === "string" ? params.effort : this.currentEffort,
      serviceTier:
        typeof params?.serviceTierForTurn === "string"
          ? params.serviceTierForTurn
          : typeof params?.serviceTier === "string"
            ? params.serviceTier
            : this.currentServiceTier,
      ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
    }
  }

  private rememberTurnConfiguration(
    method: string,
    params: RecordValue | null,
    message: CodexObservedUserMessage,
  ) {
    if (method !== "turn/start") return
    if (message.model) this.currentModel = message.model
    if (message.effort) this.currentEffort = message.effort
    if (typeof params?.serviceTier === "string") this.currentServiceTier = params.serviceTier
  }

  private observeTurnNotification(message: RecordValue, events: CodexMessageHistoryEvents) {
    if (message.method !== "turn/started" && message.method !== "turn/completed") return false
    const params = object(message.params)
    if (this.currentThreadId && params?.threadId !== this.currentThreadId) return true
    const turn = object(params?.turn)
    const metadata = turnMetadata(turn)
    const rememberedStart = metadata?.turnId ? (this.turnTimes.get(metadata.turnId) ?? 0) : 0
    this.publish(historyFromTurns([turn], this.turnTimes), false, events)
    if (metadata?.turnId) {
      const update = turnNotificationUpdate(message.method, metadata, rememberedStart)
      if (update.sentAt) this.turnTimes.set(metadata.turnId, update.sentAt)
      this.updateTurnMessage(metadata.turnId, update, events)
    }
    return true
  }

  private observeTurnStartResponse(
    request: ObservedRequest,
    result: RecordValue,
    events: CodexMessageHistoryEvents,
  ) {
    if (request.method !== "turn/start") return
    this.publish(
      messagesFromTurnStart(request.userMessage, result.turn, this.turnTimes),
      false,
      events,
    )
  }

  private observePublicDetailNotification(message: RecordValue, events: CodexMessageHistoryEvents) {
    const params = object(message.params)
    if (typeof params?.turnId !== "string") return
    if (message.method === "item/started" || message.method === "item/completed") {
      const at =
        typeof params.completedAtMs === "number"
          ? params.completedAtMs
          : typeof params.startedAtMs === "number"
            ? params.startedAtMs
            : Date.now()
      this.updateTurnDetail(params.turnId, detailFromItems([params.item], at), events)
      return
    }
    if (message.method === "item/fileChange/patchUpdated") {
      this.updateTurnDetail(
        params.turnId,
        detailFromItems([
          { id: params.itemId, type: "fileChange", status: "inProgress", changes: params.changes },
        ]),
        events,
      )
      return
    }
    if (message.method === "turn/diff/updated" && typeof params.diff === "string") {
      this.updateTurnDetail(
        params.turnId,
        { ...EMPTY_AGENT_MESSAGE_TURN_DETAIL, turnDiff: params.diff },
        events,
      )
      return
    }
    if (message.method === "turn/plan/updated") {
      const steps = Array.isArray(params.plan)
        ? params.plan.flatMap((value) => {
            const step = object(value)
            return typeof step?.step === "string" ? [step.step] : []
          })
        : []
      const text = [typeof params.explanation === "string" ? params.explanation : "", ...steps]
        .filter(Boolean)
        .join("\n")
      if (text)
        this.updateTurnDetail(
          params.turnId,
          detailFromItems([{ id: `turn-plan:${params.turnId}`, type: "plan", text }]),
          events,
        )
    }
  }

  observeClient(message: RecordValue, events: CodexMessageHistoryEvents) {
    const method = typeof message.method === "string" ? message.method : null
    if (!method) return
    const params = object(message.params)
    const threadId = typeof params?.threadId === "string" ? params.threadId : null
    const key = requestKey(message.id)
    if (key && HISTORY_RESPONSE_METHODS.has(method))
      this.requests.set(key, { method, threadId, userMessage: null })

    const userMessage = this.createUserMessage(method, params, key)
    if (!userMessage) return
    if (threadId) this.currentThreadId = threadId
    this.rememberTurnConfiguration(method, params, userMessage)
    if (key && this.requests.has(key)) this.requests.set(key, { method, threadId, userMessage })
    events.onUserMessage(userMessage)
  }

  observeServer(
    message: RecordValue,
    events: CodexMessageHistoryEvents,
    send: (frame: string) => void,
  ) {
    this.observePublicDetailNotification(message, events)
    if (this.observeTurnNotification(message, events)) return false
    const key = requestKey(message.id)
    if (!key) return false
    if (this.observeHistoryPage(key, message, events, send)) return true
    const request = this.requests.get(key)
    if (!request) return false
    this.requests.delete(key)
    const result = object(message.result)
    if (!result) {
      if (request.userMessage && object(message.error))
        this.publish(
          [
            {
              ...request.userMessage,
              durationMs: Math.max(0, Date.now() - request.userMessage.sentAt),
              status: "failed",
            },
          ],
          false,
          events,
        )
      return false
    }

    if (this.observeThreadSelection(request, result, events, send)) return false
    if (!request.threadId || request.threadId !== this.currentThreadId) return false
    if (request.method === "thread/read") {
      const thread = object(result.thread)
      if (typeof thread?.model === "string") this.currentModel = thread.model
      if (typeof thread?.reasoningEffort === "string") this.currentEffort = thread.reasoningEffort
      this.publish(historyFromTurns(thread?.turns, this.turnTimes), false, events)
      return false
    }
    if (request.method === "thread/turns/list") {
      this.publish(historyFromTurns(result.data, this.turnTimes), false, events)
      return false
    }
    if (request.method === "thread/items/list") {
      this.publish(historyFromItemEntries(result.data, this.turnTimes), false, events)
      for (const { turnId, detail } of detailsFromItemEntries(result.data))
        this.updateTurnDetail(turnId, detail, events)
      return false
    }
    this.observeTurnStartResponse(request, result, events)
    return false
  }
}
