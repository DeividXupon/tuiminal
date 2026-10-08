import { getUiSettings, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { AgentProviderId } from "../model/agent-provider"
import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  type AgentResumePaginationState,
  type AgentResumeThread,
  compareAgentResumeThreads,
} from "../model/agent-resume-thread"
import {
  claudeResumeThreadsSnapshot,
  subscribeClaudeResumeThreads,
} from "../model/claude-resume-threads"
import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "../model/codex-resume-threads"
import {
  openCodeResumeThreadsSnapshot,
  subscribeOpenCodeResumeThreads,
} from "../model/opencode-resume-threads"
import { loadRemoteClaudeResumeThreadsPage } from "../services/claude-background"
import { loadClaudeResumeThreadsPage } from "../services/claude-resume-store"
import {
  loadCodexResumeThreadsPage,
  loadRemoteCodexResumeThreadsPage,
} from "../services/codex-app-server"
import {
  loadOpenCodeResumeThreadsPage,
  loadRemoteOpenCodeResumeThreadsPage,
} from "../services/opencode-server"
import { TERM_AGENTS_WORKING_DIRECTORY } from "../services/terminal"

const PROVIDERS: readonly AgentProviderId[] = ["codex", "claude", "opencode"]
type Origin = "local" | "remote"
type SourceKey = `${AgentProviderId}:${Origin}`
type SourcePage = { cursor: string | null; hasMore: boolean }
type SourcePages = Record<SourceKey, SourcePage>
type UpdateSource = (key: SourceKey, next: Partial<SourcePage>) => void

function initialLimits() {
  return {
    codex: AGENT_RESUME_PAGE_SIZE,
    claude: AGENT_RESUME_PAGE_SIZE,
    opencode: AGENT_RESUME_PAGE_SIZE,
  }
}

function initialSources(): SourcePages {
  return {
    "codex:local": { cursor: null, hasMore: true },
    "codex:remote": { cursor: null, hasMore: true },
    "claude:local": { cursor: null, hasMore: true },
    "claude:remote": { cursor: null, hasMore: true },
    "opencode:local": { cursor: null, hasMore: true },
    "opencode:remote": { cursor: null, hasMore: true },
  }
}

function codexLoadMoreTasks(
  pages: SourcePages,
  profile: TerminalRemoteCodexProfile | undefined,
  signal: AbortSignal,
  update: UpdateSource,
) {
  const tasks: Promise<void>[] = []
  const local = pages["codex:local"]
  if (local.hasMore)
    tasks.push(
      loadCodexResumeThreadsPage(TERM_AGENTS_WORKING_DIRECTORY, signal, {
        append: true,
        cursor: local.cursor,
      }).then((page) => update("codex:local", { cursor: page.nextCursor, hasMore: page.hasMore })),
    )
  const remote = pages["codex:remote"]
  if (profile && remote.hasMore)
    tasks.push(
      loadRemoteCodexResumeThreadsPage(profile, signal, {
        append: true,
        cursor: remote.cursor,
      }).then((page) => update("codex:remote", { cursor: page.nextCursor, hasMore: page.hasMore })),
    )
  return tasks
}

function openCodeLoadMoreTasks(
  pages: SourcePages,
  profile: TerminalRemoteCodexProfile | undefined,
  signal: AbortSignal,
  target: number,
  update: UpdateSource,
) {
  const tasks: Promise<void>[] = []
  if (pages["opencode:local"].hasMore)
    tasks.push(
      loadOpenCodeResumeThreadsPage(TERM_AGENTS_WORKING_DIRECTORY, signal, target).then((page) =>
        update("opencode:local", { hasMore: page.hasMore }),
      ),
    )
  if (profile && pages["opencode:remote"].hasMore)
    tasks.push(
      loadRemoteOpenCodeResumeThreadsPage(profile, signal, target).then((page) =>
        update("opencode:remote", { hasMore: page.hasMore }),
      ),
    )
  return tasks
}

function claudeLoadMoreTasks(
  pages: SourcePages,
  profile: TerminalRemoteCodexProfile | undefined,
  signal: AbortSignal,
  target: number,
  update: UpdateSource,
) {
  const tasks: Promise<void>[] = []
  if (pages["claude:local"].hasMore)
    tasks.push(
      Promise.resolve(loadClaudeResumeThreadsPage(target)).then((page) =>
        update("claude:local", { hasMore: page.hasMore }),
      ),
    )
  if (profile && pages["claude:remote"].hasMore)
    tasks.push(
      loadRemoteClaudeResumeThreadsPage(profile, signal, target).then((page) =>
        update("claude:remote", { hasMore: page.hasMore }),
      ),
    )
  return tasks
}

function enabled(providerId: AgentProviderId) {
  if (providerId === "codex") return process.env.TUIMINAL_TERMINAL_CODEX_RESUME !== "0"
  if (providerId === "opencode") return process.env.TUIMINAL_TERMINAL_OPENCODE_RESUME !== "0"
  return process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME !== "0"
}

