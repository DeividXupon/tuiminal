import { chmodSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** The benchmark's gh transport never reaches an account or the network. */
export function installBenchmarkGh(root: string) {
  const path = join(root, "benchmark-gh")
  const source = `#!${process.execPath}
import { existsSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
if (args[0] === "--version") {
  console.log("gh version 2.83.2 (benchmark fixture)")
  process.exit(0)
}
if (args[0] === "pr" || args[0] === "issue") {
  const area = args[0]
  const command = args[1]
  const allowed = area === "pr"
    ? ["comment", "edit", "ready", "close", "reopen", "merge", "checkout"]
    : ["comment", "edit", "close", "reopen", "develop"]
  if (!allowed.includes(command) || args[2] !== "7" || args[3] !== "--repo" || args[4] !== "team/repo") process.exit(2)
  if (command === "comment") {
    if (args[5] !== "--body-file" || args[6] !== "-" || !(await Bun.stdin.text()).includes("benchmark")) process.exit(2)
    if (process.env.BENCHMARK_GH_STATE) writeFileSync(process.env.BENCHMARK_GH_STATE, area)
  }
  if (command === "close" && process.env.BENCHMARK_GH_ACTION_STATE) {
    writeFileSync(process.env.BENCHMARK_GH_ACTION_STATE, area + "-closed")
  }
  if (command === "edit" && !args.slice(5).some((value) => ["--add-assignee", "--remove-assignee", "--add-label", "--remove-label"].includes(value))) process.exit(2)
  if (command === "merge" && (!args.includes("--squash") || !args.includes("--match-head-commit") || !args.includes("abc123"))) process.exit(2)
  if (command === "develop" && !args.includes("--checkout")) process.exit(2)
  if (process.env.BENCHMARK_GH_NETWORK === "1") {
    console.error('Post "https://api.github.com/graphql": read tcp: connection reset by peer')
    process.exit(1)
  }
  console.log("accepted")
  process.exit(0)
}
if (args[0] !== "api") process.exit(2)
if (args.at(-1) === "user") {
  console.log(JSON.stringify({ login: "benchmark", node_id: "benchmark-viewer" }))
  process.exit(0)
}
if (args[1] === "graphql") {
  const request = JSON.parse(await Bun.stdin.text())
  if (request.query.includes("TuiminalAddReaction")) {
    if (!["PR_7", "I_7"].includes(request.variables.subjectId) || request.variables.content !== "HEART") process.exit(2)
    console.log(JSON.stringify({ data: { addReaction: { subject: { id: request.variables.subjectId } } } }))
    process.exit(0)
  }
  if (request.query.includes("TuiminalPullRequestDetailPage")) {
    console.log(JSON.stringify({ data: { repository: { pullRequest: {
      commits: {
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{ commit: { oid: "def456", messageHeadline: "second benchmark commit", authoredDate: "2026-01-03T00:00:00Z", author: { name: "Author", user: { login: "author" } } } }],
      },
    } } } }))
    process.exit(0)
  }
  if (request.query.includes("TuiminalPullRequestDetails")) {
    const commented = process.env.BENCHMARK_GH_STATE && existsSync(process.env.BENCHMARK_GH_STATE)
    const closed = process.env.BENCHMARK_GH_ACTION_STATE && existsSync(process.env.BENCHMARK_GH_ACTION_STATE)
    const checkFile = process.env.BENCHMARK_GH_CHECK_STATE_FILE
    const checkRead = checkFile
      ? (existsSync(checkFile) ? Number(await Bun.file(checkFile).text()) : 0) + 1
      : 0
    if (checkFile) writeFileSync(checkFile, String(checkRead))
    const checkPending = Boolean(checkFile && checkRead === 1)
    const connection = (nodes) => ({
      totalCount: nodes.length,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes,
    })
    console.log(JSON.stringify({ data: { repository: {
      viewerPermission: "WRITE",
      mergeCommitAllowed: true,
      squashMergeAllowed: true,
      rebaseMergeAllowed: false,
      pullRequest: {
        body: "Benchmark pull request description",
        baseRefOid: "base123", headRefOid: "abc123", state: closed ? "CLOSED" : "OPEN", isDraft: false,
        mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
        viewerCanUpdateBranch: true, viewerCanClose: true, viewerCanUpdate: true,
        reviewRequests: connection([{ asCodeOwner: true, requestedReviewer: { __typename: "Team", slug: "backend" } }]),
        reviews: connection([{ id: "review-1", state: "APPROVED", body: "ok", submittedAt: "2026-01-02T00:00:00Z", author: { login: "reviewer" }, commit: { oid: "abc123" } }]),
        commits: connection([{ commit: { oid: "abc123", messageHeadline: "benchmark commit", authoredDate: "2026-01-02T00:00:00Z", author: { name: "Author", user: { login: "author" } } } }]),
        files: connection([{ path: "src/index.ts", additions: 8, deletions: 3, changeType: "MODIFIED" }]),
        comments: connection([
          { id: "comment-1", body: "original comment", createdAt: "2026-01-02T00:00:00Z", url: "https://github.com/team/repo/pull/7#issuecomment-1", author: { login: "commenter" } },
          ...(commented ? [{ id: "benchmark-comment", body: "benchmark comment", createdAt: "2026-01-03T00:00:00Z", url: "https://github.com/team/repo/pull/7#issuecomment-new", author: { login: "benchmark" } }] : []),
        ]),
        timelineItems: connection([]),
        statusCheckRollup: { contexts: connection([{ __typename: "CheckRun", databaseId: 99, name: "test", status: checkPending ? "IN_PROGRESS" : "COMPLETED", conclusion: checkPending ? null : "SUCCESS", detailsUrl: "https://github.com/team/repo/actions/runs/99", checkSuite: { app: { name: "GitHub Actions" } } }]) },
      },
    } } }))
    process.exit(0)
  }
  if (request.query.includes("TuiminalIssueDetails")) {
    const commented = process.env.BENCHMARK_GH_STATE && existsSync(process.env.BENCHMARK_GH_STATE)
    const closed = process.env.BENCHMARK_GH_ACTION_STATE && existsSync(process.env.BENCHMARK_GH_ACTION_STATE)
    const olderPage = request.variables.before === "issue-page-2"
    console.log(JSON.stringify({ data: { repository: {
      viewerPermission: "WRITE",
      issue: {
        id: "I_7", number: 7, url: "https://github.com/team/repo/issues/7",
        title: "Benchmark issue", body: "Benchmark issue description", state: closed ? "CLOSED" : "OPEN",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z",
        viewerCanClose: true, viewerCanUpdate: true,
        author: { login: "author" },
        assignees: { totalCount: 1, nodes: [{ login: "assignee" }] },
        labels: { totalCount: 1, nodes: [{ name: "bug", color: "ff0000" }] },
        comments: { totalCount: commented ? 3 : 2, pageInfo: { hasPreviousPage: !olderPage, startCursor: olderPage ? null : "issue-page-2" }, nodes: olderPage
          ? [{ id: "issue-comment-older", body: "older comment", createdAt: "2026-01-01T00:00:00Z", author: { login: "historian" } }]
          : [
              { id: "issue-comment-1", body: "original comment", createdAt: "2026-01-02T00:00:00Z", author: { login: "commenter" } },
              ...(commented ? [{ id: "benchmark-issue-comment", body: "benchmark comment", createdAt: "2026-01-03T00:00:00Z", author: { login: "benchmark" } }] : []),
            ] },
        reactionGroups: [],
      },
    } } }))
    process.exit(0)
  }
  const issue = request.query.includes("TuiminalIssues")
  const revisionFile = process.env.BENCHMARK_GH_REVISION_FILE
  const revision = revisionFile
    ? (existsSync(revisionFile) ? Number(await Bun.file(revisionFile).text()) : 0) + 1
    : 0
  if (revisionFile) writeFileSync(revisionFile, String(revision))
  const offset = request.variables.after ? 20 : 0
  const nodes = Array.from({ length: 20 }, (_, index) => {
    const number = offset + index + 1
    return {
      id: (issue ? "I_" : "PR_") + number,
      number,
      url: "https://github.com/team/repo/" + (issue ? "issues/" : "pull/") + number,
      title: "Benchmark item " + number + (revisionFile ? " revision " + revision : ""),
      state: "OPEN",
      isDraft: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      author: { login: "author" },
      repository: { name: "repo", owner: { login: "team" } },
      assignees: { nodes: [] },
      labels: { nodes: [] },
      comments: { totalCount: 2 },
      reactionGroups: [],
      baseRefName: "main",
      headRefName: "feature",
      headRefOid: "abc123",
      additions: 8,
      deletions: 3,
      changedFiles: 2,
      reviewDecision: "APPROVED",
      statusCheckRollup: { state: "SUCCESS" },
    }
  })
  console.log(JSON.stringify({ data: { search: {
    issueCount: 40,
    pageInfo: { hasNextPage: !request.variables.after, endCursor: request.variables.after ? null : "page-2" },
    nodes,
  } } }))
} else if (args.includes("--method") && ["POST", "PUT"].includes(args[args.indexOf("--method") + 1])) {
  const endpoint = args.find((value) => value.startsWith("repos/team/repo/")) || ""
  if (endpoint === "repos/team/repo/pulls/7/reviews") {
    const input = JSON.parse(await Bun.stdin.text())
    if (args[args.indexOf("--method") + 1] !== "POST" || input.event !== "APPROVE" || input.commit_id !== "abc123") process.exit(2)
  } else if (endpoint === "repos/team/repo/pulls/7/update-branch") {
    const input = JSON.parse(await Bun.stdin.text())
    if (args[args.indexOf("--method") + 1] !== "PUT" || input.expected_head_sha !== "abc123") process.exit(2)
  } else if (endpoint !== "repos/team/repo/actions/runs/100/approve") process.exit(2)
  console.log("accepted")
} else if (args.some((value) => value.includes("/actions/runs?"))) {
  console.log(JSON.stringify({ workflow_runs: [
    { id: 99, name: "test", status: "completed", conclusion: "success", head_sha: "abc123", head_repository: { owner: { login: "team" }, name: "repo" }, repository: { owner: { login: "team" }, name: "repo" }, actor: { login: "author" }, event: "pull_request", html_url: "https://github.com/team/repo/actions/runs/99", run_attempt: 1 },
    { id: 100, name: "review", status: "action_required", conclusion: "action_required", head_sha: "abc123", head_repository: { owner: { login: "fork" }, name: "repo" }, repository: { owner: { login: "team" }, name: "repo" }, actor: { login: "author" }, event: "pull_request", html_url: "https://github.com/team/repo/actions/runs/100", run_attempt: 1 },
  ] }))
} else if (args.includes("repos/team/repo/pulls/1") && args.includes("GET")) {
  console.log(JSON.stringify({ state: "open", draft: false, merged_at: null }))
} else if (args.some((value) => value.startsWith("notifications?"))) {
  const page = args.some((value) => value.includes("&page=2")) ? 2 : 1
  const inboxFile = process.env.BENCHMARK_GH_INBOX_REVISION_FILE
  const revision = inboxFile
    ? (existsSync(inboxFile) ? Number(await Bun.file(inboxFile).text()) : 0) + 1
    : 0
  if (inboxFile) writeFileSync(inboxFile, String(revision))
  console.log(JSON.stringify(Array.from({ length: page === 1 ? 20 : 5 }, (_, index) => {
    const id = String((page - 1) * 20 + index + 1)
    return {
      id,
      unread: true,
      reason: "review_requested",
      updated_at: "2026-01-02T00:00:00Z",
      last_read_at: null,
      subject: { title: "Benchmark notification " + id + (inboxFile ? " revision " + revision : ""), url: "https://api.github.com/repos/team/repo/pulls/1", type: "PullRequest" },
      repository: { full_name: "team/repo", html_url: "https://github.com/team/repo" },
      url: "https://api.github.com/notifications/threads/" + id,
      subscription_url: "https://api.github.com/notifications/threads/" + id + "/subscription",
    }
  })))
} else process.exit(2)
`
  writeFileSync(path, source)
  chmodSync(path, 0o755)
  return path
}
