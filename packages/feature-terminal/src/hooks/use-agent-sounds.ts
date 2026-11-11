import { useEffect, useRef } from "react"
import { AgentSessionSounds } from "../model/agent-session-sounds"
import type { TerminalSession } from "../model/sessions"
import { playTerminalAgentSound } from "../services/agent-sounds"

export function useAgentSounds(sessions: readonly TerminalSession[]) {
  const observer = useRef(new AgentSessionSounds())
  useEffect(() => {
    for (const event of observer.current.observe(sessions)) playTerminalAgentSound(event)
  }, [sessions])
}
