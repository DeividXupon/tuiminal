import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePage,
  compareAgentResumeThreads,
} from "../model/agent-resume-thread"
import {
  type ClaudeResumeThread,
  claudeResumeThreadsSnapshot,
  mergeClaudeResumeThreads,
} from "../model/claude-resume-threads"
import { runBoundedCommand } from "./bounded-command"
import { claudeBackgroundResumeThread } from "./claude-background"
import { parseClaudeBackgroundSessions } from "./claude-background-session"
import { resolveClaudeExecutable } from "./claude-executable"
import { loadClaudeResumeThreads } from "./claude-resume-store"

/** Queries the official local roster, retaining foreground sessions known to Tuiminal. */
export async function loadLocalClaudeResumeThreadsPage(
  signal: AbortSignal,
  limit = AGENT_RESUME_PAGE_SIZE,
): Promise<AgentResumePage<ClaudeResumeThread>> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
  const result = await runBoundedCommand(
    [resolveClaudeExecutable(), "agents", "--json", "--all"],
    deadline,
  )
  deadline.throwIfAborted()
  if (result.exitCode !== 0 || !Array.isArray(JSON.parse(result.stdout)))
    throw new Error("Não foi possível consultar as sessões do Claude Code.")
  const sessions = parseClaudeBackgroundSessions(result.stdout).map((session) =>
    claudeBackgroundResumeThread(session),
  )
  const known = new Map(
    [...loadClaudeResumeThreads(), ...claudeResumeThreadsSnapshot(), ...sessions]
      .filter((thread) => !thread.remoteProfileId)
      .map((thread) => [thread.id, thread]),
  )
  const threads = [...known.values()]
    .sort(compareAgentResumeThreads)
    .slice(0, AGENT_RESUME_SOURCE_LIMIT)
  mergeClaudeResumeThreads(threads)
  const maximum = Math.max(0, Math.min(AGENT_RESUME_SOURCE_LIMIT, limit))
  return { threads: threads.slice(0, maximum), nextCursor: null, hasMore: threads.length > maximum }
}
