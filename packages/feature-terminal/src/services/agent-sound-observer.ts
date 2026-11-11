import type { AgentState } from "../model/agent-state"
import { AgentSoundTransition } from "../model/agent-sound-transition"
import { playTerminalAgentSound } from "./agent-sounds"

export function createAgentSoundObserver(isCurrent: () => boolean) {
  const transition = new AgentSoundTransition()
  return {
    reset: (state: AgentState) => transition.reset(state),
    observe(state: AgentState) {
      if (!isCurrent()) return
      const event = transition.observe(state)
      if (event) playTerminalAgentSound(event)
    },
    onTaskFailed() {
      if (!isCurrent()) return
      const event = transition.error()
      if (event) playTerminalAgentSound(event)
    },
  }
}