export function useAgentResumeThreads(active: boolean) {
  const settings = getUiSettings()
  const configuredRemoteProfile = settings.terminalRemoteCodexProfiles.find(
    (candidate) => candidate.id === settings.terminalRemoteCodexActiveProfileId,
  )
  const remoteSignature = configuredRemoteProfile ? JSON.stringify(configuredRemoteProfile) : ""
  const stableRemoteProfile = useRef<{
    signature: string
    profile: TerminalRemoteCodexProfile | undefined
  }>({ signature: remoteSignature, profile: configuredRemoteProfile })
  if (stableRemoteProfile.current.signature !== remoteSignature)
    stableRemoteProfile.current = { signature: remoteSignature, profile: configuredRemoteProfile }
  const activeRemoteProfile = stableRemoteProfile.current.profile
  const activeRemoteProfileId = activeRemoteProfile?.id
  const remoteRefresh = useRef<{
    signature: string
    startedAt: number
    controller: AbortController
  } | null>(null)
  const loadMoreControllers = useRef(new Map<AgentProviderId, AbortController>())
  const sources = useRef(initialSources())
  const [sourceRevision, setSourceRevision] = useState(0)
  const [limits, setLimits] = useState(initialLimits)
  const [initialLoadingSources, setInitialLoadingSources] = useState<
    ReadonlySet<{ providerId: AgentProviderId }>
  >(new Set())
  const [loadingMore, setLoadingMore] = useState<ReadonlySet<AgentProviderId>>(new Set())
  const codex = useSyncExternalStore(
    subscribeCodexResumeThreads,
    codexResumeThreadsSnapshot,
    codexResumeThreadsSnapshot,
  )
  const openCode = useSyncExternalStore(
    subscribeOpenCodeResumeThreads,
    openCodeResumeThreadsSnapshot,
    openCodeResumeThreadsSnapshot,
  )
  const claude = useSyncExternalStore(
    subscribeClaudeResumeThreads,
    claudeResumeThreadsSnapshot,
    claudeResumeThreadsSnapshot,
  )

  const updateSource = useCallback((key: SourceKey, next: Partial<SourcePage>) => {
    sources.current[key] = { ...sources.current[key], ...next }
    setSourceRevision((current) => current + 1)
  }, [])
  const trackInitial = useCallback(
    async (providerId: AgentProviderId, task: () => Promise<void>) => {
      const token = { providerId }
      setInitialLoadingSources((current) => new Set(current).add(token))
      try {
        await task()
      } finally {
        setInitialLoadingSources((current) => {
          const next = new Set(current)
          next.delete(token)
          return next
        })
      }
    },
    [],
  )

  const refreshRemoteThreads = useCallback(() => {
    const profile = activeRemoteProfile
    if (!profile) {
      remoteRefresh.current?.controller.abort()
      remoteRefresh.current = null
      for (const providerId of PROVIDERS)
        updateSource(`${providerId}:remote`, { cursor: null, hasMore: false })
      return
    }
    const current = remoteRefresh.current
    if (current?.signature === remoteSignature && Date.now() - current.startedAt < 30_000) return
    current?.controller.abort()
    const controller = new AbortController()
    remoteRefresh.current = { signature: remoteSignature, startedAt: Date.now(), controller }
    const updateRemote = (key: SourceKey, next: Partial<SourcePage>) => {
      if (remoteRefresh.current?.controller === controller && !controller.signal.aborted)
        updateSource(key, next)
    }
    if (enabled("codex"))
      void trackInitial("codex", async () => {
        const page = await loadRemoteCodexResumeThreadsPage(profile, controller.signal)
        updateRemote("codex:remote", { cursor: page.nextCursor, hasMore: page.hasMore })
      }).catch(() => updateRemote("codex:remote", { hasMore: false }))
    else updateSource("codex:remote", { hasMore: false })
    if (enabled("opencode"))
      void trackInitial("opencode", async () => {
        const page = await loadRemoteOpenCodeResumeThreadsPage(profile, controller.signal)
        updateRemote("opencode:remote", { hasMore: page.hasMore })
      }).catch(() => updateRemote("opencode:remote", { hasMore: false }))
    else updateSource("opencode:remote", { hasMore: false })
    if (enabled("claude"))
      void trackInitial("claude", async () => {
        const page = await loadRemoteClaudeResumeThreadsPage(profile, controller.signal)
        updateRemote("claude:remote", { hasMore: page.hasMore })
      }).catch(() => updateRemote("claude:remote", { hasMore: false }))
    else updateSource("claude:remote", { hasMore: false })
  }, [activeRemoteProfile, remoteSignature, trackInitial, updateSource])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const updateLocal = (key: SourceKey, next: Partial<SourcePage>) => {
      if (!controller.signal.aborted) updateSource(key, next)
    }
    sources.current = initialSources()
    setLimits(initialLimits())
    setSourceRevision((current) => current + 1)
    if (enabled("codex"))
      void trackInitial("codex", async () => {
        const page = await loadCodexResumeThreadsPage(
          TERM_AGENTS_WORKING_DIRECTORY,
          controller.signal,
        )
        updateLocal("codex:local", { cursor: page.nextCursor, hasMore: page.hasMore })
      }).catch(() => updateLocal("codex:local", { hasMore: false }))
    else updateLocal("codex:local", { hasMore: false })
    if (enabled("opencode"))
      void trackInitial("opencode", async () => {
        const page = await loadOpenCodeResumeThreadsPage(
          TERM_AGENTS_WORKING_DIRECTORY,
          controller.signal,
        )
        updateLocal("opencode:local", { hasMore: page.hasMore })
      }).catch(() => updateLocal("opencode:local", { hasMore: false }))
    else updateLocal("opencode:local", { hasMore: false })
    if (enabled("claude")) {
      const page = loadClaudeResumeThreadsPage()
      updateLocal("claude:local", { hasMore: page.hasMore })
    } else updateLocal("claude:local", { hasMore: false })
    return () => {
      controller.abort()
      for (const pageController of loadMoreControllers.current.values()) pageController.abort()
      loadMoreControllers.current.clear()
    }
  }, [active, trackInitial, updateSource])

  useEffect(() => {
    if (!active) return
    refreshRemoteThreads()
    return () => {
      remoteRefresh.current?.controller.abort()
      remoteRefresh.current = null
    }
  }, [active, refreshRemoteThreads])

  const recentThreads = useMemo(
    () =>
      [
        ...codex.map((thread) => ({ ...thread, providerId: "codex" as const })),
        ...claude.map((thread) => ({ ...thread, providerId: "claude" as const })),
        ...openCode.map((thread) => ({ ...thread, providerId: "opencode" as const })),
      ]
        .filter(
          (thread) =>
            thread.remoteProfileId === undefined ||
            thread.remoteProfileId === activeRemoteProfileId,
        )
        .sort(compareAgentResumeThreads) satisfies AgentResumeThread[],
    [activeRemoteProfileId, claude, codex, openCode],
  )

  const hasMore = useMemo(() => {
    void sourceRevision
    const result = { codex: false, claude: false, opencode: false }
    for (const providerId of PROVIDERS) {
      if (!enabled(providerId) || limits[providerId] >= AGENT_RESUME_SOURCE_LIMIT) continue
      result[providerId] =
        sources.current[`${providerId}:local`].hasMore ||
        Boolean(activeRemoteProfileId && sources.current[`${providerId}:remote`].hasMore)
    }
    return result
  }, [activeRemoteProfileId, limits, sourceRevision])

  const loadMoreThreads = useCallback(
    async (providerId: AgentProviderId) => {
      if (
        [...initialLoadingSources].some((source) => source.providerId === providerId) ||
        loadingMore.has(providerId) ||
        loadMoreControllers.current.has(providerId) ||
        limits[providerId] >= AGENT_RESUME_SOURCE_LIMIT
      )
        return
      const target = Math.min(
        AGENT_RESUME_SOURCE_LIMIT,
        limits[providerId] + AGENT_RESUME_PAGE_SIZE,
      )
      const controller = new AbortController()
      loadMoreControllers.current.set(providerId, controller)
      setLoadingMore((current) => new Set(current).add(providerId))
      try {
        const tasks =
          providerId === "codex"
            ? codexLoadMoreTasks(
                sources.current,
                activeRemoteProfile,
                controller.signal,
                updateSource,
              )
            : providerId === "opencode"
              ? openCodeLoadMoreTasks(
                  sources.current,
                  activeRemoteProfile,
                  controller.signal,
                  target,
                  updateSource,
                )
              : claudeLoadMoreTasks(
                  sources.current,
                  activeRemoteProfile,
                  controller.signal,
                  target,
                  updateSource,
                )
        const results = await Promise.allSettled(tasks)
        if (!controller.signal.aborted && results.some(({ status }) => status === "fulfilled"))
          setLimits((current) => ({ ...current, [providerId]: target }))
      } finally {
        if (loadMoreControllers.current.get(providerId) === controller)
          loadMoreControllers.current.delete(providerId)
        setLoadingMore((current) => {
          const next = new Set(current)
          next.delete(providerId)
          return next
        })
      }
    },
    [activeRemoteProfile, initialLoadingSources, limits, loadingMore, updateSource],
  )

  const loadingInitial = initialLoadingSources.size > 0
  const loadingInitialProviders = useMemo(
    () => [...new Set([...initialLoadingSources].map(({ providerId }) => providerId))],
    [initialLoadingSources],
  )
  const pagination = useMemo<AgentResumePaginationState>(
    () => ({
      limits,
      hasMore,
      loadingInitial,
      loadingInitialProviders,
      loadingMore: [...loadingMore],
    }),
    [hasMore, limits, loadingInitial, loadingInitialProviders, loadingMore],
  )
  return {
    recentThreads,
    activeRemoteProfileId,
    pagination,
    loadMoreThreads,
    refreshRemoteThreads,
  }
}
