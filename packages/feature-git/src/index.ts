export { GitViewer } from "./GitFeatureWorkspace"
export { GIT_TUTORIAL_STEPS } from "./tutorial/steps"
export { gitKeyboardScope } from "./keyboard"
export { GitConfigurationModal } from "./ui/config/GitConfigurationModal"
export type { GitConfigurationTab } from "./model/git-configuration"
import { disposeIssueResources } from "./services/issue-session"
import { disposePullRequestResources } from "./services/pr-session"
import { disposeInboxResources } from "./services/inbox-session"

export async function disposeGitResources() {
  await Promise.all([
    disposePullRequestResources(),
    disposeIssueResources(),
    disposeInboxResources(),
  ])
}
