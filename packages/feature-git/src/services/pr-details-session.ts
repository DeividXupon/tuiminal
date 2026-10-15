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
import { type GhTransportOptions, GitHubTransportError } from "./github/transport"
import { registerPullRequestSessionDisposer } from "./pr-session"
import { rememberRemoteCacheEntry } from "./remote-cache"

const DETAILS_CACHE_LIMIT = 32

export class PullRequestDetailsSession {
  private activeController: AbortController | null = null
  private readonly cache = new Map<string, PullRequestDetails>()
  private readonly unregisterDisposer: () => void

  constructor(private readonly transport: GhTransportOptions = {}) {
    this.unregisterDisposer = registerPullRequestSessionDisposer(() => this.dispose())
  }

  private key(item: PullRequestSummary) {
    return `${pullRequestIdentityKey(item.identity)}:${item.headSha}:${item.updatedAt}`
  }

  private remember(key: string, details: PullRequestDetails) {
    rememberRemoteCacheEntry(this.cache, key, details, DETAILS_CACHE_LIMIT)
  }

  async load(item: PullRequestSummary) {
    this.cancel()
    const key = this.key(item)
    const cached = this.cache.get(key)
    if (cached) {
      this.remember(key, cached)
      return { details: cached, fromCache: true }
    }
    return this.refresh(item)
  }

  async refresh(item: PullRequestSummary) {
    const key = this.key(item)
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    try {
      const details = await loadPullRequestDetails({
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
    try {
      const page = await loadPullRequestDetailPage({
        identity: item.identity,
        connection,
        after,
        options: { ...this.transport, signal: controller.signal },
      })
      this.assertCurrent(controller)
      if (!page) return current
      const merged = mergePullRequestDetailPage(current, page, connection)
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
