import type { InboxNotification, InboxSubjectState } from "../../model/inbox/types"
import { mapWithConcurrency } from "../map-concurrently"
import { type GhTransportOptions, runGhJson } from "./transport"

type SubjectPayload = {
  state: "open" | "closed"
  draft?: boolean
  merged_at?: string | null
}

export type InboxSubjectStateCache = Map<string, { state: InboxSubjectState; expiresAt: number }>

const STATUS_CACHE_MS = 30_000
const STATUS_CACHE_LIMIT = 128

function isSubjectPayload(value: unknown): value is SubjectPayload {
  if (!value || typeof value !== "object") return false
  const subject = value as Record<string, unknown>
  return (
    (subject.state === "open" || subject.state === "closed") &&
    (subject.draft === undefined || typeof subject.draft === "boolean") &&
    (subject.merged_at === undefined ||
      subject.merged_at === null ||
      typeof subject.merged_at === "string")
  )
}

function subjectRequest(item: InboxNotification, host: string) {
  if (!item.subjectApiUrl || !["PullRequest", "Issue"].includes(item.subjectType)) return null
  try {
    const url = new URL(item.subjectApiUrl)
    const apiHost = host === "github.com" ? "api.github.com" : host
    if (url.protocol !== "https:" || url.hostname !== apiHost || url.port || url.search || url.hash)
      return null
    const match = url.pathname.match(
      /^\/(?:api\/v3\/)?repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(pulls|issues)\/([1-9]\d*)$/,
    )
    if (!match) return null
    const [, owner, repository, resource, number] = match
    if (`${owner}/${repository}` !== item.repository) return null
    if (resource !== (item.subjectType === "PullRequest" ? "pulls" : "issues")) return null
    return {
      path: `repos/${owner}/${repository}/${resource}/${number}`,
      key: `${item.subjectType}:${url.href}:${item.updatedAt}`,
    }
  } catch {
    return null
  }
}

function subjectState(item: InboxNotification, payload: SubjectPayload): InboxSubjectState | null {
  if (item.subjectType === "PullRequest") {
    if (typeof payload.draft !== "boolean" || payload.merged_at === undefined) return null
    if (payload.merged_at) return "merged"
    if (payload.state === "open" && payload.draft) return "draft"
  }
  return payload.state
}

export async function loadInboxSubjectStates(
  items: readonly InboxNotification[],
  host: string,
  options: GhTransportOptions,
  cache: InboxSubjectStateCache,
) {
  const entries = await mapWithConcurrency(items, 4, async (item) => {
    if (options.signal?.aborted) return null
    const request = subjectRequest(item, host)
    if (!request) return null
    const cached = cache.get(request.key)
    if (cached && cached.expiresAt > Date.now()) {
      cache.delete(request.key)
      cache.set(request.key, cached)
      return [item.id, cached.state] as const
    }
    try {
      const payload = await runGhJson(
        {
          args: [
            "api",
            "--hostname",
            host,
            "--method",
            "GET",
            "-H",
            "Accept: application/vnd.github+json",
            request.path,
          ],
        },
        { ...options, host, validate: isSubjectPayload },
      )
      if (options.signal?.aborted) return null
      const state = subjectState(item, payload)
      if (!state) return null
      cache.delete(request.key)
      cache.set(request.key, { state, expiresAt: Date.now() + STATUS_CACHE_MS })
      while (cache.size > STATUS_CACHE_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
      }
      return [item.id, state] as const
    } catch {
      return null
    }
  })
  return new Map(entries.filter((entry) => entry !== null))
}
