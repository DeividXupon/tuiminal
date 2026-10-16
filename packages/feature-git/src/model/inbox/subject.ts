import type { InboxNotification } from "./types"

export function inboxSubject(item: InboxNotification, host: string) {
  if (!item.subjectApiUrl || !["PullRequest", "Issue"].includes(item.subjectType)) return null
  try {
    const url = new URL(item.subjectApiUrl)
    const apiHost = host === "github.com" ? "api.github.com" : host
    if (
      url.protocol !== "https:" ||
      url.hostname !== apiHost ||
      url.port ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null
    const match = url.pathname.match(
      /^\/(?:api\/v3\/)?repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(pulls|issues)\/([1-9]\d*)$/,
    )
    if (!match) return null
    const [, owner, repository, resource, number] = match
    if (!owner || !repository || !Number.isSafeInteger(Number(number))) return null
    if (`${owner}/${repository}` !== item.repository) return null
    if (resource !== (item.subjectType === "PullRequest" ? "pulls" : "issues")) return null
    return {
      host,
      owner,
      repository,
      number: Number(number),
      kind: item.subjectType === "PullRequest" ? ("pr" as const) : ("issue" as const),
      path: `repos/${owner}/${repository}/${resource}/${number}`,
      key: `${item.subjectType}:${url.href}:${item.updatedAt}`,
    }
  } catch {
    return null
  }
}

export type InboxSubject = NonNullable<ReturnType<typeof inboxSubject>>
