import { useEffect, useState } from "react"
import { getLanguage } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalMasterKey } from "@xupon/tuiminal-core/settings/theme"
import {
  requestPinnedTerminalTarget,
  setTerminalSidebarPinned,
  setTmuxHostSidebar,
  terminalSidebarReplica,
} from "../model/pinned-sidebar"
import { openPinnedSidebarControl } from "../services/pinned-sidebar-control"
import {
  hasInheritedTmux,
  pinnedTmuxSidebarsEnabled,
  reconcilePinnedTmuxSidebars,
  removePinnedTmuxSidebars,
} from "../services/pinned-sidebar-tmux"

async function syncPinnedTmuxSidebars(
  pinned: boolean,
  endpoint: string,
  width: number,
  masterKey: TerminalMasterKey,
  signal: AbortSignal,
) {
  if (pinned) return Boolean(await reconcilePinnedTmuxSidebars(endpoint, width, signal, masterKey))
  await removePinnedTmuxSidebars(signal)
  return false
}

export function usePinnedTmuxSidebars(
  pinned: boolean,
  width: number,
  masterKey: TerminalMasterKey,
) {
  const [control, setControl] = useState<{ endpoint: string; ready: boolean } | null>(null)
  useEffect(() => {
    if (process.env.TUIMINAL_TERMINAL_PINNED_TMUX === "0" || !hasInheritedTmux()) return
    let disposed = false
    let close: (() => Promise<void>) | undefined
    const start = async () => {
      const opened = await openPinnedSidebarControl(requestPinnedTerminalTarget, () =>
        terminalSidebarReplica(Object.fromEntries(Object.entries(COLORS)), getLanguage()),
      )
      if (!opened || disposed) {
        await opened?.close()
        return
      }
      close = opened.close
      const enabled = await pinnedTmuxSidebarsEnabled()
      if (disposed) return
      if (enabled) setTerminalSidebarPinned(true)
      setControl({ endpoint: opened.endpoint, ready: true })
    }
    void start().catch(() => {
      if (!disposed) setControl(null)
    })
    return () => {
      disposed = true
      void close?.()
    }
  }, [])

  useEffect(() => {
    if (!control?.ready) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = async () => {
      try {
        const hostReady = await syncPinnedTmuxSidebars(
          pinned,
          control.endpoint,
          width,
          masterKey,
          controller.signal,
        )
        if (!controller.signal.aborted) setTmuxHostSidebar(hostReady)
      } catch {
        // A closed server/window must not affect the in-app sidebar.
        if (!controller.signal.aborted) setTmuxHostSidebar(false)
      } finally {
        if (pinned && !controller.signal.aborted) timer = setTimeout(() => void sync(), 2000)
      }
    }
    void sync()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [control, masterKey, pinned, width])
}
