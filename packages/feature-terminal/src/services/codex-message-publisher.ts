import {
  type AgentMessageTurnDetail,
  EMPTY_AGENT_MESSAGE_TURN_DETAIL,
  mergeAgentMessageTurnDetail,
} from "../model/agent-message-history"
import type { CodexObservedUserMessage } from "./codex-message-history"

type TurnMessageUpdate = Partial<Pick<CodexObservedUserMessage, "sentAt" | "durationMs" | "status">>

type MessageEvents = {
  onUserMessageHistory: (messages: readonly CodexObservedUserMessage[], replace: boolean) => void
}

function detailOf(message: CodexObservedUserMessage): AgentMessageTurnDetail {
  return {
    finalResponse: message.finalResponse,
    commentary: message.commentary,
    reasoningSummaries: message.reasoningSummaries,
    plans: message.plans,
    activities: message.activities,
    changes: message.changes,
    turnDiff: message.turnDiff,
  }
}

export class CodexMessagePublisher {
  private readonly messages = new Map<string, CodexObservedUserMessage>()
  private readonly messageIdsByTurn = new Map<string, Set<string>>()
  private readonly detailsByTurn = new Map<string, AgentMessageTurnDetail>()
  private readonly messageUpdatesByTurn = new Map<string, TurnMessageUpdate>()

  private mergeTurnMessageUpdate(previous: TurnMessageUpdate, incoming: TurnMessageUpdate) {
    const previousFinished =
      previous.status === "completed" ||
      previous.status === "failed" ||
      previous.status === "interrupted"
    const incomingStatus = incoming.status === "unknown" ? undefined : incoming.status
    const update: TurnMessageUpdate = {}
    const sentAt = incoming.sentAt && incoming.sentAt > 0 ? incoming.sentAt : previous.sentAt
    const durationMs = incoming.durationMs ?? previous.durationMs
    const status =
      previousFinished && incomingStatus === "inProgress"
        ? previous.status
        : (incomingStatus ?? previous.status)
    if (sentAt !== undefined) update.sentAt = sentAt
    if (durationMs !== undefined) update.durationMs = durationMs
    if (status !== undefined) update.status = status
    return update
  }

  publish(
    messages: readonly CodexObservedUserMessage[],
    replace: boolean,
    configure: (message: CodexObservedUserMessage) => CodexObservedUserMessage,
    events: MessageEvents,
  ) {
    if (replace) {
      this.messages.clear()
      this.messageIdsByTurn.clear()
      this.detailsByTurn.clear()
      this.messageUpdatesByTurn.clear()
    }
    const published = messages.map((raw) => {
      const configured = configure(raw)
      const previous = this.messages.get(configured.id)
      const turnUpdate = configured.turnId
        ? this.mergeTurnMessageUpdate(
            {
              sentAt: configured.sentAt,
              durationMs: configured.durationMs,
              status: configured.status,
            },
            this.messageUpdatesByTurn.get(configured.turnId) ?? {},
          )
        : {}
      const cached = configured.turnId
        ? (this.detailsByTurn.get(configured.turnId) ?? EMPTY_AGENT_MESSAGE_TURN_DETAIL)
        : EMPTY_AGENT_MESSAGE_TURN_DETAIL
      const detail = mergeAgentMessageTurnDetail(
        previous ? detailOf(previous) : EMPTY_AGENT_MESSAGE_TURN_DETAIL,
        mergeAgentMessageTurnDetail(detailOf(configured), cached),
      )
      const message = { ...previous, ...configured, ...turnUpdate, ...detail }
      this.messages.set(message.id, message)
      if (message.turnId) {
        this.messageUpdatesByTurn.set(
          message.turnId,
          this.mergeTurnMessageUpdate(this.messageUpdatesByTurn.get(message.turnId) ?? {}, {
            sentAt: message.sentAt,
            durationMs: message.durationMs,
            status: message.status,
          }),
        )
        const ids = this.messageIdsByTurn.get(message.turnId) ?? new Set<string>()
        ids.add(message.id)
        this.messageIdsByTurn.set(message.turnId, ids)
      }
      return message
    })
    events.onUserMessageHistory(published, replace)
  }

  updateTurnMessage(
    turnId: string,
    incoming: TurnMessageUpdate,
    configure: (message: CodexObservedUserMessage) => CodexObservedUserMessage,
    events: MessageEvents,
  ) {
    this.messageUpdatesByTurn.set(
      turnId,
      this.mergeTurnMessageUpdate(this.messageUpdatesByTurn.get(turnId) ?? {}, incoming),
    )
    const messages = [...(this.messageIdsByTurn.get(turnId) ?? [])].flatMap((id) => {
      const current = this.messages.get(id)
      return current ? [current] : []
    })
    if (messages.length) this.publish(messages, false, configure, events)
  }

  updateTurn(
    turnId: string,
    incoming: AgentMessageTurnDetail,
    configure: (message: CodexObservedUserMessage) => CodexObservedUserMessage,
    events: MessageEvents,
  ) {
    const detail = mergeAgentMessageTurnDetail(
      this.detailsByTurn.get(turnId) ?? EMPTY_AGENT_MESSAGE_TURN_DETAIL,
      incoming,
    )
    this.detailsByTurn.set(turnId, detail)
    const messages = [...(this.messageIdsByTurn.get(turnId) ?? [])].flatMap((id) => {
      const current = this.messages.get(id)
      return current
        ? [{ ...current, ...mergeAgentMessageTurnDetail(detailOf(current), detail) }]
        : []
    })
    if (messages.length) this.publish(messages, false, configure, events)
  }
}
