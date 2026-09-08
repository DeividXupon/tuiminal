export { GitViewer } from "./GitFeatureWorkspace"
export { GIT_TUTORIAL_STEPS } from "./tutorial/steps"
export { gitKeyboardScope } from "./keyboard"
import { disposeIssueResources } from "./services/issue-session"
import { disposePullRequestResources } from "./services/pr-session"

export async function disposeGitResources() {
  await Promise.all([disposePullRequestResources(), disposeIssueResources()])
}
