import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { nextPullRequestDetailConnection } from "../../model/pr/detail-pagination"
import type { Dispatch, SetStateAction } from "react"
import {
  adjacentPreviewTab,
  movePullRequestIndex,
  type PullRequestFocus,
  type PullRequestWorkspaceAction,
} from "../../model/pr/navigation"
import type { PullRequestDiffTarget } from "../../model/pr/diff"
import type {
  PullRequestDetails,
  PullRequestIdentity,
  PullRequestPreviewTab,
  PullRequestSummary,
} from "../../model/pr/types"
import {
  openPullRequestInBrowser,
  openWorkflowRunInBrowser,
} from "../../services/github/read-actions"
import type { PullRequestDashboardState } from "./usePullRequestDashboard"
import type { PullRequestDetailsState } from "./usePullRequestDetails"

const DEMO_AUTH = {
  host: "github.com",
  viewerId: "demo-viewer",
  viewerLogin: "deivid",
  generation: 1,
}

export function emptyPullRequestPreviewPositions(): Record<PullRequestPreviewTab, number> {
  return { overview: 0, checks: 0, activity: 0, commits: 0, files: 0 }
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

export function executePullRequestReadAction(
  action: PullRequestWorkspaceAction | null,
  selected: PullRequestSummary | null,
  previewTab: PullRequestPreviewTab,
  setPreviewOffsets: Dispatch<SetStateAction<Record<PullRequestPreviewTab, number>>>,
  setDescriptionExpanded: Dispatch<SetStateAction<boolean>>,
  copy: (value: string, success: string) => void,
  setNotice: (message: string) => void,
) {
  if (!action || !selected) return false
  if (action.type === "scroll-preview") {
    setPreviewOffsets((current) => ({
      ...current,
      [previewTab]: Math.max(0, current[previewTab] + action.delta),
    }))
    return true
  }
  if (action.type === "toggle-description") {
    setDescriptionExpanded((current) => !current)
    return true
  }
  if (action.type === "copy-url") copy(selected.identity.url, translateUi("URL do PR copiada."))
  else if (action.type === "copy-number") {
    copy(String(selected.identity.number), translateUi("Número do PR copiado."))
  } else if (action.type === "copy-sha") copy(selected.headSha, translateUi("SHA copiado."))
  else if (action.type === "open-browser") openPullRequestWithNotice(selected.identity, setNotice)
  else return false
  return true
}

export function executePullRequestNavigation(
  action: PullRequestWorkspaceAction | null,
  context: {
    sectionIndex: number
    sectionCount: number
    selectedIndex: number
    itemCount: number
    selectSection: (index: number) => void
    selectRow: (index: number) => void
    setPreviewVisible: Dispatch<SetStateAction<boolean>>
    setFocus: Dispatch<SetStateAction<PullRequestFocus>>
    setPreviewTab: Dispatch<SetStateAction<PullRequestPreviewTab>>
  },
) {
  if (!action) return
  if (action.type === "move-section") {
    context.selectSection(
      (context.sectionIndex + action.delta + context.sectionCount) % context.sectionCount,
    )
  } else if (action.type === "move-row") {
    context.selectRow(movePullRequestIndex(context.selectedIndex, context.itemCount, action.delta))
  } else if (action.type === "select-edge") {
    context.selectRow(action.target === "first" ? 0 : Math.max(0, context.itemCount - 1))
  } else if (action.type === "focus") {
    if (action.target === "preview") context.setPreviewVisible(true)
    context.setFocus(action.target)
  } else if (action.type === "move-preview-tab") {
    context.setPreviewTab((current) => adjacentPreviewTab(current, action.delta))
  }
}

export function pullRequestKeyboardGuards(
  modalOpen: boolean,
  diffOpen: boolean,
  dashboard: PullRequestDashboardState,
  details: PullRequestDetailsState,
  previewTab: PullRequestPreviewTab,
) {
  return {
    blocked:
      modalOpen ||
      diffOpen ||
      dashboard.status === "requirements" ||
      dashboard.status === "authentication",
    canLoadMore: dashboard.status === "ready" && dashboard.hasNextPage,
    canLoadPreview:
      details.status === "ready" &&
      Boolean(nextPullRequestDetailConnection(details.details, previewTab)),
    details: details.status === "ready" ? details.details : null,
  }
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
) {
  setNotice(translateUi("Abrindo PR no navegador…"))
  void openPullRequestInBrowser(identity, browserOptions())
    .then(() => setNotice(translateUi("PR aberto no navegador.")))
    .catch((error) => setNotice(pullRequestMutationError(error)))
}

export function openWorkflowWithNotice(
  identity: PullRequestIdentity,
  runId: number,
  setNotice: (notice: string) => void,
) {
  setNotice(translateUi("Abrindo execução no navegador…"))
  void openWorkflowRunInBrowser(identity, runId, browserOptions())
    .then(() => setNotice(translateUi("Execução aberta no navegador.")))
    .catch((error) => setNotice(pullRequestMutationError(error)))
}
