import type { InboxConversation, InboxConversationTarget } from "../model/inbox/conversation"
import { loadInboxConversationTarget } from "./github/inbox-conversation"
import { type GhTransportOptions, GitHubTransportError } from "./github/transport"
import { registerInboxDisposer } from "./inbox-session"
import { IssueDetailsSession } from "./issue-details-session"
import { PullRequestDetailsSession } from "./pr-details-session"
import { rememberRemoteCacheEntry } from "./remote-cache"

export class InboxConversationSession {
  private controller: AbortController | null = null
  private readonly issues: IssueDetailsSession
  private readonly prs: PullRequestDetailsSession
  private readonly cache = new Map<string, InboxConversation>()
  private readonly unregister: () => void

  constructor(private readonly transport: GhTransportOptions = {}) {
    this.issues = new IssueDetailsSession(transport)
    this.prs = new PullRequestDetailsSession(transport)
    this.unregister = registerInboxDisposer(() => this.dispose())
  }

  async load(target: InboxConversationTarget) {
    this.cancel()
    const cached = this.cache.get(target.subject.key)
    if (cached) return { details: cached, fromCache: true }
    return this.refresh(target)
  }

  async refresh(target: InboxConversationTarget) {
    this.cancel()
    const controller = new AbortController()
    this.controller = controller
    try {
      const header = await loadInboxConversationTarget(target.subject, {
        ...this.transport,
        signal: controller.signal,
      })
      this.assertCurrent(controller)
      let details: InboxConversation | null = null
      if (header?.kind === "issue") {
        const result = await this.issues.refresh(header.item)
        if (result.details) details = { ...header, details: result.details }
      } else if (header?.kind === "pr") {
        const result = await this.prs.refresh(header.item)
        if (result.details) details = { ...header, details: result.details }
      }
      this.assertCurrent(controller)
      if (details) rememberRemoteCacheEntry(this.cache, target.subject.key, details, 32)
      return { details, fromCache: false }
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  async loadMore(target: InboxConversationTarget, current: InboxConversation) {
    this.cancel()
    const controller = new AbortController()
    this.controller = controller
    try {
      const details: InboxConversation =
        current.kind === "issue"
          ? { ...current, details: await this.issues.loadMore(current.item, current.details) }
          : {
              ...current,
              details: await this.prs.loadMore(current.item, current.details, "activity"),
            }
      this.assertCurrent(controller)
      rememberRemoteCacheEntry(this.cache, target.subject.key, details, 32)
      return details
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  private assertCurrent(controller: AbortController) {
    if (this.controller !== controller || controller.signal.aborted) {
      throw new GitHubTransportError("cancelled", "GitHub request cancelled")
    }
  }

  cancel() {
    this.controller?.abort()
    this.controller = null
    this.issues.cancel()
    this.prs.cancel()
  }

  dispose() {
    this.cancel()
    this.cache.clear()
    this.issues.dispose()
    this.prs.dispose()
    this.unregister()
  }
}
