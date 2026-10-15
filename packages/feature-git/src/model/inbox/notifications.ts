import type { InboxNotification, InboxSectionId, InboxSubjectState } from "./types"

const REASONS_BY_SECTION: Partial<Record<InboxSectionId, readonly string[]>> = {
  review: ["review_requested"],
  assigned: ["assign"],
  mentioned: ["mention", "team_mention"],
}

export function notificationBrowserUrl({
  host,
  repository,
  subjectType,
  subjectApiUrl,
  repositoryUrl,
}: {
  host: string
  repository: string
  subjectType: string
  subjectApiUrl: string | null
  repositoryUrl: string
}) {
  const number = subjectApiUrl?.match(/\/(?:pulls|issues|discussions)\/(\d+)(?:$|\?)/)?.[1]
  if (number && subjectType === "PullRequest") return `https://${host}/${repository}/pull/${number}`
  if (number && subjectType === "Issue") return `https://${host}/${repository}/issues/${number}`
  if (number && subjectType === "Discussion") {
    return `https://${host}/${repository}/discussions/${number}`
  }
  return repositoryUrl || `https://${host}/${repository}`
}

export function inboxItemsForSection(
  items: readonly InboxNotification[],
  section: InboxSectionId,
  savedIds: ReadonlySet<string>,
) {
  if (section === "saved") return items.filter((item) => savedIds.has(item.id))
  if (section === "inbox") return items
  const reasons = REASONS_BY_SECTION[section] ?? []
  return items.filter((item) => reasons.includes(item.reason))
}

export function mergeInboxNotifications(
  current: readonly InboxNotification[],
  additions: readonly InboxNotification[],
) {
  const merged = new Map(current.map((item) => [item.id, item]))
  for (const item of additions) merged.set(item.id, item)
  return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function applyInboxSubjectStates(
  current: InboxNotification[],
  requested: readonly InboxNotification[],
  states: ReadonlyMap<string, InboxSubjectState>,
) {
  const requestedById = new Map(requested.map((item) => [item.id, item]))
  let changed = false
  const next = current.map((item) => {
    const original = requestedById.get(item.id)
    const state = states.get(item.id)
    if (
      !original ||
      !state ||
      item.subjectApiUrl !== original.subjectApiUrl ||
      item.updatedAt !== original.updatedAt ||
      item.subjectState === state
    )
      return item
    changed = true
    return { ...item, subjectState: state }
  })
  return changed ? next : current
}
