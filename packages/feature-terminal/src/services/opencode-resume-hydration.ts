import { AGENT_RESUME_PAGE_SIZE } from "../model/agent-resume-thread"
import {
  mergeOpenCodeResumeThreads,
  openCodeResumeThreadsSnapshot,
} from "../model/opencode-resume-threads"
import { openCodeLastResponse, openCodeResumeThreads } from "./opencode-api"
import { fetchOpenCodeJson, listOpenCodeSessions } from "./opencode-observer"
import type { OpenCodeServerProtocol } from "./opencode-protocol"

export async function refreshOpenCodeThreadsFromServer(
  baseUrl: string,
  directory: string,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
  authorization: string | undefined,
  remote?: { id: string; name: string },
  listedSessions?: Awaited<ReturnType<typeof listOpenCodeSessions>>,
  maximum = AGENT_RESUME_PAGE_SIZE,
  hydrateIds?: ReadonlySet<string>,
) {
  const sessions =
    listedSessions ??
    (await listOpenCodeSessions(
      baseUrl,
      protocol === "v2" ? undefined : directory,
      signal,
      protocol,
      authorization,
    ))
  const threads = openCodeResumeThreads(sessions, remote, maximum)
  const previous = new Map(
    openCodeResumeThreadsSnapshot()
      .filter((thread) => thread.remoteProfileId === remote?.id)
      .map((thread) => [thread.id, thread]),
  )
  const summaries = threads.map((thread) => ({
    ...thread,
    lastResponse: previous.get(thread.id)?.lastResponse ?? thread.lastResponse,
  }))
  mergeOpenCodeResumeThreads(summaries, remote?.id)
  const hydrated = []
  const pending = hydrateIds ? summaries.filter((thread) => hydrateIds.has(thread.id)) : summaries
  const detailSignal = AbortSignal.any([signal, AbortSignal.timeout(1_500)])
  for (let offset = 0; offset < pending.length; offset += 6) {
    signal.throwIfAborted()
    if (detailSignal.aborted) break
    const batch = await Promise.all(
      pending.slice(offset, offset + 6).map(async (thread) => {
        let lastResponse = thread.lastResponse
        try {
          lastResponse = openCodeLastResponse(
            await fetchOpenCodeJson(
              baseUrl,
              `${protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(thread.id)}/message`,
              protocol === "v2" ? undefined : thread.cwd || directory,
              detailSignal,
              { limit: 20 },
              authorization,
            ),
          )
        } catch {
          // A summary remains resumable when an older server cannot hydrate messages.
        }
        return { ...thread, lastResponse }
      }),
    )
    signal.throwIfAborted()
    hydrated.push(...batch)
    mergeOpenCodeResumeThreads(batch, remote?.id)
  }
  const hydratedById = new Map(hydrated.map((thread) => [thread.id, thread]))
  return summaries.map((thread) => hydratedById.get(thread.id) ?? thread)
}
