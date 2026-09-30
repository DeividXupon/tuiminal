import { getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { AgentResumeThread } from "../model/agent-resume-thread"
import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "../model/codex-resume-threads"
import {
  openCodeResumeThreadsSnapshot,
  subscribeOpenCodeResumeThreads,
} from "../model/opencode-resume-threads"
import {
  refreshCodexResumeThreads,
  refreshRemoteCodexResumeThreads,
} from "../services/codex-app-server"
import {
  refreshOpenCodeResumeThreads,
  refreshRemoteOpenCodeResumeThreads,
} from "../services/opencode-server"
import { FREE_TERMINAL_WORKING_DIRECTORY } from "../services/terminal"

export function useAgentResumeThreads(active: boolean) {
  const remoteRefresh = useRef<{
    signature: string
    startedAt: number
    controller: AbortController
  } | null>(null)
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
  const recentThreads = useMemo(
    () =>
      [
        ...codex.map((thread) => ({ ...thread, providerId: "codex" as const })),
        ...openCode.map((thread) => ({ ...thread, providerId: "opencode" as const })),
      ].sort(
        (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
      ) satisfies AgentResumeThread[],
    [codex, openCode],
  )
  const refreshRemoteThreads = useCallback(() => {
    const settings = getUiSettings()
    const profile = settings.terminalRemoteCodexProfiles.find(
      (candidate) => candidate.id === settings.terminalRemoteCodexActiveProfileId,
    )
    if (!profile) return
    const signature = JSON.stringify(profile)
    const current = remoteRefresh.current
    if (current?.signature === signature && Date.now() - current.startedAt < 30_000) return
    current?.controller.abort()
    const controller = new AbortController()
    remoteRefresh.current = { signature, startedAt: Date.now(), controller }
    if (process.env.TUIMINAL_TERMINAL_CODEX_RESUME !== "0")
      void refreshRemoteCodexResumeThreads(profile, controller.signal).catch(() => undefined)
    if (process.env.TUIMINAL_TERMINAL_OPENCODE_RESUME !== "0")
      void refreshRemoteOpenCodeResumeThreads(profile, controller.signal).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    if (process.env.TUIMINAL_TERMINAL_CODEX_RESUME !== "0")
      void refreshCodexResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, controller.signal).catch(
        () => undefined,
      )
    if (process.env.TUIMINAL_TERMINAL_OPENCODE_RESUME !== "0")
      void refreshOpenCodeResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, controller.signal).catch(
        () => undefined,
      )
    refreshRemoteThreads()
    return () => {
      controller.abort()
      remoteRefresh.current?.controller.abort()
      remoteRefresh.current = null
    }
  }, [active, refreshRemoteThreads])
  return { recentThreads, refreshRemoteThreads }
}
