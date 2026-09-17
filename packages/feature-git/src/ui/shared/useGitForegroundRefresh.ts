import { useEffect, useRef } from "react"

export const FOREGROUND_REFRESH_MS = 30_000

export function useGitForegroundRefresh({
  active,
  sectionKey,
  dashboard,
  refreshList,
  refreshDetails,
  intervalMs = FOREGROUND_REFRESH_MS,
}: {
  active: boolean
  sectionKey: string
  dashboard: { status: string; cachedAt?: number }
  refreshList: () => Promise<void>
  refreshDetails: () => Promise<void>
  intervalMs?: number
}) {
  const callbacks = useRef({ refreshList, refreshDetails })
  callbacks.current = { refreshList, refreshDetails }
  const dashboardRef = useRef(dashboard)
  dashboardRef.current = dashboard
  const ready = dashboard.status === "ready" && dashboard.cachedAt !== undefined
  const refreshScope = active && ready ? sectionKey : null

  useEffect(() => {
    if (!refreshScope) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      void callbacks.current.refreshList()
      void callbacks.current.refreshDetails()
      timer = setTimeout(tick, intervalMs)
    }
    timer = setTimeout(
      tick,
      Math.max(0, intervalMs - (Date.now() - (dashboardRef.current.cachedAt ?? Date.now()))),
    )
    return () => clearTimeout(timer)
  }, [intervalMs, refreshScope])
}
