import { getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import {
  codexResumeThreadsSnapshot,
  subscribeCodexResumeThreads,
} from "../model/codex-resume-threads"
import {
  refreshCodexResumeThreads,
  refreshRemoteCodexResumeThreads,
} from "../services/codex-app-server"
import { FREE_TERMINAL_WORKING_DIRECTORY } from "../services/terminal"

export function useCodexResumeThreads(active: boolean) {
  const remoteRefresh = useRef<{
    signature: string
    startedAt: number
    controller: AbortController
  } | null>(null)
  const recentThreads = useSyncExternalStore(
    subscribeCodexResumeThreads,
    codexResumeThreadsSnapshot,
    codexResumeThreadsSnapshot,
  )
  const refreshRemoteThreads = useCallback(() => {
    if (process.env.TUIMINAL_TERMINAL_CODEX_RESUME === "0") return
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
    void refreshRemoteCodexResumeThreads(profile, controller.signal).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!active || process.env.TUIMINAL_TERMINAL_CODEX_RESUME === "0") return
    const controller = new AbortController()
    void refreshCodexResumeThreads(FREE_TERMINAL_WORKING_DIRECTORY, controller.signal).catch(
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
