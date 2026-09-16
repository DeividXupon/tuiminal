import { demoIssueDetails } from "../../model/issue/fixtures"
import type { IssueDetails, IssueSummary } from "../../model/issue/types"
import { issueIdentityKey } from "../../model/issue/query"
import { IssueDetailsSession } from "../../services/issue-details-session"
import { useGitRemoteDetails, type GitRemoteDetailsState } from "../shared/useGitRemoteDetails"

export type IssueDetailsState = GitRemoteDetailsState<IssueDetails>

export function useIssueDetails(active: boolean, item: IssueSummary | null) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return useGitRemoteDetails<IssueSummary, IssueDetails, []>({
    active,
    item,
    demo: process.env.TUIMINAL_GIT_ISSUES_DEMO === "1",
    demoDetails: demoIssueDetails,
    itemKey: (selected) => `${issueIdentityKey(selected.identity)}:${selected.updatedAt}`,
    createSession: () => new IssueDetailsSession(executable ? { executable } : {}),
  })
}
