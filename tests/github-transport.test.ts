import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_PULL_REQUEST_CONFIG } from "../src/features/git/model/pr/config"
import { mergePullRequestDetailPage } from "../src/features/git/model/pr/detail-pagination"
import {
  detectGhCapabilities,
  ghVersionIsSupported,
  loadGhAuthContext,
  parseGhVersion,
} from "../src/features/git/services/github/auth"
import { loadGitHubAccountScope } from "../src/features/git/services/github/account-scope"
import { loadPullRequestDetailPage } from "../src/features/git/services/github/detail-pages"
import { PULL_REQUEST_DETAILS_QUERY } from "../src/features/git/services/github/detail-query"
import {
  loadPullRequestDetails,
  normalizePullRequestDetails,
} from "../src/features/git/services/github/details"
import {
  assertAllowedGitHubHost,
  isValidGitHubHost,
} from "../src/features/git/services/github/host"
import { openPullRequestInBrowser } from "../src/features/git/services/github/read-actions"
import {
  normalizePullRequestSearchPage,
  searchPullRequestsPage,
} from "../src/features/git/services/github/search"
import {
  GitHubTransportError,
  runGhCommand,
  runGhJson,
} from "../src/features/git/services/github/transport"
import { PullRequestSession } from "../src/features/git/services/pr-session"
import { savePullRequestConfig } from "../src/features/git/storage/pr/config"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tuiminal-gh-fake-"))
const fakeGh = join(temporaryDirectory, "gh")

