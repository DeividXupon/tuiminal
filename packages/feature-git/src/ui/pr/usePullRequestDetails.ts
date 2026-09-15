import { demoPullRequestDetails } from "../../model/pr/detail-fixtures"
import type {
  PullRequestDetails,
  PullRequestPreviewTab,
  PullRequestSummary,
} from "../../model/pr/types"
import { PullRequestDetailsSession } from "../../services/pr-details-session"
import { useGitRemoteDetails, type GitRemoteDetailsState } from "../shared/useGitRemoteDetails"

export type PullRequestDetailsState = GitRemoteDetailsState<PullRequestDetails>

export function usePullRequestDetails(active: boolean, item: PullRequestSummary | null) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return useGitRemoteDetails<PullRequestSummary, PullRequestDetails, [PullRequestPreviewTab]>({
    active,
    item,
    demo: process.env.TUIMINAL_GIT_PR_DEMO === "1",
    demoDetails: demoPullRequestDetails,
    createSession: () => new PullRequestDetailsSession(executable ? { executable } : {}),
  })
}
