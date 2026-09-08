import { describe, expect, test } from "bun:test"
import {
  preparePullRequestAction,
  transitionPullRequestAction,
} from "../src/features/git/model/pr/actions"
import { DEMO_PERMISSION_DENIED, DEMO_PULL_REQUESTS } from "../src/features/git/model/pr/fixtures"
import {
  adjacentPreviewTab,
  movePullRequestIndex,
  nextPullRequestPreviewPosition,
  pullRequestNavigationAction,
  pullRequestWorkspaceAction,
  resolvePullRequestLayout,
} from "../src/features/git/model/pr/navigation"
import {
  buildEffectivePullRequestQueries,
  normalizePullRequestQuery,
  pullRequestIdentityKey,
  samePullRequestIdentity,
  validatePullRequestIdentity,
} from "../src/features/git/model/pr/query"
import {
  createPullRequestSectionId,
  duplicatePullRequestSection,
  makePullRequestSection,
  movePullRequestSection,
  removePullRequestSection,
  updatePullRequestSection,
} from "../src/features/git/model/pr/sections"
import type { PullRequestAuthContext } from "../src/features/git/model/pr/types"
import {
  DEFAULT_GIT_WORKSPACE_TAB,
  gitWorkspaceTabForKey,
} from "../src/features/git/model/workspace"
import { pullRequestDashboardPresentation } from "../src/features/git/ui/pr/presentation"

const identity = DEMO_PULL_REQUESTS[0]?.identity ?? {
  host: "github.com",
  nodeId: "missing-fixture",
  owner: "missing",
  repository: "fixture",
  number: 1,
  url: "https://github.com/missing/fixture/pull/1",
}
const auth: PullRequestAuthContext = {
  host: "github.com",
  viewerId: "viewer-1",
  viewerLogin: "deivid",
  generation: 3,
}

describe("Git Diffs/PR workspace", () => {
  test("keeps terminal GitHub failures consistent between header and state panel", () => {
    expect(
      pullRequestDashboardPresentation(
        {
          status: "requirements",
          capabilities: {
            available: false,
            version: null,
            supported: false,
            reason: "missing",
          },
        },
        0,
      ).meta,
    ).toBe("GITHUB CLI NÃO ENCONTRADO")
    expect(
      pullRequestDashboardPresentation(
        { status: "error", kind: "not-authenticated", error: "fixture" },
        0,
      ).meta,
    ).toBe("AUTENTICAÇÃO GITHUB NECESSÁRIA")
  })

  test("opens on Diffs and maps only local number shortcuts", () => {
    expect(DEFAULT_GIT_WORKSPACE_TAB).toBe("base")
    expect(gitWorkspaceTabForKey("1")).toBe("base")
    expect(gitWorkspaceTabForKey("2")).toBe("pr")
    expect(gitWorkspaceTabForKey("#")).toBeNull()
  })

  test("resolves the three responsive PR compositions", () => {
    expect(resolvePullRequestLayout(140, 30)).toBe("side-by-side")
    expect(resolvePullRequestLayout(90, 24)).toBe("stacked")
    expect(resolvePullRequestLayout(60, 18)).toBe("single")
    expect(resolvePullRequestLayout(100, 24, "right")).toBe("side-by-side")
    expect(resolvePullRequestLayout(100, 24, "bottom")).toBe("stacked")
    expect(resolvePullRequestLayout(70, 18, "bottom")).toBe("single")
    expect(nextPullRequestPreviewPosition("auto")).toBe("right")
    expect(nextPullRequestPreviewPosition("right")).toBe("bottom")
    expect(nextPullRequestPreviewPosition("bottom")).toBe("auto")
  })

  test("bounds rows and cycles preview tabs", () => {
    expect(movePullRequestIndex(0, 3, -1)).toBe(0)
    expect(movePullRequestIndex(2, 3, 1)).toBe(2)
    expect(adjacentPreviewTab("overview", -1)).toBe("files")
    expect(adjacentPreviewTab("files", 1)).toBe("overview")
  })

  test("maps list, preview and section navigation without UI state", () => {
    expect(
      pullRequestNavigationAction({ keyName: "j", focus: "list", hasSelection: true }),
    ).toEqual({ type: "move-row", delta: 1 })
    expect(
      pullRequestNavigationAction({ keyName: "l", focus: "list", hasSelection: true }),
    ).toEqual({ type: "focus", target: "preview" })
    expect(
      pullRequestNavigationAction({ keyName: "h", focus: "preview", hasSelection: true }),
    ).toEqual({ type: "focus", target: "list" })
    expect(
      pullRequestNavigationAction({ keyName: ".", shift: true, focus: "list", hasSelection: true }),
    ).toEqual({ type: "move-section", delta: 1 })
    expect(
      pullRequestWorkspaceAction({
        keyName: "/",
        focus: "list",
        hasSelection: true,
      }),
    ).toEqual({ type: "edit-query" })
    expect(
      pullRequestWorkspaceAction({
        keyName: "+",
        focus: "list",
        hasSelection: true,
      }),
    ).toBeNull()
    expect(
      pullRequestWorkspaceAction({
        keyName: "e",
        ctrl: true,
        focus: "list",
        hasSelection: true,
      }),
    ).toBeNull()
    expect(
      pullRequestWorkspaceAction({
        keyName: "p",
        focus: "list",
        hasSelection: true,
      }),
    ).toEqual({ type: "toggle-preview" })
    expect(
      pullRequestWorkspaceAction({
        keyName: "d",
        ctrl: true,
        focus: "preview",
        hasSelection: true,
      }),
    ).toEqual({ type: "scroll-preview", delta: 10 })
    expect(
      pullRequestWorkspaceAction({
        keyName: "p",
        shift: true,
        focus: "list",
        hasSelection: true,
      }),
    ).toEqual({ type: "cycle-preview-position" })
    expect(
      pullRequestNavigationAction({
        keyName: "g",
        shift: true,
        focus: "list",
        hasSelection: true,
      }),
    ).toEqual({ type: "select-edge", target: "last" })
  })
})

