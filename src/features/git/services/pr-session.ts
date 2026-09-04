import { type PullRequestProfile, pullRequestProfileForRoot } from "../model/pr/config"
import { buildEffectivePullRequestQueries, pullRequestIdentityKey } from "../model/pr/query"
import type {
  PullRequestAuthContext,
  PullRequestSection,
  PullRequestSummary,
} from "../model/pr/types"
import { loadPullRequestConfig } from "../storage/pr/config"
import { detectGhCapabilities, type GhCapabilities, loadGhAuthContext } from "./github/auth"
import { type GitHubAccountScope, loadGitHubAccountScope } from "./github/account-scope"
import { assertAllowedGitHubHost } from "./github/host"
import { searchPullRequestsPage } from "./github/search"
import type { GhTransportOptions } from "./github/transport"

const pullRequestSessionDisposers = new Set<() => void | Promise<void>>()

export function registerPullRequestSessionDisposer(dispose: () => void | Promise<void>) {
  pullRequestSessionDisposers.add(dispose)
  return () => pullRequestSessionDisposers.delete(dispose)
}

export async function disposePullRequestResources() {
  const disposers = [...pullRequestSessionDisposers]
  pullRequestSessionDisposers.clear()
  await Promise.allSettled(disposers.map((dispose) => dispose()))
}

export type PullRequestSessionResult =
  | { status: "config-error"; error: string }
  | { status: "requirements"; capabilities: GhCapabilities }
  | {
      status: "ready"
      auth: PullRequestAuthContext
      profile: PullRequestProfile
      section: PullRequestSection
      items: PullRequestSummary[]
      totalCount: number | null
      partial: boolean
      hasNextPage: boolean
      loadedCount: number
      fromCache: boolean
      cachedAt: number
      scope: {
        mode: "account" | "repositories"
        sourceCount: number
        partial: boolean
      }
      root: string
    }

type PullRequestSourceCursor = {
  query: string
  endCursor: string | null
  hasNextPage: boolean
}

type PullRequestCacheEntry = Extract<PullRequestSessionResult, { status: "ready" }> & {
  expiresAt: number
  sources: PullRequestSourceCursor[]
  dataErrors: boolean
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length)
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      const value = values[index]
      if (value !== undefined) results[index] = await operation(value)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return results
}

