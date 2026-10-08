import type { AgentResumePage } from "../model/agent-resume-thread"

/** Optional response hydration must not discard a valid CLI session list. */
export async function openCodeResumePageWithFallback(
  signal: AbortSignal,
  listedPage: AgentResumePage | undefined,
  hydrate: () => Promise<AgentResumePage>,
) {
  try {
    return await hydrate()
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (listedPage) return listedPage
    throw error
  }
}
