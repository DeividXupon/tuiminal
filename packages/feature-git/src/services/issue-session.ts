import { type IssueProfile, issueProfileForRoot } from "../model/issue/config"
import { buildEffectiveIssueQueries, issueIdentityKey } from "../model/issue/query"
import type { IssueAuthContext, IssueSection, IssueSummary } from "../model/issue/types"
import { loadIssueConfig } from "../storage/issue/config"
import { detectGhCapabilities, type GhCapabilities, loadGhAuthContext } from "./github/auth"
import { type GitHubAccountScope, loadGitHubAccountScope } from "./github/account-scope"
import { assertAllowedGitHubHost } from "./github/host"
import { searchIssuesPage } from "./github/issue-search"
import type { GhTransportOptions } from "./github/transport"
import { cachedSectionPageDepth } from "./page-depth"
import { resolveGitProjectContext } from "./git"
import { mapWithConcurrency } from "./map-concurrently"
import { rememberRemoteCacheEntry } from "./remote-cache"
import { aggregateRemotePages, mergeRemoteItems } from "./remote-session-items"

const issueResourceDisposers = new Set<() => void | Promise<void>>()
const ISSUE_SECTION_CACHE_LIMIT = 64

export function registerIssueResourceDisposer(dispose: () => void | Promise<void>) {
  issueResourceDisposers.add(dispose)
  return () => issueResourceDisposers.delete(dispose)
}

export async function disposeIssueResources() {
  const disposers = [...issueResourceDisposers]
  issueResourceDisposers.clear()
  await Promise.allSettled(disposers.map(async (dispose) => dispose()))
}

export type IssueSessionResult =
  | { status: "config-error"; error: string }
  | { status: "requirements"; capabilities: GhCapabilities }
  | {
      status: "ready"
      auth: IssueAuthContext
      profile: IssueProfile
      section: IssueSection
      items: IssueSummary[]
      totalCount: number | null
      partial: boolean
      hasNextPage: boolean
      loadedCount: number
      fromCache: boolean
      cachedAt: number
      refreshSeconds: number
      scope: { mode: "account" | "repositories"; sourceCount: number; partial: boolean }
      root: string
    }

type IssueSourceCursor = { query: string; endCursor: string | null; hasNextPage: boolean }
type IssueCacheEntry = Extract<IssueSessionResult, { status: "ready" }> & {
  expiresAt: number
  sources: IssueSourceCursor[]
  dataErrors: boolean
  pageDepth: number
}

function aggregatePages(pages: Awaited<ReturnType<typeof searchIssuesPage>>[]) {
  return aggregateRemotePages(pages, (item) => issueIdentityKey(item.identity))
}

function cacheKey(
  root: string,
  host: string,
  repositories: readonly string[],
  section: IssueSection,
) {
  return JSON.stringify([root, host, repositories, section.id, section.query])
}

function publicCacheEntry(entry: IssueCacheEntry, fromCache: boolean) {
  const {
    expiresAt: _expiresAt,
    sources: _sources,
    dataErrors: _dataErrors,
    pageDepth: _pageDepth,
    ...result
  } = entry
  return { ...result, fromCache }
}

function mergeIssueItems(current: readonly IssueSummary[], additions: readonly IssueSummary[]) {
  return mergeRemoteItems(current, additions, (item) => issueIdentityKey(item.identity))
}

export class IssueSession {
  private activeController: AbortController | null = null
  private authSignature: string | null = null
  private authGeneration = 0
  private accountScope: GitHubAccountScope | null = null
  private readonly cache = new Map<string, IssueCacheEntry>()
  private readonly unregisterDisposer: () => void

  constructor(
    private readonly options: { configPath?: string; transport?: GhTransportOptions } = {},
  ) {
    this.unregisterDisposer = registerIssueResourceDisposer(() => this.dispose())
  }

  private remember(key: string, entry: IssueCacheEntry) {
    rememberRemoteCacheEntry(this.cache, key, entry, ISSUE_SECTION_CACHE_LIMIT)
  }

