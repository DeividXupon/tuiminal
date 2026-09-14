import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { IssueIdentity } from "../../model/issue/types"
import { openIssueInBrowser } from "../../services/github/issue-read-actions"
import type { IssueDashboardState } from "./useIssueDashboard"

const DEMO_AUTH = {
  host: "github.com",
  viewerId: "demo-viewer",
  viewerLogin: "deivid",
  generation: 1,
}

export function issueDashboardAuth(dashboard: IssueDashboardState) {
  if (dashboard.status === "ready") return dashboard.auth
  return dashboard.status === "demo" ? DEMO_AUTH : null
}

export function issueDashboardProfileTarget(dashboard: IssueDashboardState) {
  if (dashboard.status !== "ready") return null
  return { root: dashboard.root, profile: dashboard.profile }
}

export function issueError(error: unknown) {
  return error instanceof Error ? error.message : translateUi("A ação falhou")
}

export function openIssueWithNotice(identity: IssueIdentity, setNotice: (notice: string) => void) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  setNotice(translateUi("Abrindo issue no navegador…"))
  void openIssueInBrowser(identity, executable ? { executable } : {})
    .then(() => setNotice(translateUi("Issue aberta no navegador.")))
    .catch((error) => setNotice(issueError(error)))
}
