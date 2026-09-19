import { issueIdentityKey } from "../model/issue/query"
import type { IssueDetails, IssueSummary } from "../model/issue/types"
import { loadIssueDetails } from "./github/issue-details"
import { type GhTransportOptions, GitHubTransportError } from "./github/transport"
import { registerIssueResourceDisposer } from "./issue-session"
import { rememberRemoteCacheEntry } from "./remote-cache"

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
    rememberRemoteCacheEntry(this.cache, key, details, ISSUE_DETAILS_CACHE_LIMIT)
  }

  async load(item: IssueSummary) {
    this.cancel()
    const key = this.key(item)
    const cached = this.cache.get(key)
    if (cached) {
      this.remember(key, cached)
      return { details: cached, fromCache: true }
    }
    return this.refresh(item)
  }

  async refresh(item: IssueSummary) {
    const key = this.key(item)
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    try {
      const details = await loadIssueDetails({
        identity: item.identity,
        options: { ...this.transport, signal: controller.signal },
      })
      this.assertCurrent(controller)
      if (details) this.remember(key, details)
      return { details, fromCache: false }
    } finally {
      if (this.activeController === controller) this.activeController = null
    }
  }

  async loadMore(item: IssueSummary, current: IssueDetails) {
    if (!current.commentPage.hasNextPage || !current.commentPage.endCursor) return current
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    try {
      const page = await loadIssueDetails({
        identity: item.identity,
        before: current.commentPage.endCursor,
        options: { ...this.transport, signal: controller.signal },
      })
      this.assertCurrent(controller)
      if (!page) return current
      const merged = mergeComments(current, page)
      this.remember(this.key(item), merged)
      return merged
    } finally {
      if (this.activeController === controller) this.activeController = null
    }
  }

  private assertCurrent(controller: AbortController) {
    if (this.activeController !== controller || controller.signal.aborted) {
      throw new GitHubTransportError("cancelled", "GitHub request cancelled")
    }
  }

  cancel() {
    const controller = this.activeController
    this.activeController = null
    controller?.abort()
  }

  dispose() {
    this.cancel()
    this.cache.clear()
    this.unregisterDisposer()
  }
}
