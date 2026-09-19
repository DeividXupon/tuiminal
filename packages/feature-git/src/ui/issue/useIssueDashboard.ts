import { IssueSession, type IssueSessionResult } from "../../services/issue-session"
import {
  gitDashboardTransportFromEnvironment,
  type GitRemoteDashboardState,
  useGitRemoteDashboard,
} from "../shared/useGitRemoteDashboard"

export type IssueDashboardState = GitRemoteDashboardState<IssueSessionResult>

export function useIssueDashboard(
  active: boolean,
  sectionId: string | undefined,
  queryOverride: string | null = null,
  configurationRevision = 0,
) {
  return useGitRemoteDashboard<IssueSessionResult>({
    active,
    sectionId,
    queryOverride,
    configurationRevision,
    demo: process.env.TUIMINAL_GIT_ISSUES_DEMO === "1",
    source: "Git · Issues",
    createSession: () => new IssueSession({ transport: gitDashboardTransportFromEnvironment() }),
  })
}
