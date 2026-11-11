import { AgentSoundTransition, type AgentSoundEvent } from "./agent-sound-transition"
import type { TerminalSession } from "./sessions"

function failedAgent(session: TerminalSession, last: TerminalSession | undefined) {
  if (!last || last.status === session.status || !(session.agentLaunch || last.agent)) return false
  return (
    session.status === "failed" ||
    (session.status === "exited" && session.exitCode !== null && session.exitCode !== 0)
  )
}

export class AgentSessionSounds {
  private previous = new Map<string, TerminalSession>()
  private screens = new Map<string, { key: string; observer: AgentSoundTransition }>()

  private screenEvent(session: TerminalSession, last: TerminalSession | undefined) {
    const agent = session.status === "running" ? session.agent : null
    const screen = !session.agentIntegration || session.agentIntegration.transport === "screen"
    if (!agent || !screen) {
      this.screens.delete(session.id)
      return null
    }
    let entry = this.screens.get(session.id)
    if (!entry || entry.key !== agent.key || last?.startedAt !== session.startedAt) {
      entry = { key: agent.key, observer: new AgentSoundTransition() }
      entry.observer.reset(agent.state)
      this.screens.set(session.id, entry)
      return null
    }
    return entry.observer.observe(agent.state, true)
  }

  observe(sessions: readonly TerminalSession[]): AgentSoundEvent[] {
    const next = new Map(sessions.map((session) => [session.id, session]))
    const events: AgentSoundEvent[] = []
    for (const session of sessions) {
      const last = this.previous.get(session.id)
      if (failedAgent(session, last)) events.push("error")
      const event = this.screenEvent(session, last)
      if (event) events.push(event)
    }
    for (const id of this.screens.keys()) if (!next.has(id)) this.screens.delete(id)
    this.previous = next
    return events
  }
}
