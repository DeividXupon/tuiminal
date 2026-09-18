import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { PullRequestDiffTarget } from "../../model/pr/diff"
import type {
  PullRequestDetails,
  PullRequestIdentity,
  PullRequestPreviewTab,
} from "../../model/pr/types"
import {
  openPullRequestInBrowser,
  openWorkflowRunInBrowser,
} from "../../services/github/read-actions"
import type { PullRequestDashboardState } from "./usePullRequestDashboard"
import type { GitBrowserOpener } from "../browser/useGitBrowser"

const DEMO_AUTH = {
  host: "github.com",
  viewerId: "demo-viewer",
  viewerLogin: "deivid",
  generation: 1,
}

export function pullRequestMutationError(error: unknown) {
  return error instanceof Error
    ? error.message
    : translateUi("Não foi possível salvar a configuração.")
}

export function diffTargetForPreview(
  tab: PullRequestPreviewTab,
  details: PullRequestDetails,
  itemIndex = 0,
): PullRequestDiffTarget {
  const file = details.files[itemIndex]
  const commit = details.commits[itemIndex]
  if (tab === "files" && file) return { kind: "file", path: file.path }
  if (tab === "commits" && commit) return { kind: "commit", sha: commit.sha }
  return { kind: "pr" }
}

export function dashboardAuth(dashboard: PullRequestDashboardState) {
  if (dashboard.status === "ready") return dashboard.auth
  return dashboard.status === "demo" ? DEMO_AUTH : null
}

export function dashboardProfileTarget(dashboard: PullRequestDashboardState) {
  if (dashboard.status !== "ready") return null
  return { root: dashboard.root, profile: dashboard.profile }
}

function browserOptions() {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

export function openPullRequestWithNotice(
  identity: PullRequestIdentity,
  setNotice: (notice: string) => void,
  openBrowser: GitBrowserOpener,
) {
  setNotice(translateUi("Abrindo PR no navegador…"))
  void openBrowser(identity.url, identity.host, () =>
    openPullRequestInBrowser(identity, browserOptions()),
  )
    .then(() => setNotice(translateUi("PR aberto no navegador.")))
    .catch((error) => setNotice(pullRequestMutationError(error)))
}

export function openWorkflowWithNotice(
  identity: PullRequestIdentity,
  runId: number,
  setNotice: (notice: string) => void,
  openBrowser: GitBrowserOpener,
) {
  setNotice(translateUi("Abrindo execução no navegador…"))
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    setNotice(translateUi("Identificador da execução inválido."))
    return
  }
  void Promise.resolve()
    .then(() => {
      const url = new URL(identity.url)
      url.pathname = `/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repository)}/actions/runs/${runId}`
      url.search = ""
      url.hash = ""
      return openBrowser(url.href, identity.host, () =>
        openWorkflowRunInBrowser(identity, runId, browserOptions()),
      )
    })
    .then(() => setNotice(translateUi("Execução aberta no navegador.")))
    .catch((error) => setNotice(pullRequestMutationError(error)))
}