beforeAll(() => {
  writeFileSync(
    fakeGh,
    `#!/usr/bin/env bun
const args = process.argv.slice(2)
if (args[0] === "--version") {
  console.log("gh version 2.83.2 (fixture)")
} else if (args[0] === "bad-json") {
  console.log("not json")
} else if (args[0] === "sleep") {
  await Bun.sleep(500)
  console.log("late")
} else if (args[0] === "auth-error") {
  console.error("not logged into any GitHub hosts")
  process.exit(1)
} else if (args[0] === "echo-stdin") {
  process.stdout.write(await Bun.stdin.text())
} else if (args[0] === "api" && args.at(-1) === "user") {
  const viewer = process.env.FAKE_GH_VIEWER || "fixture-user"
  console.log(JSON.stringify({ login: viewer, node_id: "node-" + viewer }))
} else if (args[0] === "api" && args[1] === "graphql") {
  const body = JSON.parse(await Bun.stdin.text())
  if (body.query.includes("TuiminalPullRequestOrganizations")) {
    const paginated = process.env.FAKE_GH_ORG_PAGINATE === "1"
    const secondPage = Boolean(body.variables.after)
    console.log(JSON.stringify({
      data: { viewer: { organizations: {
        pageInfo: {
          hasNextPage: paginated && !secondPage,
          endCursor: paginated && !secondPage ? "org-page-2" : null
        },
        nodes: [{ login: secondPage ? "second-org" : "fixture-org" }]
      } } }
    }))
    process.exit(0)
  } else if (body.query.includes("TuiminalPullRequestCollaborators")) {
    console.log(JSON.stringify({
      data: { viewer: { repositories: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          { nameWithOwner: "fixture-org/already-covered" },
          { nameWithOwner: "external/collaboration" }
        ]
      } } }
    }))
    process.exit(0)
  } else if (body.query.includes("TuiminalPullRequestDetailPage")) {
    console.log(JSON.stringify({
      data: { repository: { viewerPermission: "WRITE", mergeCommitAllowed: true, squashMergeAllowed: true, rebaseMergeAllowed: false, pullRequest: {
        commits: {
          totalCount: 2,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ commit: { oid: "def456", messageHeadline: "fix: second page", authoredDate: "2026-09-04T13:00:00Z", author: { name: "Second", user: { login: "second-author" } } } }]
        }
      } } }
    }))
    process.exit(0)
  } else if (body.query.includes("TuiminalPullRequestDetails")) {
    console.log(JSON.stringify({
      data: { repository: { viewerPermission: "WRITE", mergeCommitAllowed: true, squashMergeAllowed: true, rebaseMergeAllowed: false, pullRequest: {
        body: "Descrição\\u001b]52;maliciosa",
        baseRefOid: "base123",
        headRefOid: "abc123",
        state: "OPEN",
        isDraft: false,
        mergedAt: null,
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        viewerCanUpdateBranch: true,
        viewerCanClose: true,
        viewerCanReopen: false,
        viewerCanMergeAsAdmin: false,
        viewerCanUpdate: true,
        reviewRequests: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ asCodeOwner: true, requestedReviewer: { __typename: "Team", slug: "backend" } }] },
        reviews: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: "review-1", state: "APPROVED", body: "ok", submittedAt: "2026-09-04T12:00:00Z", author: { login: "ana" }, commit: { oid: "abc123" } }] },
        commits: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ commit: { oid: "abc123", messageHeadline: "feat: fixture", authoredDate: "2026-09-04T12:00:00Z", author: { name: "Author", user: { login: "author" } } } }] },
        files: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ path: "src/index.ts", additions: 8, deletions: 3, changeType: "MODIFIED" }] },
        comments: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: "comment-1", body: "comentário", createdAt: "2026-09-04T12:00:00Z", url: "https://github.com/team/repo/pull/7#issuecomment-1", author: { login: "bia" } }] },
        timelineItems: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ __typename: "ReadyForReviewEvent", id: "event-1", createdAt: "2026-09-04T11:00:00Z", actor: { login: "author" } }] },
        statusCheckRollup: { contexts: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ __typename: "CheckRun", databaseId: 99, name: "test", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/team/repo/actions/runs/99", checkSuite: { app: { name: "GitHub Actions" } } }] } }
      } } }
    }))
    process.exit(0)
  }
  const paginated = process.env.FAKE_GH_PAGINATE === "1"
  const secondPage = Boolean(body.variables.after)
  console.log(JSON.stringify({
    data: {
      search: {
        issueCount: paginated ? 2 : 1,
        pageInfo: {
          hasNextPage: paginated && !secondPage,
          endCursor: paginated && !secondPage ? "page-2" : null
        },
        nodes: [{
          id: secondPage ? "PR_fixture_8" : "PR_fixture_7",
          number: secondPage ? 8 : 7,
          url: secondPage
            ? "https://github.com/team/repo/pull/8"
            : "https://github.com/team/repo/pull/7",
          title: body.variables.searchQuery,
          state: "OPEN",
          isDraft: false,
          updatedAt: "2026-09-04T12:00:00Z",
          isCrossRepository: true,
          baseRefName: "main",
          headRefName: "feature",
          headRefOid: "abc123",
          additions: 8,
          deletions: 3,
          changedFiles: 2,
          author: { login: "author" },
          repository: { name: "repo", owner: { login: "team" } },
          assignees: { nodes: [{ login: "reviewer" }] },
          labels: { nodes: [{ name: "bug", color: "ff0000" }] },
          comments: { totalCount: 4 },
          reviewDecision: "REVIEW_REQUIRED",
          statusCheckRollup: { state: "FAILURE" }
        }]
      }
    }
  }))
} else if (args[0] === "pr" && args[1] === "view" && args.includes("--web")) {
  console.log("opened")
} else {
  console.error("unexpected fake gh args: " + JSON.stringify(args))
  process.exit(2)
}
`,
    "utf8",
  )
  chmodSync(fakeGh, 0o755)
})

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe("GitHub CLI transport", () => {
  test("runs argument arrays and sends bodies through stdin", async () => {
    const payload = '{"body":"$(touch should-not-run)"}'
    const result = await runGhCommand(
      { args: ["echo-stdin"], stdin: payload },
      { executable: fakeGh },
    )
    expect(result.stdout).toBe(payload)
  })

  test("classifies invalid JSON, missing auth and timeouts", async () => {
    expect(runGhJson({ args: ["bad-json"] }, { executable: fakeGh })).rejects.toMatchObject({
      kind: "invalid-json",
    })
    expect(runGhCommand({ args: ["auth-error"] }, { executable: fakeGh })).rejects.toMatchObject({
      kind: "not-authenticated",
    })
    expect(
      runGhCommand({ args: ["sleep"] }, { executable: fakeGh, timeoutMs: 10 }),
    ).rejects.toMatchObject({ kind: "timeout" })
  })

  test("rejects null bytes before spawning", async () => {
    expect(
      runGhCommand({ args: ["bad\0argument"] }, { executable: fakeGh }),
    ).rejects.toBeInstanceOf(GitHubTransportError)
  })
})

