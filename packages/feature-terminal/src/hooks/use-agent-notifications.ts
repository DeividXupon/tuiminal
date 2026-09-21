import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import { useEffect, useRef, type RefObject } from "react"
import { requestPinnedTerminalTarget } from "../model/pinned-sidebar"
import type { TerminalSession } from "../model/sessions"

type PreviousState = { key: string; state: string }

/** Only a new offscreen attention state produces a toast; metadata redraws do not. */
export function useAgentNotifications(
  sessions: readonly TerminalSession[],
  seenAgents: RefObject<ReadonlySet<string>>,
) {
  const { notify } = useNotifications()
  const previous = useRef(new Map<string, PreviousState>())

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Transition, visibility and identity checks must be evaluated together before publishing.
  useEffect(() => {
    const next = new Map<string, PreviousState>()
    for (const session of sessions) {
      const agent = session.status === "running" ? session.agent : null
      if (!agent) continue
      const current = { key: agent.key, state: agent.state }
      const last = previous.current.get(session.id)
      next.set(session.id, current)
      if (
        (agent.state !== "blocked" && agent.state !== "done") ||
        (last?.key === current.key && last.state === current.state) ||
        seenAgents.current.has(session.id)
      )
        continue
      const context = agent.taskTitle ?? session.title
      notify({
        source: "Terminal",
        kind: agent.state === "blocked" ? "warning" : "success",
        title: agent.state === "blocked" ? "Aguardando você" : "Concluído",
        message: context && context !== agent.label ? `${agent.label} · ${context}` : agent.label,
        onPress: () => requestPinnedTerminalTarget({ sessionId: session.id }),
      })
    }
    previous.current = next
  }, [notify, seenAgents, sessions])
}