describe("Pull request queries and identity", () => {
  test("preserves whitespace inside quoted filters", () => {
    expect(normalizePullRequestQuery('  is:open   label:"help  wanted"  ')).toBe(
      'is:open label:"help  wanted"',
    )
  })

  test("builds one explicit query per repository", () => {
    expect(
      buildEffectivePullRequestQueries({
        query: "is:open author:@me",
        repositories: ["equipe/api", "equipe/web"],
      }),
    ).toEqual([
      {
        repository: "equipe/api",
        query: "is:pr is:open author:@me archived:false repo:equipe/api",
      },
      {
        repository: "equipe/web",
        query: "is:pr is:open author:@me archived:false repo:equipe/web",
      },
    ])
  })

  test("scopes broad account queries to the viewer and organizations", () => {
    expect(
      buildEffectivePullRequestQueries({
        query: "a",
        repositories: [],
        accountScope: {
          viewerLogin: "deivid",
          organizations: ["brbtc"],
          repositories: ["external/collaboration"],
        },
      }),
    ).toEqual([
      { repository: null, query: "is:pr a archived:false user:deivid" },
      { repository: null, query: "is:pr a archived:false org:brbtc" },
      {
        repository: "external/collaboration",
        query: "is:pr a archived:false repo:external/collaboration",
      },
    ])
  })

  test("keeps viewer and explicit repository queries global", () => {
    const accountScope = { viewerLogin: "deivid", organizations: ["brbtc"] }
    expect(
      buildEffectivePullRequestQueries({
        query: "is:open author:@me",
        repositories: [],
        accountScope,
      }),
    ).toEqual([{ repository: null, query: "is:pr is:open author:@me archived:false" }])
    expect(
      buildEffectivePullRequestQueries({
        query: "is:open repo:cli/cli",
        repositories: [],
        accountScope,
      }),
    ).toEqual([{ repository: null, query: "is:pr is:open repo:cli/cli archived:false" }])
    expect(() =>
      buildEffectivePullRequestQueries({
        query: "a",
        repositories: [],
        accountScope: { viewerLogin: "deivid query:injection", organizations: [] },
      }),
    ).toThrow("Invalid GitHub account")
  })

  test("rejects conflicting or malformed scopes", () => {
    expect(() => buildEffectivePullRequestQueries({ query: "is:issue", repositories: [] })).toThrow(
      "is:issue",
    )
    expect(() =>
      buildEffectivePullRequestQueries({ query: "repo:other/repo", repositories: ["team/repo"] }),
    ).toThrow("structured repository scope")
    expect(() =>
      buildEffectivePullRequestQueries({ query: "is:open", repositories: ["missing-owner"] }),
    ).toThrow("Invalid repository")
  })

  test("uses host and node id instead of the PR number alone", () => {
    const sameNode = { ...identity, owner: "renamed-owner", repository: "renamed-repo" }
    const otherHost = {
      ...identity,
      host: "github.enterprise.test",
      url: "https://github.enterprise.test/equipe/api/pull/142",
    }
    expect(validatePullRequestIdentity(identity)).toBe(true)
    expect(pullRequestIdentityKey(identity)).toBe("github.com:PR_demo_api_142")
    expect(samePullRequestIdentity(identity, sameNode)).toBe(true)
    expect(samePullRequestIdentity(identity, otherHost)).toBe(false)
    expect(
      validatePullRequestIdentity({ ...identity, url: "http://github.com/equipe/api/pull/142" }),
    ).toBe(false)
  })
})

