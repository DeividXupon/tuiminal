import { mergeInboxNotifications } from "../model/inbox/notifications"
import type { InboxNotification } from "../model/inbox/types"
import { pullRequestProfileForRoot } from "../model/pr/config"
import { loadPullRequestConfig } from "../storage/pr/config"
import { detectGhCapabilities, type GhCapabilities, loadGhAuthContext } from "./github/auth"
import { assertAllowedGitHubHost } from "./github/host"
import { loadNotificationsPage } from "./github/notifications"
import type { GhTransportOptions } from "./github/transport"
import { resolveGitProjectContext } from "./git"

const inboxDisposers = new Set<() => void | Promise<void>>()

export function registerInboxDisposer(dispose: () => void | Promise<void>) {
  inboxDisposers.add(dispose)
  return () => inboxDisposers.delete(dispose)
}

export async function disposeInboxResources() {
  const disposers = [...inboxDisposers]
  inboxDisposers.clear()
  await Promise.allSettled(disposers.map(async (dispose) => dispose()))
}

export type InboxSessionResult =
  | { status: "config-error"; error: string }
  | { status: "requirements"; capabilities: GhCapabilities }
  | {
      status: "ready"
      items: InboxNotification[]
      host: string
      viewerLogin: string
      page: number
      pageSize: number
      hasNextPage: boolean
      refreshSeconds: number
      cachedAt: number
      fromCache: boolean
      root: string
    }

type ReadyResult = Extract<InboxSessionResult, { status: "ready" }>

export class InboxSession {
  private activeController: AbortController | null = null
  private cache: ReadyResult | null = null
  private readonly unregister: () => void

  constructor(
    private readonly options: { transport?: GhTransportOptions; configPath?: string } = {},
  ) {
    this.unregister = registerInboxDisposer(() => this.dispose())
  }

  async load(root: string, force = false): Promise<InboxSessionResult> {
    const loaded = this.options.configPath
      ? loadPullRequestConfig(this.options.configPath)
      : loadPullRequestConfig()
    if (loaded.error) return { status: "config-error", error: loaded.error }
    const fallback = loaded.config.profiles[root]
      ? null
      : (await resolveGitProjectContext(root)).remote
    const profile = pullRequestProfileForRoot(loaded.config, root, fallback)
    const host = assertAllowedGitHubHost(profile.host, [loaded.config.defaults.host, profile.host])
    if (!force && this.cache?.root === root && this.cache.host === host) {
      return { ...this.cache, fromCache: true }
    }
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const transport = { ...this.options.transport, host, signal: controller.signal }
    const capabilities = await detectGhCapabilities(transport)
    if (!capabilities.supported) return { status: "requirements", capabilities }
    const auth = await loadGhAuthContext({ host, generation: 0, options: transport })
    const pageSize = loaded.config.defaults.pageSize
    const page = await loadNotificationsPage({
      host,
      page: 1,
      perPage: pageSize,
      options: transport,
    })
    const result: ReadyResult = {
      status: "ready",
      items: page.items,
      host,
      viewerLogin: auth.viewerLogin,
      page: 1,
      pageSize,
      hasNextPage: page.hasNextPage,
      refreshSeconds: loaded.config.defaults.refreshSeconds,
      cachedAt: Date.now(),
      fromCache: false,
      root,
    }
    this.cache = result
    return result
  }

  async loadNextPage(current: ReadyResult): Promise<InboxSessionResult> {
    if (!current.hasNextPage) return current
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const next = await loadNotificationsPage({
      host: current.host,
      page: current.page + 1,
      perPage: current.pageSize,
      options: { ...this.options.transport, host: current.host, signal: controller.signal },
    })
    const result: ReadyResult = {
      ...current,
      items: mergeInboxNotifications(current.items, next.items),
      page: next.page,
      hasNextPage: next.hasNextPage,
      cachedAt: Date.now(),
      fromCache: false,
    }
    this.cache = result
    return result
  }

  async refresh(current: ReadyResult): Promise<InboxSessionResult> {
    const first = await this.load(current.root, true)
    if (first.status !== "ready") return first
    let result = first
    for (let page = 1; page < current.page && result.hasNextPage; page += 1) {
      const next = await this.loadNextPage(result)
      if (next.status !== "ready") return next
      result = next
    }
    return result
  }

  cancelActiveLoad() {
    this.activeController?.abort()
    this.activeController = null
  }

  dispose() {
    this.cancelActiveLoad()
    this.cache = null
    this.unregister()
  }
}
