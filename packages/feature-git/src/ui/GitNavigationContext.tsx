import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { GitWorkspaceTab } from "../model/workspace"

type RemoteTab = Exclude<GitWorkspaceTab, "base">
export type GitHubNavigationIdentity = { host: string; viewerLogin: string }
type Entry = { revision: number; identity: GitHubNavigationIdentity | null }
type NavigationState = { last: RemoteTab; entries: Partial<Record<RemoteTab, Entry>> }
type Report = (tab: RemoteTab, entry: Entry) => void
type DashboardIdentityState = {
  status: string
  auth?: GitHubNavigationIdentity
  host?: string
  viewerLogin?: string
}
const StateContext = createContext<NavigationState>({ last: "pr", entries: {} })
const ReportContext = createContext<Report>(() => undefined)

export function GitNavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>({ last: "pr", entries: {} })
  const report = useCallback<Report>((tab, entry) => {
    setState((current) => {
      const previous = current.entries[tab]
      if (
        current.last === tab &&
        previous?.revision === entry.revision &&
        previous.identity?.host === entry.identity?.host &&
        previous.identity?.viewerLogin === entry.identity?.viewerLogin
      )
        return current
      return { last: tab, entries: { ...current.entries, [tab]: entry } }
    })
  }, [])
  return (
    <ReportContext.Provider value={report}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ReportContext.Provider>
  )
}

export function useGitHubNavigationIdentity(tab: GitWorkspaceTab, revision: number) {
  const state = useContext(StateContext)
  const entry = state.entries[tab === "base" ? state.last : tab]
  return entry?.revision === revision ? entry.identity : null
}

/** Publish existing dashboard identity without starting another GitHub request. */
export function useGitHubNavigationReport(
  tab: RemoteTab,
  active: boolean,
  state: DashboardIdentityState,
  revision: number,
) {
  const report = useContext(ReportContext)
  const previousRevision = useRef(revision)
  const invalidatedState = useRef<DashboardIdentityState | null>(null)
  const host = state.status === "demo" ? "github.com" : (state.auth?.host ?? state.host)
  const viewerLogin =
    state.status === "demo" ? "demo" : (state.auth?.viewerLogin ?? state.viewerLogin)
  useEffect(() => {
    if (previousRevision.current !== revision) invalidatedState.current = state
    previousRevision.current = revision
    // Inactive dashboards retain old data until reactivated after a config change.
    if (invalidatedState.current === state && state.status !== "demo") return
    invalidatedState.current = null
    if (!active || state.status === "idle" || state.status === "loading") return
    report(tab, {
      revision,
      identity:
        (state.status === "ready" || state.status === "demo") && host && viewerLogin
          ? { host, viewerLogin }
          : null,
    })
  }, [active, host, report, revision, state, tab, viewerLogin])
}
