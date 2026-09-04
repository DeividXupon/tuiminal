import {
  type PullRequestCheckSummary,
  pullRequestCheckTransitionShouldNotify,
  summarizePullRequestChecks,
} from "../model/pr/checks"
import { pullRequestIdentityKey } from "../model/pr/query"
import type { PullRequestCheck, PullRequestSummary } from "../model/pr/types"
import { registerPullRequestSessionDisposer } from "./pr-session"

type WatchReader = (item: PullRequestSummary) => Promise<readonly PullRequestCheck[]>
type WatchNotification = (item: PullRequestSummary, summary: PullRequestCheckSummary) => void

type WatchEntry = {
  item: PullRequestSummary
  previous: PullRequestCheckSummary | null
  failures: number
  timer: ReturnType<typeof setTimeout> | null
  stopped: boolean
}

export class PullRequestWatchScheduler {
  private readonly entries = new Map<string, WatchEntry>()
  private readonly unregisterDisposer: () => void

  constructor(
    private readonly read: WatchReader,
    private readonly notify: WatchNotification,
    private readonly options: {
      intervalMs?: number
      maxWatches?: number
      random?: () => number
      setTimer?: typeof setTimeout
      clearTimer?: typeof clearTimeout
    } = {},
  ) {
    this.unregisterDisposer = registerPullRequestSessionDisposer(() => this.dispose())
  }

  private key(item: PullRequestSummary) {
    return `${pullRequestIdentityKey(item.identity)}:${item.headSha}`
  }

  watch(item: PullRequestSummary) {
    const key = this.key(item)
    if (this.entries.has(key)) return true
    if (this.entries.size >= (this.options.maxWatches ?? 10)) return false
    const entry: WatchEntry = { item, previous: null, failures: 0, timer: null, stopped: false }
    this.entries.set(key, entry)
    void this.poll(key, entry)
    return true
  }

  unwatch(item: PullRequestSummary) {
    const key = this.key(item)
    const entry = this.entries.get(key)
    if (!entry) return false
    entry.stopped = true
    if (entry.timer) (this.options.clearTimer ?? clearTimeout)(entry.timer)
    this.entries.delete(key)
    return true
  }

  isWatching(item: PullRequestSummary) {
    return this.entries.has(this.key(item))
  }

  private schedule(key: string, entry: WatchEntry) {
    if (entry.stopped) return
    const base = this.options.intervalMs ?? 15_000
    const backoff = Math.min(8, 2 ** entry.failures)
    const jitter = 0.85 + (this.options.random?.() ?? Math.random()) * 0.3
    entry.timer = (this.options.setTimer ?? setTimeout)(
      () => void this.poll(key, entry),
      base * backoff * jitter,
    )
  }

  private async poll(key: string, entry: WatchEntry) {
    try {
      const summary = summarizePullRequestChecks(await this.read(entry.item))
      if (pullRequestCheckTransitionShouldNotify(entry.previous, summary)) {
        this.notify(entry.item, summary)
      }
      entry.previous = summary
      entry.failures = 0
      if (summary.terminal) {
        this.unwatch(entry.item)
        return
      }
    } catch {
      entry.failures += 1
    }
    if (this.entries.get(key) === entry) this.schedule(key, entry)
  }

  dispose() {
    for (const entry of this.entries.values()) {
      entry.stopped = true
      if (entry.timer) (this.options.clearTimer ?? clearTimeout)(entry.timer)
    }
    this.entries.clear()
    this.unregisterDisposer()
  }
}
