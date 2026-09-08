import { notificationBrowserUrl } from "../../model/inbox/notifications"
import type { InboxNotification } from "../../model/inbox/types"
import { sanitizeGitHubText } from "../../model/pr/content"
import { type GhTransportOptions, runGhCommand, runGhJson } from "./transport"

type GitHubNotificationPayload = {
  id: string
  unread: boolean
  reason: string
  updated_at: string
  last_read_at: string | null
  subject: { title: string; url: string | null; type: string }
  repository: { full_name: string; html_url: string }
  url: string
  subscription_url: string
}

function isNotificationPayload(value: unknown): value is GitHubNotificationPayload {
  if (!value || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  const subject = item.subject as Record<string, unknown> | undefined
  const repository = item.repository as Record<string, unknown> | undefined
  return (
    typeof item.id === "string" &&
    typeof item.unread === "boolean" &&
    typeof item.reason === "string" &&
    typeof item.updated_at === "string" &&
    Boolean(subject) &&
    typeof subject?.title === "string" &&
    typeof subject?.type === "string" &&
    Boolean(repository) &&
    typeof repository?.full_name === "string" &&
    typeof repository?.html_url === "string" &&
    typeof item.url === "string" &&
    typeof item.subscription_url === "string"
  )
}

function isNotificationPage(value: unknown): value is GitHubNotificationPayload[] {
  return Array.isArray(value) && value.every(isNotificationPayload)
}

function mapNotification(item: GitHubNotificationPayload, host: string): InboxNotification {
  const repository = sanitizeGitHubText(item.repository.full_name)
  const subjectType = sanitizeGitHubText(item.subject.type)
  const subjectApiUrl = item.subject.url
  return {
    id: item.id,
    unread: item.unread,
    reason: sanitizeGitHubText(item.reason),
    updatedAt: item.updated_at,
    lastReadAt: item.last_read_at,
    title: sanitizeGitHubText(item.subject.title),
    subjectType,
    repository,
    repositoryUrl: item.repository.html_url,
    subjectApiUrl,
    threadApiUrl: item.url,
    subscriptionApiUrl: item.subscription_url,
    url: notificationBrowserUrl({
      host,
      repository,
      subjectType,
      subjectApiUrl,
      repositoryUrl: item.repository.html_url,
    }),
  }
}

export async function loadNotificationsPage({
  host,
  page,
  perPage,
  options = {},
}: {
  host: string
  page: number
  perPage: number
  options?: GhTransportOptions
}) {
  const boundedPage = Math.max(1, Math.floor(page))
  const boundedSize = Math.max(1, Math.min(100, Math.floor(perPage)))
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
        `notifications?all=true&participating=false&per_page=${boundedSize}&page=${boundedPage}`,
      ],
    },
    { ...options, host, validate: isNotificationPage },
  )
  return {
    items: payload.map((item) => mapNotification(item, host)),
    page: boundedPage,
    hasNextPage: payload.length === boundedSize,
  }
}

export function markNotificationRead(
  item: Pick<InboxNotification, "id">,
  host: string,
  options: GhTransportOptions = {},
) {
  return runGhCommand(
    { args: ["api", "--hostname", host, "--method", "PATCH", `notifications/threads/${item.id}`] },
    { ...options, host },
  )
}

export function markNotificationDone(
  item: Pick<InboxNotification, "id">,
  host: string,
  options: GhTransportOptions = {},
) {
  return runGhCommand(
    { args: ["api", "--hostname", host, "--method", "DELETE", `notifications/threads/${item.id}`] },
    { ...options, host },
  )
}

export function unsubscribeNotification(
  item: Pick<InboxNotification, "id">,
  host: string,
  options: GhTransportOptions = {},
) {
  return runGhCommand(
    {
      args: [
        "api",
        "--hostname",
        host,
        "--method",
        "DELETE",
        `notifications/threads/${item.id}/subscription`,
      ],
    },
    { ...options, host },
  )
}

export function openNotificationInBrowser(
  item: Pick<InboxNotification, "url" | "repository" | "subjectType">,
  host: string,
  options: GhTransportOptions = {},
) {
  const number = item.url.match(/\/(?:pull|issues)\/(\d+)(?:$|[?#])/i)?.[1]
  if (number && item.subjectType === "PullRequest") {
    return runGhCommand(
      { args: ["pr", "view", number, "--repo", item.repository, "--web"] },
      { ...options, host },
    )
  }
  if (number && item.subjectType === "Issue") {
    return runGhCommand(
      { args: ["issue", "view", number, "--repo", item.repository, "--web"] },
      { ...options, host },
    )
  }
  const path = new URL(item.url).pathname.replace(`/${item.repository}`, "") || "/"
  return runGhCommand({ args: ["browse", path, "--repo", item.repository] }, { ...options, host })
}