describe("GitHub CLI capabilities and auth", () => {
  test("parses and compares semantic versions", () => {
    expect(parseGhVersion("gh version 2.83.2 (fixture)")).toBe("2.83.2")
    expect(ghVersionIsSupported("2.40.0")).toBe(true)
    expect(ghVersionIsSupported("2.39.9")).toBe(false)
    expect(ghVersionIsSupported("invalid")).toBe(false)
  })

  test("detects capabilities and viewer identity without reading a token", async () => {
    expect(await detectGhCapabilities({ executable: fakeGh })).toEqual({
      available: true,
      version: "2.83.2",
      supported: true,
      reason: "ready",
    })
    expect(
      await loadGhAuthContext({
        host: "github.com",
        generation: 5,
        options: { executable: fakeGh },
      }),
    ).toEqual({
      host: "github.com",
      viewerId: "node-fixture-user",
      viewerLogin: "fixture-user",
      generation: 5,
    })
    expect(
      await loadGitHubAccountScope({
        host: "github.com",
        viewerLogin: "fixture-user",
        options: { executable: fakeGh },
      }),
    ).toEqual({
      viewerLogin: "fixture-user",
      organizations: ["fixture-org"],
      repositories: ["external/collaboration"],
      partial: false,
    })
    expect(
      await loadGitHubAccountScope({
        host: "github.com",
        viewerLogin: "fixture-user",
        options: { executable: fakeGh, env: { FAKE_GH_ORG_PAGINATE: "1" } },
      }),
    ).toEqual({
      viewerLogin: "fixture-user",
      organizations: ["fixture-org", "second-org"],
      repositories: ["external/collaboration"],
      partial: false,
    })
  })

  test("validates hosts against the explicit profile allowlist", () => {
    expect(isValidGitHubHost("github.com")).toBe(true)
    expect(isValidGitHubHost("github.enterprise.test")).toBe(true)
    expect(isValidGitHubHost("https://github.com/path")).toBe(false)
    expect(assertAllowedGitHubHost("GitHub.com", ["github.com"])).toBe("github.com")
    expect(() => assertAllowedGitHubHost("other.example", ["github.com"])).toThrow("not allowed")
  })
})

describe("Pull request GraphQL search", () => {
  test("normalizes nullable and partial responses", () => {
    expect(
      normalizePullRequestSearchPage({ errors: [{ message: "partial" }] }, "github.com"),
    ).toEqual({
      items: [],
      totalCount: null,
      hasNextPage: false,
      endCursor: null,
      partial: true,
    })
  })

  test("sends the query as JSON stdin and normalizes the result", async () => {
    const page = await searchPullRequestsPage({
      host: "github.com",
      query: "is:pr repo:team/repo",
      options: { executable: fakeGh },
    })
    expect(page.totalCount).toBe(1)
    expect(page.partial).toBe(false)
    expect(page.items[0]).toMatchObject({
      title: "is:pr repo:team/repo",
      state: "open",
      reviewState: "review-required",
      checkState: "failure",
      additions: 8,
      deletions: 3,
      isFork: true,
      identity: { host: "github.com", owner: "team", repository: "repo", number: 7 },
    })
  })

  test("removes terminal controls from list fields before rendering", async () => {
    const page = await searchPullRequestsPage({
      host: "github.com",
      query: "is:pr\u001b]52;unsafe\u0007",
      options: { executable: fakeGh },
    })
    expect(page.items[0]?.title).toBe("is:pr]52;unsafe")
  })
})

describe("Pull request details and read actions", () => {
  const identity = {
    host: "github.com",
    nodeId: "PR_fixture_7",
    owner: "team",
    repository: "repo",
    number: 7,
    url: "https://github.com/team/repo/pull/7",
  }

  test("normalizes five preview connections and strips terminal controls", async () => {
    expect(PULL_REQUEST_DETAILS_QUERY).toContain("viewerCanUpdate")
    expect(PULL_REQUEST_DETAILS_QUERY).not.toContain("viewerCanMarkReadyForReview")
    const details = await loadPullRequestDetails({ identity, options: { executable: fakeGh } })
    expect(details).toMatchObject({
      identity,
      body: "Descrição]52;maliciosa",
      mergeable: "mergeable",
      reviewRequests: [{ login: "backend", kind: "team", asCodeOwner: true }],
      reviews: [{ state: "approved" }],
      commits: [{ sha: "abc123" }],
      files: [{ path: "src/index.ts" }],
      checks: [{ name: "test", state: "success" }],
      timeline: [{ kind: "ready", actor: { login: "author" } }],
      permissions: {
        canUpdateBranch: true,
        canMarkReady: true,
        canMerge: true,
        repositoryPermission: "write",
      },
    })
    expect(details?.pages.comments.totalCount).toBe(1)
  })

  test("treats a missing PR as not found and opens only an explicit repo target", async () => {
    expect(
      normalizePullRequestDetails({ data: { repository: { pullRequest: null } } }, identity),
    ).toBeNull()
    expect(await openPullRequestInBrowser(identity, { executable: fakeGh })).toMatchObject({
      stdout: "opened\n",
    })
  })

  test("loads a detail cursor page and merges it without losing earlier items", async () => {
    const current = await loadPullRequestDetails({ identity, options: { executable: fakeGh } })
    const page = await loadPullRequestDetailPage({
      identity,
      connection: "commits",
      after: "commit-page-2",
      options: { executable: fakeGh },
    })
    expect(current).not.toBeNull()
    expect(page).not.toBeNull()
    if (!current || !page) throw new Error("fixture details missing")
    const merged = mergePullRequestDetailPage(current, page, "commits")
    expect(merged.commits.map((commit) => commit.sha)).toEqual(["abc123", "def456"])
    expect(merged.pages.commits).toMatchObject({ totalCount: 2, hasNextPage: false })
  })
})

