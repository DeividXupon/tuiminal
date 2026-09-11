import {
  mergePullRequestDetailPage,
  nextPullRequestDetailConnection,
} from "../model/pr/detail-pagination"
import { pullRequestIdentityKey } from "../model/pr/query"
import type {
  PullRequestDetails,
  PullRequestPreviewTab,
  PullRequestSummary,
} from "../model/pr/types"
import { loadPullRequestDetailPage } from "./github/detail-pages"
import { loadPullRequestDetails } from "./github/details"
import type { GhTransportOptions } from "./github/transport"
import { registerPullRequestSessionDisposer } from "./pr-session"

const DETAILS_CACHE_LIMIT = 32

export class PullRequestDetailsSession {
  private activeController: AbortController | null = null
  private readonly cache = new Map<string, PullRequestDetails>()
  private readonly unregisterDisposer: () => void

  constructor(private readonly transport: GhTransportOptions = {}) {
    this.unregisterDisposer = registerPullRequestSessionDisposer(() => this.dispose())
  }

  private key(item: PullRequestSummary) {
    return `${pullRequestIdentityKey(item.identity)}:${item.headSha}`
  }

  private remember(key: string, details: PullRequestDetails) {
    this.cache.set(key, details)
    while (this.cache.size > DETAILS_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (typeof oldest !== "string") break
      this.cache.delete(oldest)
    }
  }

  async load(item: PullRequestSummary) {
    const key = this.key(item)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return { details: cached, fromCache: true }
    }
    return this.refresh(item)
  }

  async refresh(item: PullRequestSummary) {
    const key = this.key(item)
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const details = await loadPullRequestDetails({
      identity: item.identity,
      options: { ...this.transport, signal: controller.signal },
    })
    if (details) {
      this.remember(key, details)
    }
    return { details, fromCache: false }
  }

  async loadMore(
    item: PullRequestSummary,
    current: PullRequestDetails,
    tab: PullRequestPreviewTab,
  ) {
    const connection = nextPullRequestDetailConnection(current, tab)
    if (!connection) return current
    const after = current.pages[connection].endCursor
    if (!after) return current
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const page = await loadPullRequestDetailPage({
      identity: item.identity,
      connection,
      after,
      options: { ...this.transport, signal: controller.signal },
    })
    if (!page) return current
    const merged = mergePullRequestDetailPage(current, page, connection)
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
