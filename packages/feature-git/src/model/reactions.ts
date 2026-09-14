export const GITHUB_REACTION_CHOICES = [
  { content: "THUMBS_UP", emoji: "👍", label: "Curtir" },
  { content: "HEART", emoji: "❤️", label: "Amei" },
  { content: "HOORAY", emoji: "🎉", label: "Comemorar" },
  { content: "LAUGH", emoji: "😄", label: "Rir" },
  { content: "EYES", emoji: "👀", label: "Acompanhar" },
] as const

export type GitHubReactionContent = (typeof GITHUB_REACTION_CHOICES)[number]["content"]

export type GitHubReactionGroup = {
  content: GitHubReactionContent
  count: number
  viewerHasReacted: boolean
}

export function isGitHubReactionContent(value: unknown): value is GitHubReactionContent {
  return GITHUB_REACTION_CHOICES.some((reaction) => reaction.content === value)
}

export function normalizeGitHubReactionGroups(value: unknown): GitHubReactionGroup[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const group = entry as {
      content?: unknown
      viewerHasReacted?: unknown
      users?: { totalCount?: unknown }
    }
    if (!isGitHubReactionContent(group.content)) return []
    return [
      {
        content: group.content,
        count:
          typeof group.users?.totalCount === "number" && Number.isFinite(group.users.totalCount)
            ? Math.max(0, group.users.totalCount)
            : 0,
        viewerHasReacted: group.viewerHasReacted === true,
      },
    ]
  })
}

export function githubReactionCount(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.reduce((total, entry) => {
    if (!entry || typeof entry !== "object") return total
    const count = (entry as { users?: { totalCount?: unknown } }).users?.totalCount
    return total + (typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0)
  }, 0)
}

export function viewerHasGitHubReaction(
  groups: readonly GitHubReactionGroup[] | undefined,
  content: GitHubReactionContent,
) {
  return groups?.some((group) => group.content === content && group.viewerHasReacted) === true
}

export function hasAnyGitHubReaction(
  groups: readonly GitHubReactionGroup[] | undefined,
  fallbackCount = 0,
) {
  return fallbackCount > 0 || groups?.some((group) => group.count > 0) === true
}

export function githubReactionSummary(groups: readonly GitHubReactionGroup[] | undefined) {
  return GITHUB_REACTION_CHOICES.flatMap((reaction) => {
    const group = groups?.find((candidate) => candidate.content === reaction.content)
    return group?.count
      ? [`${reaction.emoji} ${group.count}${group.viewerHasReacted ? " ✓" : ""}`]
      : []
  }).join("  ")
}

export type GitHubDiscussionIdentity = {
  host: string
  owner: string
  repository: string
  number: number
}

export function isGitHubDiscussionCommentUrl(value: unknown, identity: GitHubDiscussionIdentity) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    const owner = encodeURIComponent(identity.owner)
    const repository = encodeURIComponent(identity.repository)
    const issuePath = `/${owner}/${repository}/issues/${identity.number}`
    const pullPath = `/${owner}/${repository}/pull/${identity.number}`
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === identity.host.toLowerCase() &&
      (url.pathname === issuePath || url.pathname === pullPath) &&
      /^#issuecomment-\d+$/.test(url.hash)
    )
  } catch {
    return false
  }
}

export function githubDiscussionReplyBody({
  author,
  url,
  body,
}: {
  author: string
  url: string
  body: string
}) {
  const safeAuthor = author.replace(/[^A-Za-z0-9[\]-]/g, "").slice(0, 100)
  const mention = safeAuthor ? `@${safeAuthor} ` : ""
  return `↳ ${url}\n\n${mention}${body.trim()}`
}

type GitHubDiscussionComment = {
  id: string
  url: string
  body: string
  createdAt: string
  author: { login: string }
}

export type GitHubDiscussionThreadEntry<T extends GitHubDiscussionComment> = {
  comment: T
  body: string
  depth: number
  isReply: boolean
}

function normalizedDiscussionUrl(value: string) {
  try {
    return new URL(value).href
  } catch {
    return value
  }
}

function discussionReplyParts(body: string, identity: GitHubDiscussionIdentity) {
  const match = /^↳ ([^\r\n]+)\r?\n\r?\n([\s\S]*)$/.exec(body)
  const parentUrl = match?.[1]
  const replyBody = match?.[2]
  if (!parentUrl || replyBody === undefined || !isGitHubDiscussionCommentUrl(parentUrl, identity)) {
    return null
  }
  return { parentUrl: normalizedDiscussionUrl(parentUrl), body: replyBody }
}

export function threadGitHubDiscussionComments<T extends GitHubDiscussionComment>(
  comments: readonly T[],
  identity: GitHubDiscussionIdentity,
): GitHubDiscussionThreadEntry<T>[] {
  const positionById = new Map(comments.map((comment, index) => [comment.id, index]))
  const commentByUrl = new Map(
    comments.map((comment) => [normalizedDiscussionUrl(comment.url), comment]),
  )
  const commentById = new Map(comments.map((comment) => [comment.id, comment]))
  const replyById = new Map(
    comments.flatMap((comment) => {
      const reply = discussionReplyParts(comment.body, identity)
      return reply ? [[comment.id, reply] as const] : []
    }),
  )
  const parentById = new Map<string, T>()
  for (const comment of comments) {
    const reply = replyById.get(comment.id)
    const parent = reply ? commentByUrl.get(reply.parentUrl) : undefined
    if (!parent || parent.id === comment.id) continue
    const parentPosition = positionById.get(parent.id) ?? -1
    const commentPosition = positionById.get(comment.id) ?? -1
    const createdEarlier = parent.createdAt.localeCompare(comment.createdAt) < 0
    const createdTogether =
      parent.createdAt === comment.createdAt && parentPosition < commentPosition
    if (createdEarlier || createdTogether) parentById.set(comment.id, parent)
  }
  const childrenById = new Map<string, T[]>()
  for (const [commentId, parent] of parentById) {
    const comment = commentById.get(commentId)
    if (!comment) continue
    const children = childrenById.get(parent.id) ?? []
    children.push(comment)
    childrenById.set(parent.id, children)
  }
  const newestFirst = (left: T, right: T) => right.createdAt.localeCompare(left.createdAt)
  const roots = comments.filter((comment) => !parentById.has(comment.id)).sort(newestFirst)
  const result: GitHubDiscussionThreadEntry<T>[] = []
  const append = (comment: T, depth: number) => {
    const reply = replyById.get(comment.id)
    const parent = parentById.get(comment.id)
    const mention = parent ? `@${parent.author.login} ` : ""
    const body = reply?.body.startsWith(mention) ? reply.body.slice(mention.length) : reply?.body
    result.push({ comment, body: body ?? comment.body, depth, isReply: Boolean(reply) })
    for (const child of (childrenById.get(comment.id) ?? []).sort(newestFirst)) {
      append(child, depth + 1)
    }
  }
  for (const root of roots) append(root, 0)
  return result
}