describe("Pull request session coordination", () => {
  test("loads configured repositories with bounded aggregation and auth generations", async () => {
    const root = temporaryDirectory
    const configPath = join(temporaryDirectory, "session-config.yaml")
    const config = structuredClone(DEFAULT_PULL_REQUEST_CONFIG)
    config.profiles[root] = {
      host: "github.com",
      repositories: ["team/api", "team/web"],
      sections: [{ id: "mine", title: "Mine", query: "is:open author:@me" }],
    }
    savePullRequestConfig(config, configPath)
    const environment: Record<string, string> = { FAKE_GH_VIEWER: "first-viewer" }
    const session = new PullRequestSession({
      configPath,
      transport: { executable: fakeGh, env: environment },
    })
    const first = await session.loadSection(root, "mine")
    expect(first).toMatchObject({
      status: "ready",
      totalCount: 2,
      partial: false,
      auth: { viewerLogin: "first-viewer", generation: 1 },
    })
    if (first.status === "ready") expect(first.items).toHaveLength(1)

    environment.FAKE_GH_VIEWER = "second-viewer"
    const second = await session.loadSection(root, "mine")
    expect(second).toMatchObject({
      status: "ready",
      auth: { viewerLogin: "second-viewer", generation: 2 },
    })
    session.dispose()
  })

  test("caches a section and paginates each repository cursor without duplicates", async () => {
    const root = temporaryDirectory
    const configPath = join(temporaryDirectory, "pagination-config.yaml")
    const config = structuredClone(DEFAULT_PULL_REQUEST_CONFIG)
    config.profiles[root] = {
      host: "github.com",
      repositories: ["team/api"],
      sections: [{ id: "mine", title: "Mine", query: "is:open" }],
    }
    savePullRequestConfig(config, configPath)
    const session = new PullRequestSession({
      configPath,
      transport: {
        executable: fakeGh,
        env: { FAKE_GH_PAGINATE: "1", FAKE_GH_VIEWER: "pagination-viewer" },
      },
    })
    const first = await session.loadSection(root, "mine")
    expect(first).toMatchObject({
      status: "ready",
      loadedCount: 1,
      totalCount: 2,
      hasNextPage: true,
      fromCache: false,
    })
    const cached = await session.loadSection(root, "mine")
    expect(cached).toMatchObject({ status: "ready", loadedCount: 1, fromCache: true })
    const second = await session.loadNextPage(root, "mine")
    expect(second).toMatchObject({
      status: "ready",
      loadedCount: 2,
      hasNextPage: false,
      fromCache: false,
    })
    expect(await session.refreshSections(root, ["mine"], "mine", null)).toMatchObject({
      status: "ready",
      loadedCount: 2,
      hasNextPage: false,
    })
    session.dispose()
  })

  test("refreshes every configured section while returning the active section", async () => {
    const root = temporaryDirectory
    const configPath = join(temporaryDirectory, "refresh-all-config.yaml")
    const config = structuredClone(DEFAULT_PULL_REQUEST_CONFIG)
    config.profiles[root] = {
      host: "github.com",
      repositories: ["team/api"],
      sections: [
        { id: "mine", title: "Mine", query: "is:open author:@me" },
        { id: "review", title: "Review", query: "is:open review-requested:@me" },
      ],
    }
    savePullRequestConfig(config, configPath)
    const session = new PullRequestSession({
      configPath,
      transport: { executable: fakeGh },
    })
    const refreshed = await session.refreshSections(root, ["mine", "review"], "mine", null)
    expect(refreshed).toMatchObject({ status: "ready", section: { id: "mine" } })
    expect(await session.loadSection(root, "review")).toMatchObject({
      status: "ready",
      section: { id: "review" },
      fromCache: true,
    })
    session.dispose()
  })

  test("searches the authenticated account when the profile has no repository filters", async () => {
    const session = new PullRequestSession({
      configPath: join(temporaryDirectory, "missing-config.yaml"),
      transport: { executable: fakeGh },
    })
    expect(await session.loadSection(temporaryDirectory)).toMatchObject({
      status: "ready",
      profile: { host: "github.com", repositories: [] },
      scope: { mode: "account", sourceCount: 3, partial: false },
      loadedCount: 1,
    })
    session.dispose()
  })

  test("reports a missing gh requirement without attempting auth", async () => {
    const session = new PullRequestSession({
      transport: { executable: join(temporaryDirectory, "missing-gh") },
    })
    expect(await session.loadSection(temporaryDirectory)).toEqual({
      status: "requirements",
      capabilities: { available: false, version: null, supported: false, reason: "missing" },
    })
    session.dispose()
  })
})
