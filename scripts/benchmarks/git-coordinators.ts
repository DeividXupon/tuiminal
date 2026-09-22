import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { defineBenchmark } from "./harness"

type GitHubIdentity = {
  host: string
  nodeId: string
  owner: string
  repository: string
  number: number
  url: string
}

export async function gitCloseCoordinatorBenchmarks({
  parent,
  fakeGh,
  root,
  prIdentity,
  issueIdentity,
}: {
  parent: string
  fakeGh: string
  root: string
  prIdentity: GitHubIdentity
  issueIdentity: GitHubIdentity
}) {
  const { preparePullRequestAction } = await import(
    "../../packages/feature-git/src/model/pr/actions"
  )
  const { prepareIssueAction } = await import("../../packages/feature-git/src/model/issue/actions")
  const { PullRequestActionCoordinator } = await import(
    "../../packages/feature-git/src/services/pr-actions"
  )
  const { IssueActionCoordinator } = await import(
    "../../packages/feature-git/src/services/issue-actions"
  )
  const auth = {
    host: "github.com",
    viewerId: "benchmark-viewer",
    viewerLogin: "benchmark",
    generation: 1,
  }
  const prAction = preparePullRequestAction({
    actionId: "benchmark-pr-close-coordinator",
    kind: "close",
    target: prIdentity,
    expectedHeadSha: "abc123",
    auth,
    payload: {},
  })
  const issueAction = prepareIssueAction({
    actionId: "benchmark-issue-close-coordinator",
    kind: "close",
    target: issueIdentity,
    expectedUpdatedAt: "2026-01-02T00:00:00Z",
    expectedState: "open",
    auth,
    payload: {},
  })
  if (prAction.status !== "prepared" || issueAction.status !== "prepared") {
    throw new Error("Git close coordinator actions were not prepared")
  }
  const prState = join(parent, "benchmark-pr-close-state")
  const issueState = join(parent, "benchmark-issue-close-state")
  const stateIs = (path: string, expected: string) =>
    existsSync(path) && readFileSync(path, "utf8") === expected

  return [
    defineBenchmark({
      id: "git.pr_close_coordinator",
      tool: "git",
      description: "Authenticate, close a PR through fake gh, and reconcile its remote state",
      beforeEach: () => rmSync(prState, { force: true }),
      run: () =>
        new PullRequestActionCoordinator({
          executable: fakeGh,
          cwd: root,
          env: { BENCHMARK_GH_ACTION_STATE: prState },
        }).execute(prAction),
      verify: (result) => {
        if (
          result.status !== "confirmed" ||
          result.message !== "close-reconciled" ||
          !stateIs(prState, "pr-closed")
        ) {
          throw new Error("PR close was not reconciled")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_close_coordinator",
      tool: "git",
      description: "Authenticate, close an Issue through fake gh, and reconcile its remote state",
      beforeEach: () => rmSync(issueState, { force: true }),
      run: () =>
        new IssueActionCoordinator({
          executable: fakeGh,
          cwd: root,
          env: { BENCHMARK_GH_ACTION_STATE: issueState },
        }).execute(issueAction),
      verify: (result) => {
        if (
          result.status !== "confirmed" ||
          result.message !== "close-reconciled" ||
          !stateIs(issueState, "issue-closed")
        ) {
          throw new Error("Issue close was not reconciled")
        }
      },
    }),
  ]
}
