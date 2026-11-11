import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePage,
} from "../model/agent-resume-thread"
import { type CodexResumeThread, codexResumeThreadsSnapshot } from "../model/codex-resume-threads"
import { codexResumeNextCursor, codexResumeThreads } from "./codex-resume-protocol"

export type CodexResumePageOptions = {
  cursor?: string | null
  append?: boolean
  limit?: number
  /** Fill the bounded search roster over one connection if the server uses smaller pages. */
  collect?: boolean
}

export const AGENT_RESUME_DETAIL_TIMEOUT_MS = 1_500

export async function readCodexResumePage(
  options: CodexResumePageOptions,
  read: (cursor: string | null, limit: number, index: number) => Promise<unknown>,
  remote?: { id: string; name: string },
): Promise<AgentResumePage<CodexResumeThread>> {
  const maximum = Math.max(
    1,
    Math.min(AGENT_RESUME_SOURCE_LIMIT, Math.floor(options.limit ?? AGENT_RESUME_PAGE_SIZE)),
  )
  const threads = new Map<string, CodexResumeThread>()
  const cursors = new Set<string>()
  let cursor = options.cursor ?? null
  for (let index = 0; index < maximum; index++) {
    const response = await read(cursor, maximum - threads.size, index)
    const page = codexResumeThreads(response, remote?.id, remote?.name)
    for (const thread of page) {
      if (threads.size >= maximum) break
      threads.set(thread.id, thread)
    }
    cursor = codexResumeNextCursor(response)
    if (
      !options.collect ||
      !cursor ||
      !page.length ||
      threads.size >= maximum ||
      cursors.has(cursor)
    )
      break
    cursors.add(cursor)
  }
  const previous = new Map(
    codexResumeThreadsSnapshot()
      .filter((thread) => thread.remoteProfileId === remote?.id)
      .map((thread) => [thread.id, thread]),
  )
  return {
    threads: [...threads.values()].map((thread) => {
      const cached = previous.get(thread.id)
      return cached?.updatedAt === thread.updatedAt && thread.updatedAt > 0
        ? { ...thread, lastResponse: cached.lastResponse }
        : thread
    }),
    nextCursor: cursor,
    hasMore: cursor !== null,
  }
}