  async loadSection(
    root: string,
    sectionId?: string,
    queryOverride?: string | null,
    force = false,
    refreshAccountScope = force,
  ): Promise<IssueSessionResult> {
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const loaded = this.options.configPath
      ? loadIssueConfig(this.options.configPath)
      : loadIssueConfig()
    if (loaded.error) return { status: "config-error", error: loaded.error }
    const fallback = loaded.config.profiles[root]
      ? null
      : (await resolveGitProjectContext(root)).remote
    const profile = issueProfileForRoot(loaded.config, root, fallback)
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
    const auth: IssueAuthContext = { ...candidateAuth, generation: this.authGeneration }
    const section =
      profile.sections.find((candidate) => candidate.id === sectionId) ?? profile.sections[0]
    if (!section) return { status: "config-error", error: "No issue section configured" }
    const effectiveSection = queryOverride ? { ...section, query: queryOverride } : section
    if (refreshAccountScope && !profile.repositories.length) this.accountScope = null
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
    const key = cacheKey(root, host, profile.repositories, effectiveSection)
    const cached = this.cache.get(key)
    if (!force && cached && cached.expiresAt > Date.now()) {
      this.remember(key, cached)
      return publicCacheEntry(cached, true)
    }
    const queries = buildEffectiveIssueQueries({
      query: effectiveSection.query,
      repositories: profile.repositories,
      ...(this.accountScope ? { accountScope: this.accountScope } : {}),
    })
    const pages = await mapWithConcurrency(queries, 3, (effective) =>
      searchIssuesPage({
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
    const entry: IssueCacheEntry = {
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
      refreshSeconds: loaded.config.defaults.refreshSeconds,
      scope,
      expiresAt: cachedAt + loaded.config.defaults.refreshSeconds * 1_000,
      sources: pages.map((page, index) => ({
        query: queries[index]?.query ?? "",
        endCursor: page.endCursor,
        hasNextPage: page.hasNextPage,
      })),
      dataErrors: pages.some((page) => page.partial),
      pageDepth: 1,
    }
    this.remember(key, entry)
    return publicCacheEntry(entry, false)
  }

  async loadNextPage(
    root: string,
    sectionId?: string,
    queryOverride?: string | null,
  ): Promise<IssueSessionResult> {
    const verified = await this.loadSection(root, sectionId, queryOverride)
    if (verified.status !== "ready" || !verified.hasNextPage) return verified
    const loaded = this.options.configPath
      ? loadIssueConfig(this.options.configPath)
      : loadIssueConfig()
    if (loaded.error) return { status: "config-error", error: loaded.error }
    const key = cacheKey(root, verified.auth.host, verified.profile.repositories, verified.section)
    const current = this.cache.get(key)
    if (!current?.hasNextPage) return verified
    this.activeController?.abort()
    const controller = new AbortController()
    this.activeController = controller
    const pending = current.sources.filter((source) => source.hasNextPage && source.endCursor)
    const pages = await mapWithConcurrency(pending, 3, (source) =>
      searchIssuesPage({
        host: verified.auth.host,
        query: source.query,
        first: Math.min(
          loaded.config.defaults.pageSize,
          verified.section.limit ?? loaded.config.defaults.pageSize,
        ),
        after: source.endCursor,
        options: { ...this.options.transport, host: verified.auth.host, signal: controller.signal },
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
    const items = mergeIssueItems(current.items, additions)
    const dataErrors = current.dataErrors || pages.some((page) => page?.partial)
    const hasNextPage = sources.some((source) => source.hasNextPage)
    const next: IssueCacheEntry = {
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
      pageDepth: current.pageDepth + 1,
    }
    this.remember(key, next)
    return publicCacheEntry(next, false)
  }

  async refreshSections(
    root: string,
    sectionIds: readonly string[],
    activeSectionId: string | undefined,
    queryOverride: string | null,
    refreshAccountScope = true,
  ): Promise<IssueSessionResult> {
    let activeResult: IssueSessionResult | null = null
    const sectionDepths = new Map(
      sectionIds.map((sectionId) => [
        sectionId,
        cachedSectionPageDepth(this.cache.values(), root, sectionId, null),
      ]),
    )
    const overrideDepth = queryOverride
      ? cachedSectionPageDepth(this.cache.values(), root, activeSectionId, queryOverride)
      : 1
    for (const [index, sectionId] of sectionIds.entries()) {
      let result = await this.loadSection(
        root,
        sectionId,
        null,
        true,
        refreshAccountScope && index === 0,
      )
      for (
        let page = 1;
        page < (sectionDepths.get(sectionId) ?? 1) &&
        result.status === "ready" &&
        result.hasNextPage;
        page += 1
      ) {
        result = await this.loadNextPage(root, sectionId, null)
      }
      if (sectionId === activeSectionId) activeResult = result
    }
    if (queryOverride) {
      let result = await this.loadSection(root, activeSectionId, queryOverride, true, false)
      for (
        let page = 1;
        page < overrideDepth && result.status === "ready" && result.hasNextPage;
        page += 1
      ) {
        result = await this.loadNextPage(root, activeSectionId, queryOverride)
      }
      return result
    }
    return (
      activeResult ??
      this.loadSection(
        root,
        activeSectionId,
        null,
        true,
        refreshAccountScope && sectionIds.length === 0,
      )
    )
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