describe("Prepared pull request actions", () => {
  test("pins the auth generation and head SHA before execution", () => {
    const prepared = preparePullRequestAction({
      actionId: "action-1",
      kind: "approve",
      target: identity,
      expectedHeadSha: "head-1",
      auth,
      payload: { body: "Aprovado" },
    })
    expect(
      transitionPullRequestAction(prepared, {
        type: "execute",
        auth: { ...auth, generation: 4 },
        currentHeadSha: "head-1",
      }),
    ).toMatchObject({ status: "rejected", reason: "auth-context-changed" })
    expect(
      transitionPullRequestAction(prepared, {
        type: "execute",
        auth,
        currentHeadSha: "head-2",
      }),
    ).toMatchObject({ status: "rejected", reason: "head-changed" })
  })

  test("records confirmed and uncertain outcomes without automatic retries", () => {
    const prepared = preparePullRequestAction({
      actionId: "action-2",
      kind: "comment",
      target: identity,
      expectedHeadSha: "head-1",
      auth,
    })
    const executing = transitionPullRequestAction(prepared, {
      type: "execute",
      auth,
      currentHeadSha: "head-1",
    })
    expect(executing.status).toBe("executing")
    expect(
      transitionPullRequestAction(executing, { type: "confirm", message: "comment-created" }),
    ).toMatchObject({ status: "confirmed", message: "comment-created" })
    expect(
      transitionPullRequestAction(executing, { type: "uncertain", reason: "timeout" }),
    ).toMatchObject({ status: "uncertain", reason: "timeout" })
  })

  test("covers open, draft, merged, closed, fork and denied fixtures", () => {
    expect(new Set(DEMO_PULL_REQUESTS.map((item) => item.state))).toEqual(
      new Set(["open", "draft", "merged", "closed"]),
    )
    expect(DEMO_PULL_REQUESTS.some((item) => item.isFork)).toBe(true)
    expect(DEMO_PERMISSION_DENIED.reason).toBe("viewer-lacks-actions-write-permission")
  })
})

describe("Pull request sections", () => {
  const sections = [
    { id: "mine", title: "Meus PRs", query: "is:open author:@me" },
    { id: "review", title: "Revisar", query: "is:open review-requested:@me" },
  ]

  test("creates stable unique ids and normalizes values", () => {
    expect(createPullRequestSectionId("  Minha Equipe  ", sections)).toBe("minha-equipe")
    expect(
      makePullRequestSection({
        title: "Meus PRs",
        query: ' is:open   label:"good first" ',
        sections,
      }),
    ).toEqual({ id: "meus-prs", title: "Meus PRs", query: 'is:open label:"good first"' })
    expect(
      createPullRequestSectionId("Meus PRs", [
        ...sections,
        { id: "meus-prs", title: "Meus PRs", query: "is:open" },
      ]),
    ).toBe("meus-prs-2")
  })

  test("updates, duplicates, reorders and protects the last section", () => {
    const updated = updatePullRequestSection(sections, "mine", {
      title: "Criados por mim",
      query: "is:open author:@me",
    })
    expect(updated[0]?.title).toBe("Criados por mim")
    const duplicated = duplicatePullRequestSection(updated, "mine")
    expect(duplicated[1]).toMatchObject({ title: "Criados por mim (cópia)" })
    const duplicatedId = duplicated[1]?.id ?? "missing"
    expect(movePullRequestSection(duplicated, duplicatedId, 1)[2]?.id).toBe(duplicatedId)
    expect(removePullRequestSection(duplicated, "mine")).toHaveLength(2)
    expect(() =>
      removePullRequestSection(
        [{ id: "mine", title: "Meus PRs", query: "is:open author:@me" }],
        "mine",
      ),
    ).toThrow("one section")
  })
})
