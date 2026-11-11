import type { AgentState } from "./agent-state"

export type AgentSoundEvent = "question" | "completed" | "error"

/** Completion requires a work cycle; hydration and unknown/idle are not success. */
export class AgentSoundTransition {
  private initialized = false
  private state: AgentState = "idle"
  private worked = false
  private failed = false

  reset(state: AgentState) {
    this.initialized = true
    this.state = state
    this.worked = state === "working" || state === "blocked"
    this.failed = false
  }

  observe(state: AgentState, screen = false): AgentSoundEvent | null {
    if (!this.initialized) {
      this.reset(state)
      return null
    }
    const previous = this.state
    this.state = state
    if (state === "working") {
      this.worked = true
      this.failed = false
    }
    if (state === previous) return null
    if (state === "blocked") return "question"
    if (state === "done" || (screen && state === "idle")) {
      const completed = this.worked && !this.failed
      this.worked = false
      return completed ? "completed" : null
    }
    return null
  }

  error(): AgentSoundEvent | null {
    if (this.failed) return null
    this.failed = true
    this.worked = false
    return "error"
  }
}