function aggregatePages(pages: Awaited<ReturnType<typeof searchPullRequestsPage>>[]) {
  const items = new Map<string, PullRequestSummary>()
  let totalCount = 0
  let totalKnown = true
  let partial = false
  for (const page of pages) {
    partial ||= page.partial || page.hasNextPage
    if (page.totalCount === null) totalKnown = false
    else totalCount += page.totalCount
    for (const item of page.items) items.set(pullRequestIdentityKey(item.identity), item)
  }
  return {
    items: [...items.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    totalCount: totalKnown ? totalCount : null,
    partial,
  }
}

function cacheKey({
  root,
  host,
  repositories,
  section,
}: {
  root: string
  host: string
  repositories: readonly string[]
  section: PullRequestSection
}) {
  return JSON.stringify([root, host, repositories, section.id, section.query])
}

function publicCacheEntry(entry: PullRequestCacheEntry, fromCache: boolean) {
  const { expiresAt: _expiresAt, sources: _sources, dataErrors: _dataErrors, ...result } = entry
  return { ...result, fromCache }
}

export function mergePullRequestItems(
  current: readonly PullRequestSummary[],
  additions: readonly PullRequestSummary[],
) {
  const items = new Map(current.map((item) => [pullRequestIdentityKey(item.identity), item]))
  for (const item of additions) items.set(pullRequestIdentityKey(item.identity), item)
  return [...items.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export class PullRequestSession {
  private activeController: AbortController | null = null
  private authSignature: string | null = null
  private authGeneration = 0
  private accountScope: GitHubAccountScope | null = null
  private readonly cache = new Map<string, PullRequestCacheEntry>()
  private readonly unregisterDisposer: () => void

  constructor(
    private readonly options: {
      configPath?: string
      transport?: GhTransportOptions
    } = {},
  ) {
    this.unregisterDisposer = registerPullRequestSessionDisposer(() => this.dispose())
  }

  async loadSection(
    root: string,
    sectionId?: string,
    queryOverride?: string | null,
    force = false,
  ): Promise<PullRequestSessionResult> {
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const loaded = this.options.configPath
      ? loadPullRequestConfig(this.options.configPath)
      : loadPullRequestConfig()
    if (loaded.error) return { status: "config-error", error: loaded.error }
    const profile = pullRequestProfileForRoot(loaded.config, root)
    const host = assertAllowedGitHubHost(profile.host, [loaded.config.defaults.host, profile.host])
    const transport = { ...this.options.transport, host, signal: controller.signal }
    const capabilities = await detectGhCapabilities(transport)
    if (!capabilities.supported) return { status: "requirements", capabilities }

    const candidateAuth = await loadGhAuthContext({ host, generation: 0, options: transport })
    const signature = `${candidateAuth.host}:${candidateAuth.viewerId}:${candidateAuth.viewerLogin}`
    if (signature !== this.authSignature) {
      this.authSignature = signature
      this.authGeneration += 1
      this.cache.clear()
      this.accountScope = null
    }
    const auth = { ...candidateAuth, generation: this.authGeneration }
    const section =
      profile.sections.find((candidate) => candidate.id === sectionId) ?? profile.sections[0]
    if (!section) return { status: "config-error", error: "No pull request section configured" }
    const effectiveSection = queryOverride ? { ...section, query: queryOverride } : section
    if (force && !profile.repositories.length) this.accountScope = null
    if (!profile.repositories.length && !this.accountScope) {
      this.accountScope = await loadGitHubAccountScope({
        host,
        viewerLogin: auth.viewerLogin,
        options: transport,
      })
    }
    const scope = profile.repositories.length
      ? { mode: "repositories" as const, sourceCount: profile.repositories.length, partial: false }
      : {
          mode: "account" as const,
          sourceCount:
            1 +
            (this.accountScope?.organizations.length ?? 0) +
            (this.accountScope?.repositories.length ?? 0),
          partial: this.accountScope?.partial ?? true,
        }
    const key = cacheKey({
      root,
      host,
      repositories: profile.repositories,
      section: effectiveSection,
    })
    const cached = this.cache.get(key)
    if (!force && cached && cached.expiresAt > Date.now()) return publicCacheEntry(cached, true)
    const queries = buildEffectivePullRequestQueries({
      query: effectiveSection.query,
      repositories: profile.repositories,
      ...(this.accountScope ? { accountScope: this.accountScope } : {}),
    })
    const pages = await mapWithConcurrency(queries, 3, (effective) =>
      searchPullRequestsPage({
        host,
        query: effective.query,
        first: Math.min(
          loaded.config.defaults.pageSize,
          effectiveSection.limit ?? loaded.config.defaults.pageSize,
        ),
        options: transport,
      }),
    )
    const aggregate = aggregatePages(pages)
    const cachedAt = Date.now()
    const entry: PullRequestCacheEntry = {
      status: "ready",
      auth,
      profile,
      section: effectiveSection,
      root,
      ...aggregate,
      hasNextPage: pages.some((page) => page.hasNextPage),
      loadedCount: aggregate.items.length,
      fromCache: false,
      cachedAt,
      scope,
      expiresAt: cachedAt + loaded.config.defaults.refreshSeconds * 1_000,
      sources: pages.map((page, index) => ({
        query: queries[index]?.query ?? "",
        endCursor: page.endCursor,
        hasNextPage: page.hasNextPage,
      })),
      dataErrors: pages.some((page) => page.partial),
    }
    this.cache.set(key, entry)
    return publicCacheEntry(entry, false)
  }

  async loadNextPage(
    root: string,
    sectionId?: string,
    queryOverride?: string | null,
  ): Promise<PullRequestSessionResult> {
    const verified = await this.loadSection(root, sectionId, queryOverride)
    if (verified.status !== "ready" || !verified.hasNextPage) return verified
    const loaded = this.options.configPath
      ? loadPullRequestConfig(this.options.configPath)
      : loadPullRequestConfig()
    if (loaded.error) return { status: "config-error", error: loaded.error }
    const profile = verified.profile
    const effectiveSection = verified.section
    const key = cacheKey({
      root,
      host: verified.auth.host,
      repositories: profile.repositories,
      section: effectiveSection,
    })
    const current = this.cache.get(key)
    if (!current?.hasNextPage) return this.loadSection(root, sectionId, queryOverride)
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const pending = current.sources.filter((source) => source.hasNextPage && source.endCursor)
    const pages = await mapWithConcurrency(pending, 3, (source) =>
      searchPullRequestsPage({
        host: verified.auth.host,
        query: source.query,
        first: Math.min(
          loaded.config.defaults.pageSize,
          effectiveSection.limit ?? loaded.config.defaults.pageSize,
        ),
        after: source.endCursor,
        options: {
          ...this.options.transport,
          host: verified.auth.host,
          signal: controller.signal,
        },
      }),
    )
    const byQuery = new Map(pending.map((source, index) => [source.query, pages[index]]))
    const sources = current.sources.map((source) => {
      const page = byQuery.get(source.query)
      return page
        ? { query: source.query, endCursor: page.endCursor, hasNextPage: page.hasNextPage }
        : source
    })
    const additions = pages.flatMap((page) => page?.items ?? [])
    const items = mergePullRequestItems(current.items, additions)
    const dataErrors = current.dataErrors || pages.some((page) => page?.partial)
    const hasNextPage = sources.some((source) => source.hasNextPage)
    const next: PullRequestCacheEntry = {
      ...current,
      items,
      loadedCount: items.length,
      partial: dataErrors || hasNextPage,
      hasNextPage,
      fromCache: false,
      cachedAt: Date.now(),
      expiresAt: Date.now() + loaded.config.defaults.refreshSeconds * 1_000,
      sources,
      dataErrors,
    }
    this.cache.set(key, next)
    return publicCacheEntry(next, false)
  }

  cancelActiveLoad() {
    this.activeController?.abort()
    this.activeController = null
  }

  dispose() {
    this.cancelActiveLoad()
    this.cache.clear()
    this.unregisterDisposer()
  }
}
