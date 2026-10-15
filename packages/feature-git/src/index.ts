export { GitViewer } from "./GitFeatureWorkspace"
export { GIT_TUTORIAL_STEPS } from "./tutorial/steps"
export { gitKeyboardScope } from "./keyboard"
export { GitConfigurationView } from "./ui/config/GitConfigurationView"
export type { GitConfigurationTab } from "./model/git-configuration"
import { disposeIssueResources } from "./services/issue-session"
import { disposePullRequestResources } from "./services/pr-session"
import { disposeInboxResources } from "./services/inbox-session"
import { disposeGitBrowserResources } from "./services/browser"

export async function disposeGitResources() {
  const results = await Promise.allSettled([
    disposePullRequestResources(),
    disposeIssueResources(),
    disposeInboxResources(),
    disposeGitBrowserResources(),
  ])
  const failure = results.find((result) => result.status === "rejected")
  if (failure?.status === "rejected") throw failure.reason
}
