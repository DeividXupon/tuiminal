import { issueIdentityKey } from "../model/issue/query"
import type { IssueDetails, IssueSummary } from "../model/issue/types"
import { loadIssueDetails } from "./github/issue-details"
import type { GhTransportOptions } from "./github/transport"
import { registerIssueResourceDisposer } from "./issue-session"

const ISSUE_DETAILS_CACHE_LIMIT = 32

function mergeComments(current: IssueDetails, page: IssueDetails): IssueDetails {
  const comments = new Map(
    [...page.comments, ...current.comments].map((comment) => [comment.id, comment]),
  )
  return {
    ...current,
    comments: [...comments.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    ),
    commentPage: page.commentPage,
    partial: current.partial || page.partial,
  }
}

export class IssueDetailsSession {
  private activeController: AbortController | null = null
  private readonly cache = new Map<string, IssueDetails>()
  private readonly unregisterDisposer: () => void

  constructor(private readonly transport: GhTransportOptions = {}) {
    this.unregisterDisposer = registerIssueResourceDisposer(() => this.dispose())
  }

  private key(item: IssueSummary) {
    return `${issueIdentityKey(item.identity)}:${item.updatedAt}`
  }

  private remember(key: string, details: IssueDetails) {
    this.cache.delete(key)
    this.cache.set(key, details)
    while (this.cache.size > ISSUE_DETAILS_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (typeof oldest !== "string") break
      this.cache.delete(oldest)
    }
  }

  async load(item: IssueSummary) {
    const key = this.key(item)
    const cached = this.cache.get(key)
    if (cached) {
      this.remember(key, cached)
      return { details: cached, fromCache: true }
    }
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const details = await loadIssueDetails({
      identity: item.identity,
      options: { ...this.transport, signal: controller.signal },
    })
    if (details) this.remember(key, details)
    return { details, fromCache: false }
  }

  async loadMore(item: IssueSummary, current: IssueDetails) {
    if (!current.commentPage.hasNextPage || !current.commentPage.endCursor) return current
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const page = await loadIssueDetails({
      identity: item.identity,
      before: current.commentPage.endCursor,
      options: { ...this.transport, signal: controller.signal },
    })
    if (!page) return current
    const merged = mergeComments(current, page)
    this.remember(this.key(item), merged)
    return merged
  }

  cancel() {
    this.activeController?.abort()
    this.activeController = null
  }

  dispose() {
    this.cancel()
    this.cache.clear()
    this.unregisterDisposer()
  }
}
