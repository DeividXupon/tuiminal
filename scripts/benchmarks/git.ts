import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { IssueActionKind } from "../../packages/feature-git/src/model/issue/actions"
import type { PullRequestActionKind } from "../../packages/feature-git/src/model/pr/actions"
import { installBenchmarkGh } from "./fake-gh"
import { gitFixture } from "./fixtures"
import { gitCloseCoordinatorBenchmarks } from "./git-coordinators"
import { gitLiveCheckWatchBenchmark } from "./git-watch"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function gitBenchmarks(parent: string): Promise<{
  cases: BenchmarkCase[]
  root: string
}> {
  const root = gitFixture(parent)
  const fakeGh = installBenchmarkGh(parent)
  const service = await import("../../packages/feature-git/src/services/git")
  const { searchPullRequestsPage } = await import(
    "../../packages/feature-git/src/services/github/search"
  )
  const { searchIssuesPage } = await import(
    "../../packages/feature-git/src/services/github/issue-search"
  )
  const { loadNotificationsPage } = await import(
    "../../packages/feature-git/src/services/github/notifications"
  )
  const { loadPullRequestDetails } = await import(
    "../../packages/feature-git/src/services/github/details"
  )
  const { loadPullRequestDetailPage } = await import(
    "../../packages/feature-git/src/services/github/detail-pages"
  )
  const { mergePullRequestDetailPage } = await import(
    "../../packages/feature-git/src/model/pr/detail-pagination"
  )
  const { loadIssueDetails } = await import(
    "../../packages/feature-git/src/services/github/issue-details"
  )
  const { IssueDetailsSession } = await import(
    "../../packages/feature-git/src/services/issue-details-session"
  )
  const { IssueSession } = await import("../../packages/feature-git/src/services/issue-session")
  const { PullRequestSession } = await import("../../packages/feature-git/src/services/pr-session")
  const { PullRequestWatchScheduler } = await import(
    "../../packages/feature-git/src/services/pr-watch"
  )
  const { DEFAULT_PULL_REQUEST_CONFIG } = await import(
    "../../packages/feature-git/src/model/pr/config"
  )
  const { DEFAULT_ISSUE_CONFIG } = await import("../../packages/feature-git/src/model/issue/config")
  const { loadPullRequestWorkflowRuns } = await import(
    "../../packages/feature-git/src/services/github/workflows"
  )
  const { preparePullRequestAction } = await import(
    "../../packages/feature-git/src/model/pr/actions"
  )
  const { prepareIssueAction } = await import("../../packages/feature-git/src/model/issue/actions")
  const { executePullRequestMutation } = await import(
    "../../packages/feature-git/src/services/github/mutations"
  )
  const { executeIssueMutation } = await import(
    "../../packages/feature-git/src/services/github/issue-mutations"
  )
  const { PullRequestActionCoordinator } = await import(
    "../../packages/feature-git/src/services/pr-actions"
  )
  const { IssueActionCoordinator } = await import(
    "../../packages/feature-git/src/services/issue-actions"
  )
  const {
    loadGitPartialStageSource,
    applyGitPartialStage,
    loadGitPartialStageState,
    applyGitPartialStageChanges,
  } = await import("../../packages/feature-git/src/services/git-partial-stage")
  const { buildGitPartialStagePatch } = await import(
    "../../packages/feature-git/src/model/git-partial-stage"
  )
  const { loadGitBranchComparison } = await import(
    "../../packages/feature-git/src/services/branch-comparison"
  )
  const { createPathTreeOptions } = await import(
    "../../packages/feature-git/src/rendering/file-tree"
  )
  const { parseDiffDocuments } = await import("../../packages/feature-git/src/rendering/diff")
  const { githubQuerySuggestions } = await import(
    "../../packages/feature-git/src/model/query-autocomplete"
  )
  const { DEMO_PULL_REQUESTS } = await import("../../packages/feature-git/src/model/pr/fixtures")
  const { DEMO_ISSUES } = await import("../../packages/feature-git/src/model/issue/fixtures")
  const { DEMO_INBOX_NOTIFICATIONS } = await import(
    "../../packages/feature-git/src/model/inbox/fixtures"
  )
  const { mergePullRequestItems } = await import(
    "../../packages/feature-git/src/services/pr-session"
  )
  const { orderIssueItems } = await import("../../packages/feature-git/src/model/issue/sections")
  const { mergeInboxNotifications } = await import(
    "../../packages/feature-git/src/model/inbox/notifications"
  )
  const { pullRequestMarkdownLines } = await import(
    "../../packages/feature-git/src/model/pr/content"
  )
  const file = {
    path: "file-0.txt",
    indexStatus: " ",
    worktreeStatus: "M",
    staged: false,
    unstaged: true,
    untracked: false,
  }
  const staged = { ...file, indexStatus: "M", worktreeStatus: " ", staged: true, unstaged: false }
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" })
  const partialRoot = join(parent, "git-partial-project")
  mkdirSync(partialRoot)
  const partialGit = (...args: string[]) =>
    execFileSync("git", ["-C", partialRoot, ...args], {
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      },
    })
  partialGit("init", "-q", "-b", "main")
  partialGit("config", "user.name", "Benchmark")
  partialGit("config", "user.email", "benchmark@example.test")
  const partialPath = "partial.txt"
  const partialBase = "one\ntwo\nthree\nfour\nfive\nsix\n"
  const partialModified = "one\nADDED_A\ntwo\nthree\nfour\nfive\nADDED_B\nsix\n"
  writeFileSync(join(partialRoot, partialPath), partialBase)
  partialGit("add", "--", partialPath)
  partialGit("commit", "-qm", "Partial-stage fixture")
  const partialFile = { ...file, path: partialPath }
  const mixedPartialFile = {
    ...partialFile,
    indexStatus: "M",
    worktreeStatus: "M",
    staged: true,
    unstaged: true,
  }
  const stagedPartialFile = {
    ...partialFile,
    indexStatus: "M",
    worktreeStatus: " ",
    staged: true,
    unstaged: false,
  }
  const partialPatchFor = (
    document: NonNullable<
      Awaited<ReturnType<typeof loadGitPartialStageState>>["documents"]["staged"]
    >,
    text: string,
  ) => {
    const line = document.hunks
      .flatMap((hunk) => hunk.lines)
      .find((item) => item.raw === `+${text}`)
    if (!line) throw new Error(`Missing partial-stage line ${text}`)
    return buildGitPartialStagePatch({
      document,
      granularity: "line",
      selected: new Set([line.id]),
    })
  }
  const checkoutRoot = join(parent, "git-checkout-clone")
  const checkoutGit = (...args: string[]) =>
    execFileSync("git", ["-C", checkoutRoot, ...args], { stdio: "pipe" })
  mkdirSync(checkoutRoot)
  checkoutGit("init", "-q", "-b", "main")
  checkoutGit("config", "user.name", "Benchmark")
  checkoutGit("config", "user.email", "benchmark@example.test")
  checkoutGit("remote", "add", "origin", "git@github.com:team/repo.git")
  writeFileSync(join(checkoutRoot, "README.md"), "Disposable checkout fixture\n")
  checkoutGit("add", "README.md")
  checkoutGit("commit", "-qm", "Fixture")
  const remoteOptions = { executable: fakeGh, cwd: root }
  const prConfigPath = join(parent, "benchmark-pr-config.json")
  const issueConfigPath = join(parent, "benchmark-issue-config.json")
  writeFileSync(
    prConfigPath,
    JSON.stringify({
      ...DEFAULT_PULL_REQUEST_CONFIG,
      profiles: {
        [root]: {
          host: "github.com",
          repositories: ["team/repo"],
          sections: [{ id: "benchmark", title: "Benchmark", query: "is:open" }],
        },
      },
    }),
  )
  writeFileSync(
    issueConfigPath,
    JSON.stringify({
      ...DEFAULT_ISSUE_CONFIG,
      profiles: {
        [root]: {
          host: "github.com",
          repositories: ["team/repo"],
          sections: [{ id: "benchmark", title: "Benchmark", query: "is:open" }],
        },
      },
    }),
  )
  const remoteIdentity = {
    host: "github.com",
    nodeId: "PR_7",
    owner: "team",
    repository: "repo",
    number: 7,
    url: "https://github.com/team/repo/pull/7",
  }
  const issueIdentity = {
    ...remoteIdentity,
    nodeId: "I_7",
    url: "https://github.com/team/repo/issues/7",
  }
  const mutationAuth = {
    host: "github.com",
    viewerId: "benchmark-viewer",
    viewerLogin: "benchmark",
    generation: 1,
  }
  const paths = Array.from(
    { length: 2_000 },
    (_, index) => `src/group-${index % 20}/file-${index}.ts`,
  )
  const patch = Array.from(
    { length: 500 },
    (_, index) =>
      `diff --git a/file-${index}.ts b/file-${index}.ts\n--- a/file-${index}.ts\n+++ b/file-${index}.ts\n@@ -1 +1 @@\n-old\n+new\n`,
  ).join("")
  const repositories = Array.from({ length: 2_000 }, (_, index) => `team/repo-${index}`)
  const pullRequests = Array.from({ length: 5_000 }, (_, index) => {
    const source = DEMO_PULL_REQUESTS[index % DEMO_PULL_REQUESTS.length]
    if (!source) throw new Error("Missing PR fixture")
    return {
      ...source,
      identity: { ...source.identity, nodeId: `PR_${index}`, number: index + 1 },
    }
  })
  const issues = Array.from({ length: 5_000 }, (_, index) => {
    const source = DEMO_ISSUES[index % DEMO_ISSUES.length]
    if (!source) throw new Error("Missing Issue fixture")
    return {
      ...source,
      identity: { ...source.identity, nodeId: `I_${index}`, number: index + 1 },
    }
  })
  const notifications = Array.from({ length: 5_000 }, (_, index) => {
    const source = DEMO_INBOX_NOTIFICATIONS[index % DEMO_INBOX_NOTIFICATIONS.length]
    if (!source) throw new Error("Missing Inbox fixture")
    return { ...source, id: `notification-${index}` }
  })
  const issueDetailItem = DEMO_ISSUES[0]
  const watchItem = DEMO_PULL_REQUESTS[0]
  if (!issueDetailItem || !watchItem) throw new Error("Missing remote Git fixtures")
  const paginatedIssue = { ...issueDetailItem, identity: issueIdentity }
  let prRefreshSession: InstanceType<typeof PullRequestSession> | null = null
  let issueRefreshSession: InstanceType<typeof IssueSession> | null = null
  const markdown =
    "# Description\n- item with **emphasis** and [link](https://example.test)\n".repeat(2_000)
  const cases: BenchmarkCase[] = [
    defineBenchmark({
      id: "git.status",
      tool: "git",
      description: "Local working-tree status",
      run: () => service.loadGitWorkingTreeSnapshot(root),
      verify: (result) => {
        if (!result.files.some((entry) => entry.path === file.path)) throw new Error("Missing edit")
      },
    }),
    defineBenchmark({
      id: "git.snapshot",
      tool: "git",
      description: "Local status and commit history",
      run: () => service.loadGitSnapshot(root),
      verify: (result) => {
        if (!result.commits.length) throw new Error("Missing commit history")
      },
    }),
    defineBenchmark({
      id: "git.diff",
      tool: "git",
      description: "Working-tree file diff",
      beforeEach: () => {
        git("restore", "--staged", "--", file.path)
      },
      run: () => service.loadGitDiff(root, file),
      verify: (result) => {
        if (!result.includes("+changed")) throw new Error("Missing diff")
      },
    }),
    defineBenchmark({
      id: "git.compare",
      tool: "git",
      description: "Compare two local branches",
      run: () => loadGitBranchComparison({ root, baseRef: "main", comparedRef: "feature" }),
      verify: (result) => {
        if (!result.patch.includes("comparison.txt")) throw new Error("Missing comparison")
      },
    }),
    defineBenchmark({
      id: "git.stage",
      tool: "git",
      description: "Stage one modified file",
      beforeEach: () => {
        git("restore", "--staged", "--", file.path)
      },
      run: () => service.toggleGitFile(root, file),
      verify: (result) => {
        if (!result.includes("stage")) throw new Error("Stage failed")
      },
    }),
    defineBenchmark({
      id: "git.unstage",
      tool: "git",
      description: "Unstage one modified file",
      beforeEach: () => {
        git("add", "--", file.path)
      },
      run: () => service.toggleGitFile(root, staged),
      verify: (result) => {
        if (!result.includes("stage")) throw new Error("Unstage failed")
      },
    }),
    defineBenchmark({
      id: "git.file_tree",
      tool: "git",
      description: "Build a 2,000-path file tree",
      run: () => createPathTreeOptions(paths, new Set()),
      verify: (result) => {
        if (result.length < 2_000) throw new Error("Incomplete tree")
      },
    }),
    defineBenchmark({
      id: "git.diff_parse",
      tool: "git",
      description: "Parse a 500-file patch for display",
      run: () => parseDiffDocuments(patch),
      verify: (result) => {
        if (!result.length) throw new Error("No diff documents")
      },
    }),
    defineBenchmark({
      id: "git.remote_query",
      tool: "git",
      description: "PR and Issue query suggestions over 2,000 repositories",
      run: () => [
        githubQuerySuggestions({ query: "repo:team/repo-19", kind: "pr", repositories }),
        githubQuerySuggestions({ query: "repo:team/repo-19", kind: "issue", repositories }),
      ],
      verify: (result) => {
        if (!result[0]?.length || !result[1]?.length) throw new Error("Missing suggestions")
      },
    }),
    defineBenchmark({
      id: "git.pr_remote_page",
      tool: "git",
      description: "Read and normalize 20 PRs through a local fake gh process",
      run: () =>
        searchPullRequestsPage({ host: "github.com", query: "is:pr", options: remoteOptions }),
      verify: (result) => {
        if (result.items.length !== 20 || !result.hasNextPage) {
          throw new Error("PR remote page is incomplete")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_remote_pagination",
      tool: "git",
      description: "Read two PR pages through local fake gh processes",
      run: async () => {
        const first = await searchPullRequestsPage({
          host: "github.com",
          query: "is:pr",
          options: remoteOptions,
        })
        const second = await searchPullRequestsPage({
          host: "github.com",
          query: "is:pr",
          after: first.endCursor,
          options: remoteOptions,
        })
        return { first, second }
      },
      verify: ({ first, second }) => {
        if (first.items.length !== 20 || second.items.length !== 20 || second.hasNextPage) {
          throw new Error("PR remote pagination failed")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_refresh_loaded_depth",
      tool: "git",
      description: "Refresh a PR section while retaining its two loaded pages through fake gh",
      beforeEach: async () => {
        prRefreshSession?.dispose()
        const session = new PullRequestSession({
          configPath: prConfigPath,
          transport: remoteOptions,
        })
        prRefreshSession = session
        try {
          const first = await session.loadSection(root, "benchmark")
          const second = await session.loadNextPage(root, "benchmark")
          if (first.status !== "ready" || second.status !== "ready" || second.loadedCount !== 40) {
            throw new Error("PR refresh fixture did not load two pages")
          }
        } catch (error) {
          session.dispose()
          prRefreshSession = null
          throw error
        }
      },
      run: async () => {
        const session = prRefreshSession
        if (!session) throw new Error("PR refresh session missing")
        try {
          return await session.refreshSections(root, ["benchmark"], "benchmark", null, false)
        } finally {
          session.dispose()
          prRefreshSession = null
        }
      },
      verify: (result) => {
        if (result.status !== "ready" || result.loadedCount !== 40 || result.hasNextPage) {
          throw new Error("PR refresh lost its loaded page depth")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_remote_details",
      tool: "git",
      description: "Read PR details, discussion, files, and checks through fake gh",
      run: () => loadPullRequestDetails({ identity: remoteIdentity, options: remoteOptions }),
      verify: (result) => {
        if (
          result?.commits.length !== 1 ||
          result.files.length !== 1 ||
          result.comments.length !== 1 ||
          result.checks.length !== 1
        ) {
          throw new Error("PR remote details are incomplete")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_detail_pagination",
      tool: "git",
      description: "Read and merge a second PR commit page through fake gh",
      run: async () => {
        const current = await loadPullRequestDetails({
          identity: remoteIdentity,
          options: remoteOptions,
        })
        const page = await loadPullRequestDetailPage({
          identity: remoteIdentity,
          connection: "commits",
          after: "commit-page-2",
          options: remoteOptions,
        })
        if (!current || !page) throw new Error("PR detail page missing")
        return mergePullRequestDetailPage(current, page, "commits")
      },
      verify: (result) => {
        if (result.commits.length !== 2 || result.pages.commits.totalCount !== 2) {
          throw new Error("PR detail pagination failed")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_workflow_runs",
      tool: "git",
      description: "Read and classify PR workflow runs through fake gh",
      run: () =>
        loadPullRequestWorkflowRuns({
          identity: remoteIdentity,
          headSha: "abc123",
          options: remoteOptions,
        }),
      verify: (result) => {
        if (result.length !== 2 || result.filter((run) => run.eligibleForApproval).length !== 1) {
          throw new Error("PR workflow runs are incomplete")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_ci_watch_transition",
      tool: "git",
      description: "Observe a pending-to-success PR check transition and retire its watch",
      run: async () => {
        let reads = 0
        let notices = 0
        const notified = Promise.withResolvers<void>()
        const scheduler = new PullRequestWatchScheduler(
          async () => [
            {
              id: "benchmark-check",
              name: "CI",
              state: reads++ === 0 ? "pending" : "success",
              detailsUrl: "",
              provider: "benchmark",
            },
          ],
          () => {
            notices += 1
            notified.resolve()
          },
          { intervalMs: 2, random: () => 0.5 },
        )
        const timer = setTimeout(() => notified.reject(new Error("CI watch timed out")), 1_000)
        try {
          if (!scheduler.watch(watchItem)) throw new Error("CI watch was not started")
          await notified.promise
          return { reads, notices, watching: scheduler.isWatching(watchItem) }
        } finally {
          clearTimeout(timer)
          scheduler.dispose()
        }
      },
      verify: (result) => {
        if (result.reads !== 2 || result.notices !== 1 || result.watching) {
          throw new Error("CI watch did not settle after success")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_remote_page",
      tool: "git",
      description: "Read and normalize 20 Issues through a local fake gh process",
      run: () =>
        searchIssuesPage({ host: "github.com", query: "is:issue", options: remoteOptions }),
      verify: (result) => {
        if (result.items.length !== 20 || !result.hasNextPage) {
          throw new Error("Issue remote page is incomplete")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_remote_pagination",
      tool: "git",
      description: "Read two Issue pages through local fake gh processes",
      run: async () => {
        const first = await searchIssuesPage({
          host: "github.com",
          query: "is:issue",
          options: remoteOptions,
        })
        const second = await searchIssuesPage({
          host: "github.com",
          query: "is:issue",
          after: first.endCursor,
          options: remoteOptions,
        })
        return { first, second }
      },
      verify: ({ first, second }) => {
        if (first.items.length !== 20 || second.items.length !== 20 || second.hasNextPage) {
          throw new Error("Issue remote pagination failed")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_refresh_loaded_depth",
      tool: "git",
      description: "Refresh an Issue section while retaining its two loaded pages through fake gh",
      beforeEach: async () => {
        issueRefreshSession?.dispose()
        const session = new IssueSession({ configPath: issueConfigPath, transport: remoteOptions })
        issueRefreshSession = session
        try {
          const first = await session.loadSection(root, "benchmark")
          const second = await session.loadNextPage(root, "benchmark")
          if (first.status !== "ready" || second.status !== "ready" || second.loadedCount !== 40) {
            throw new Error("Issue refresh fixture did not load two pages")
          }
        } catch (error) {
          session.dispose()
          issueRefreshSession = null
          throw error
        }
      },
      run: async () => {
        const session = issueRefreshSession
        if (!session) throw new Error("Issue refresh session missing")
        try {
          return await session.refreshSections(root, ["benchmark"], "benchmark", null, false)
        } finally {
          session.dispose()
          issueRefreshSession = null
        }
      },
      verify: (result) => {
        if (result.status !== "ready" || result.loadedCount !== 40 || result.hasNextPage) {
          throw new Error("Issue refresh lost its loaded page depth")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_remote_details",
      tool: "git",
      description: "Read Issue details and discussion through fake gh",
      run: () =>
        loadIssueDetails({
          identity: issueIdentity,
          options: remoteOptions,
        }),
      verify: (result) => {
        if (result?.comments.length !== 1 || !result.metadataComplete) {
          throw new Error("Issue remote details are incomplete")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_detail_pagination",
      tool: "git",
      description: "Load and merge an older Issue comment page through fake gh",
      run: async () => {
        const session = new IssueDetailsSession(remoteOptions)
        try {
          const first = await session.load(paginatedIssue)
          if (!first.details) throw new Error("Issue details fixture missing")
          return await session.loadMore(paginatedIssue, first.details)
        } finally {
          session.dispose()
        }
      },
      verify: (result) => {
        if (
          result.comments.length !== 2 ||
          result.comments[0]?.id !== "issue-comment-older" ||
          result.commentPage.hasNextPage
        ) {
          throw new Error("Issue comment pagination failed")
        }
      },
    }),
    defineBenchmark({
      id: "git.inbox_remote_pagination",
      tool: "git",
      description: "Read two Inbox pages through local fake gh processes",
      run: async () => {
        const first = await loadNotificationsPage({
          host: "github.com",
          page: 1,
          perPage: 20,
          options: remoteOptions,
        })
        const second = await loadNotificationsPage({
          host: "github.com",
          page: 2,
          perPage: 20,
          options: remoteOptions,
        })
        return { first, second }
      },
      verify: ({ first, second }) => {
        if (first.items.length !== 20 || second.items.length !== 5 || second.hasNextPage) {
          throw new Error("Inbox remote pagination failed")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_merge",
      tool: "git",
      description: "Merge 5,000 PR rows with a 1,000-row page",
      run: () => mergePullRequestItems(pullRequests, pullRequests.slice(4_000)),
      verify: (result) => {
        if (result.length !== 5_000) throw new Error("PR merge lost rows")
      },
    }),
    defineBenchmark({
      id: "git.pr_markdown",
      tool: "git",
      description: "Render a large PR description into Markdown lines",
      run: () => pullRequestMarkdownLines(markdown),
      verify: (result) => {
        if (!result.length) throw new Error("Missing PR description")
      },
    }),
    defineBenchmark({
      id: "git.issue_order",
      tool: "git",
      description: "Sort 5,000 Issue rows by update time",
      run: () => orderIssueItems(issues, "updated-desc"),
      verify: (result) => {
        if (result.length !== 5_000) throw new Error("Issue sort lost rows")
      },
    }),
    defineBenchmark({
      id: "git.inbox_merge",
      tool: "git",
      description: "Merge 5,000 Inbox notifications with a 1,000-row page",
      run: () => mergeInboxNotifications(notifications, notifications.slice(4_000)),
      verify: (result) => {
        if (result.length !== 5_000) throw new Error("Inbox merge lost rows")
      },
    }),
    defineBenchmark({
      id: "git.partial_load",
      tool: "git",
      description: "Load a tracked file's partial-stage patch",
      beforeEach: () => {
        git("restore", "--staged", "--", file.path)
      },
      run: () => loadGitPartialStageSource(root, file),
      verify: (result) => {
        if (!result.hunks.length) throw new Error("Partial-stage patch is empty")
      },
    }),
    defineBenchmark({
      id: "git.partial_apply",
      tool: "git",
      description: "Build and apply one selected partial-stage hunk",
      beforeEach: () => {
        git("restore", "--staged", "--", file.path)
      },
      run: async () => {
        const document = await loadGitPartialStageSource(root, file)
        const patch = buildGitPartialStagePatch({
          document,
          granularity: "hunk",
          selected: new Set(document.hunks.map((hunk) => hunk.id)),
        })
        return applyGitPartialStage({
          root,
          file,
          expectedSource: document.source,
          patch,
        })
      },
      verify: (result) => {
        if (!result.includes("stage")) throw new Error("Partial staging failed")
        if (!git("diff", "--cached", "--", file.path).toString().includes("+changed")) {
          throw new Error("Selected hunk was not staged")
        }
      },
    }),
    defineBenchmark({
      id: "git.partial_line_stage",
      tool: "git",
      description: "Stage one added line while leaving a second line in the worktree",
      beforeEach: () => {
        partialGit("restore", "--staged", "--", partialPath)
        writeFileSync(join(partialRoot, partialPath), partialModified)
      },
      run: async () => {
        const state = await loadGitPartialStageState(partialRoot, partialFile)
        const document = state.documents.unstaged
        if (!document) throw new Error("Missing unstaged line patch")
        return applyGitPartialStageChanges({
          root: partialRoot,
          file: partialFile,
          expectedSources: state.sources,
          addPatch: partialPatchFor(document, "ADDED_A"),
          removePatch: "",
        })
      },
      verify: (result) => {
        const indexed = partialGit("diff", "--cached", "--", partialPath).toString()
        const worktree = partialGit("diff", "--", partialPath).toString()
        if (
          !result.includes("Stage parcial") ||
          !indexed.includes("+ADDED_A") ||
          indexed.includes("+ADDED_B") ||
          !worktree.includes("+ADDED_B") ||
          worktree.includes("+ADDED_A")
        ) {
          throw new Error("Line-level stage changed the wrong Git index lines")
        }
      },
    }),
    defineBenchmark({
      id: "git.partial_line_unstage",
      tool: "git",
      description: "Reverse one staged line while retaining a second line in the index",
      beforeEach: () => {
        writeFileSync(join(partialRoot, partialPath), partialModified)
        partialGit("add", "--", partialPath)
      },
      run: async () => {
        const state = await loadGitPartialStageState(partialRoot, stagedPartialFile)
        const document = state.documents.staged
        if (!document) throw new Error("Missing staged line patch")
        return applyGitPartialStageChanges({
          root: partialRoot,
          file: stagedPartialFile,
          expectedSources: state.sources,
          addPatch: "",
          removePatch: partialPatchFor(document, "ADDED_A"),
        })
      },
      verify: (result) => {
        const indexed = partialGit("diff", "--cached", "--", partialPath).toString()
        const worktree = partialGit("diff", "--", partialPath).toString()
        if (
          !result.includes("Stage parcial") ||
          indexed.includes("+ADDED_A") ||
          !indexed.includes("+ADDED_B") ||
          !worktree.includes("+ADDED_A") ||
          worktree.includes("+ADDED_B")
        ) {
          throw new Error("Reverse partial stage changed the wrong Git index lines")
        }
      },
    }),
    defineBenchmark({
      id: "git.partial_line_exchange",
      tool: "git",
      description: "Exchange disjoint staged and unstaged lines in one guarded apply",
      beforeEach: async () => {
        partialGit("restore", "--staged", "--", partialPath)
        writeFileSync(join(partialRoot, partialPath), partialModified)
        const state = await loadGitPartialStageState(partialRoot, partialFile)
        const document = state.documents.unstaged
        if (!document) throw new Error("Missing unstaged line patch")
        await applyGitPartialStageChanges({
          root: partialRoot,
          file: partialFile,
          expectedSources: state.sources,
          addPatch: partialPatchFor(document, "ADDED_A"),
          removePatch: "",
        })
      },
      run: async () => {
        const state = await loadGitPartialStageState(partialRoot, mixedPartialFile)
        const indexed = state.documents.staged
        const worktree = state.documents.unstaged
        if (!indexed || !worktree) throw new Error("Missing both partial-stage directions")
        return applyGitPartialStageChanges({
          root: partialRoot,
          file: mixedPartialFile,
          expectedSources: state.sources,
          addPatch: partialPatchFor(worktree, "ADDED_B"),
          removePatch: partialPatchFor(indexed, "ADDED_A"),
        })
      },
      verify: (result) => {
        const indexed = partialGit("diff", "--cached", "--", partialPath).toString()
        const worktree = partialGit("diff", "--", partialPath).toString()
        if (
          !result.includes("Stage parcial") ||
          indexed.includes("+ADDED_A") ||
          !indexed.includes("+ADDED_B") ||
          !worktree.includes("+ADDED_A") ||
          worktree.includes("+ADDED_B")
        ) {
          throw new Error("Bidirectional partial stage left an incorrect Git index")
        }
      },
    }),
    defineBenchmark({
      id: "git.discard",
      tool: "git",
      description: "Discard one tracked file change in the disposable worktree",
      beforeEach: () => writeFileSync(join(root, "file-1.txt"), "old 1\nchanged\n"),
      run: () => service.discardGitFiles(root, [{ ...file, path: "file-1.txt" }]),
      verify: () => {
        if (readFileSync(join(root, "file-1.txt"), "utf8") !== "old 1\n") {
          throw new Error("Tracked file was not restored")
        }
      },
    }),
    defineBenchmark({
      id: "git.discard_untracked",
      tool: "git",
      description: "Discard one untracked file in the disposable worktree",
      beforeEach: () => writeFileSync(join(root, "benchmark-new.txt"), "owned fixture\n"),
      run: () =>
        service.discardGitFiles(root, [
          {
            path: "benchmark-new.txt",
            indexStatus: "?",
            worktreeStatus: "?",
            staged: false,
            unstaged: true,
            untracked: true,
          },
        ]),
      verify: () => {
        if (existsSync(join(root, "benchmark-new.txt"))) {
          throw new Error("Untracked file was not removed")
        }
      },
    }),
  ]
  const prMutations: Array<{ kind: PullRequestActionKind; payload: Record<string, unknown> }> = [
    { kind: "comment", payload: { body: "benchmark comment" } },
    {
      kind: "reply",
      payload: {
        body: "benchmark reply",
        commentId: "comment-1",
        commentUrl: `${remoteIdentity.url}#issuecomment-1`,
        commentAuthor: "author",
      },
    },
    { kind: "reaction", payload: { subjectId: "PR_7", subjectKind: "item", reaction: "HEART" } },
    { kind: "approve", payload: { body: "benchmark approval" } },
    { kind: "assign", payload: { login: "reviewer" } },
    { kind: "unassign", payload: { login: "reviewer" } },
    { kind: "ready", payload: {} },
    { kind: "close", payload: {} },
    { kind: "reopen", payload: {} },
    { kind: "update-branch", payload: {} },
    { kind: "merge", payload: { method: "squash" } },
    { kind: "approve-workflow", payload: { runId: 100 } },
    { kind: "checkout", payload: { clonePath: checkoutRoot } },
  ]
  for (const { kind, payload } of prMutations) {
    const state = preparePullRequestAction({
      actionId: `benchmark-${kind}`,
      kind,
      target: remoteIdentity,
      expectedHeadSha: "abc123",
      auth: mutationAuth,
      payload,
    })
    if (state.status !== "prepared") throw new Error(`PR mutation ${kind} was not prepared`)
    cases.push(
      defineBenchmark({
        id: `git.pr_mutation_${kind.replaceAll("-", "_")}`,
        tool: "git",
        description: `Validate and dispatch a ${kind} PR action through fake gh`,
        run: () => executePullRequestMutation(state.action, remoteOptions),
        verify: (result) => {
          if (result.status !== "confirmed" || result.message !== `${kind}-accepted`) {
            throw new Error(`PR ${kind} mutation failed`)
          }
        },
      }),
    )
  }
  const issueMutations: Array<{ kind: IssueActionKind; payload: Record<string, unknown> }> = [
    { kind: "comment", payload: { body: "benchmark comment" } },
    {
      kind: "reply",
      payload: {
        body: "benchmark reply",
        commentId: "issue-comment-1",
        commentUrl: `${issueIdentity.url}#issuecomment-1`,
        commentAuthor: "author",
      },
    },
    { kind: "reaction", payload: { subjectId: "I_7", subjectKind: "item", reaction: "HEART" } },
    { kind: "assign", payload: { logins: ["reviewer"] } },
    { kind: "unassign", payload: { logins: ["reviewer"] } },
    {
      kind: "labels",
      payload: { labels: ["frontend"], addLabels: ["frontend"], removeLabels: ["bug"] },
    },
    { kind: "close", payload: {} },
    { kind: "reopen", payload: {} },
    { kind: "checkout", payload: { clonePath: checkoutRoot } },
  ]
  for (const { kind, payload } of issueMutations) {
    const state = prepareIssueAction({
      actionId: `benchmark-${kind}`,
      kind,
      target: issueIdentity,
      expectedUpdatedAt: "2026-01-02T00:00:00Z",
      expectedState: "open",
      auth: mutationAuth,
      payload,
    })
    if (state.status !== "prepared") throw new Error(`Issue mutation ${kind} was not prepared`)
    cases.push(
      defineBenchmark({
        id: `git.issue_mutation_${kind}`,
        tool: "git",
        description: `Validate and dispatch a ${kind} Issue action through fake gh`,
        run: () => executeIssueMutation(state.action, remoteOptions),
        verify: (result) => {
          if (result.status !== "confirmed" || result.message !== `${kind}-accepted`) {
            throw new Error(`Issue ${kind} mutation failed`)
          }
        },
      }),
    )
  }
  const prComment = preparePullRequestAction({
    actionId: "benchmark-pr-coordinator",
    kind: "comment",
    target: remoteIdentity,
    expectedHeadSha: "abc123",
    auth: mutationAuth,
    payload: { body: "benchmark comment" },
  })
  const issueComment = prepareIssueAction({
    actionId: "benchmark-issue-coordinator",
    kind: "comment",
    target: issueIdentity,
    expectedUpdatedAt: "2026-01-02T00:00:00Z",
    expectedState: "open",
    auth: mutationAuth,
    payload: { body: "benchmark comment" },
  })
  if (prComment.status !== "prepared" || issueComment.status !== "prepared") {
    throw new Error("Git coordinator actions were not prepared")
  }
  const prStatePath = join(parent, "benchmark-pr-comment-state")
  const issueStatePath = join(parent, "benchmark-issue-comment-state")
  cases.push(
    defineBenchmark({
      id: "git.pr_mutation_uncertain_network",
      tool: "git",
      description: "Classify one dispatched PR write with a simulated network loss",
      run: () =>
        executePullRequestMutation(prComment.action, {
          ...remoteOptions,
          env: { BENCHMARK_GH_NETWORK: "1" },
        }),
      verify: (result) => {
        if (result.status !== "uncertain" || result.reason !== "network") {
          throw new Error("PR network uncertainty was not classified")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_mutation_uncertain_network",
      tool: "git",
      description: "Classify one dispatched Issue write with a simulated network loss",
      run: () =>
        executeIssueMutation(issueComment.action, {
          ...remoteOptions,
          env: { BENCHMARK_GH_NETWORK: "1" },
        }),
      verify: (result) => {
        if (result.status !== "uncertain" || result.reason !== "network") {
          throw new Error("Issue network uncertainty was not classified")
        }
      },
    }),
    defineBenchmark({
      id: "git.pr_comment_coordinator",
      tool: "git",
      description: "Authenticate, write one PR comment, and reconcile through fake gh",
      beforeEach: () => rmSync(prStatePath, { force: true }),
      run: () =>
        new PullRequestActionCoordinator({
          ...remoteOptions,
          env: { BENCHMARK_GH_STATE: prStatePath },
        }).execute(prComment),
      verify: (result) => {
        if (result.status !== "confirmed" || result.message !== "comment-reconciled") {
          throw new Error("PR comment was not reconciled")
        }
      },
    }),
    defineBenchmark({
      id: "git.issue_comment_coordinator",
      tool: "git",
      description: "Authenticate, write one Issue comment, and reconcile through fake gh",
      beforeEach: () => rmSync(issueStatePath, { force: true }),
      run: () =>
        new IssueActionCoordinator({
          ...remoteOptions,
          env: { BENCHMARK_GH_STATE: issueStatePath },
        }).execute(issueComment),
      verify: (result) => {
        if (result.status !== "confirmed" || result.message !== "comment-reconciled") {
          throw new Error("Issue comment was not reconciled")
        }
      },
    }),
  )
  cases.push(
    ...(await gitCloseCoordinatorBenchmarks({
      parent,
      root,
      fakeGh,
      prIdentity: remoteIdentity,
      issueIdentity,
    })),
    await gitLiveCheckWatchBenchmark({ parent, root, fakeGh }),
  )
  return { cases, root }
}
