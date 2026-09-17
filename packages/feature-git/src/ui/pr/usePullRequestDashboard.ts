import { PullRequestSession, type PullRequestSessionResult } from "../../services/pr-session"
import {
  gitDashboardTransportFromEnvironment,
  type GitRemoteDashboardState,
  useGitRemoteDashboard,
} from "../shared/useGitRemoteDashboard"

export type PullRequestDashboardState = GitRemoteDashboardState<PullRequestSessionResult>

export function usePullRequestDashboard(
  active: boolean,
  sectionId: string | undefined,
  queryOverride: string | null = null,
  configurationRevision = 0,
) {
  return useGitRemoteDashboard<PullRequestSessionResult>({
    active,
    sectionId,
    queryOverride,
    configurationRevision,
    demo: process.env.TUIMINAL_GIT_PR_DEMO === "1",
    source: "Git · PR",
    createSession: () =>
      new PullRequestSession({ transport: gitDashboardTransportFromEnvironment() }),
  })
}
