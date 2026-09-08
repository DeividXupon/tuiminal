import { describe, expect, test } from "bun:test"
import {
  beginIssueAction,
  issueActionAvailability,
  issueActionKindForShortcut,
  issueMutationWasReconciled,
  prepareIssueAction,
} from "../src/features/git/model/issue/actions"
import { DEMO_ISSUES, demoIssueDetails } from "../src/features/git/model/issue/fixtures"
import {
  adjacentIssuePreviewTab,
  type IssueFocus,
  issueWorkspaceAction,
  moveIssueIndex,
  nextIssuePreviewPosition,
  resolveIssueLayout,
} from "../src/features/git/model/issue/navigation"
import {
  buildEffectiveIssueQueries,
  issueIdentityKey,
  normalizeIssueQuery,
  validateIssueIdentity,
} from "../src/features/git/model/issue/query"
import {
  createIssueSectionId,
  duplicateIssueSection,
  issueSectionManagerAction,
  makeIssueSection,
  moveIssueSection,
  parseIssueSectionOptions,
  removeIssueSection,
  updateIssueSection,
} from "../src/features/git/model/issue/sections"
import type { IssueAuthContext } from "../src/features/git/model/issue/types"
import { gitWorkspaceTabForKey } from "../src/features/git/model/workspace"

const item = (() => {
  const candidate = DEMO_ISSUES[0]
  if (!candidate) throw new Error("missing issue fixture")
  return candidate
})()
const auth: IssueAuthContext = {
  host: "github.com",
  viewerId: "viewer-1",
  viewerLogin: "deivid",
  generation: 3,
}

describe("Git Issues workspace model", () => {
  test("adds Issues as the third lazy Git destination", () => {
    expect(gitWorkspaceTabForKey("1")).toBe("base")
    expect(gitWorkspaceTabForKey("2")).toBe("pr")
    expect(gitWorkspaceTabForKey("3")).toBe("issues")
    expect(gitWorkspaceTabForKey("#")).toBeNull()
  })

  test("resolves gh-dash-like responsive list and preview layouts", () => {
    expect(resolveIssueLayout(140, 30)).toBe("side-by-side")
    expect(resolveIssueLayout(90, 24)).toBe("stacked")
    expect(resolveIssueLayout(60, 18)).toBe("single")
    expect(resolveIssueLayout(100, 24, "right")).toBe("side-by-side")
    expect(resolveIssueLayout(100, 24, "bottom")).toBe("stacked")
    expect(nextIssuePreviewPosition("auto")).toBe("right")
    expect(nextIssuePreviewPosition("right")).toBe("bottom")
    expect(nextIssuePreviewPosition("bottom")).toBe("auto")
  })

  test("maps section, list, preview and Issue actions without UI state", () => {
    const action = (
      key: { name: string; shift?: boolean; ctrl?: boolean },
      focus: IssueFocus = "list",
    ) =>
      issueWorkspaceAction({
        key,
        focus,
        hasSelection: true,
        canConfigure: true,
        canLoadMore: true,
        canLoadPreview: true,
      })
    expect(action({ name: "j" })).toEqual({ type: "move-row", delta: 1 })
    expect(action({ name: "l" })).toEqual({ type: "focus", target: "preview" })
    expect(action({ name: "l", shift: true })).toEqual({
      type: "prepare-action",
      kind: "labels",
    })
    expect(action({ name: "c" })).toEqual({ type: "prepare-action", kind: "comment" })
    expect(action({ name: "c", shift: true })).toEqual({
      type: "prepare-action",
      kind: "checkout",
    })
    expect(action({ name: "x" })).toEqual({ type: "prepare-action", kind: "close" })
    expect(action({ name: "x", shift: true })).toEqual({
      type: "prepare-action",
      kind: "reopen",
    })
    expect(action({ name: "n" }, "preview")).toEqual({ type: "load-preview-more" })
    expect(action({ name: "escape" }, "preview")).toEqual({ type: "focus", target: "list" })
    expect(moveIssueIndex(0, 3, -1)).toBe(0)
    expect(moveIssueIndex(2, 3, 1)).toBe(2)
    expect(adjacentIssuePreviewTab("overview", -1)).toBe("activity")
  })

  test("maps every shortcut displayed by the Issue action menu", () => {
    expect(issueActionKindForShortcut({ name: "c" })).toBe("comment")
    expect(issueActionKindForShortcut({ name: "a" })).toBe("assign")
    expect(issueActionKindForShortcut({ name: "a", shift: true })).toBe("unassign")
    expect(issueActionKindForShortcut({ name: "l", shift: true })).toBe("labels")
    expect(issueActionKindForShortcut({ name: "c", shift: true })).toBe("checkout")
    expect(issueActionKindForShortcut({ name: "x" })).toBe("close")
    expect(issueActionKindForShortcut({ name: "x", shift: true })).toBe("reopen")
    expect(issueActionKindForShortcut({ name: "l" })).toBeNull()
  })
})

describe("Issue queries and identity", () => {
  test("preserves quoted whitespace and enforces is:issue", () => {
    expect(normalizeIssueQuery('  is:open   label:"help  wanted"  ')).toBe(
      'is:open label:"help  wanted"',
    )
    expect(
      buildEffectiveIssueQueries({
        query: "is:open author:@me",
        repositories: ["team/api", "team/web"],
      }),
    ).toEqual([
      { repository: "team/api", query: "is:issue is:open author:@me archived:false repo:team/api" },
      { repository: "team/web", query: "is:issue is:open author:@me archived:false repo:team/web" },
    ])
  })

  test("scopes broad queries to account owners and direct collaborations", () => {
    expect(
      buildEffectiveIssueQueries({
        query: "label:bug",
        repositories: [],
        accountScope: {
          viewerLogin: "deivid",
          organizations: ["brbtc"],
          repositories: ["external/project"],
        },
      }),
    ).toEqual([
      { repository: null, query: "is:issue label:bug archived:false user:deivid" },
      { repository: null, query: "is:issue label:bug archived:false org:brbtc" },
      {
        repository: "external/project",
        query: "is:issue label:bug archived:false repo:external/project",
      },
    ])
    expect(
      buildEffectiveIssueQueries({
        query: "is:open assignee:@me",
        repositories: [],
        accountScope: { viewerLogin: "deivid", organizations: ["brbtc"] },
      }),
    ).toEqual([{ repository: null, query: "is:issue is:open assignee:@me archived:false" }])
  })

  test("rejects PR searches, conflicting scopes and malformed identities", () => {
    expect(() => buildEffectiveIssueQueries({ query: "is:pr", repositories: [] })).toThrow("is:pr")
    expect(() =>
      buildEffectiveIssueQueries({ query: "repo:other/repo", repositories: ["team/api"] }),
    ).toThrow("structured repository scope")
    expect(validateIssueIdentity(item.identity)).toBe(true)
    expect(issueIdentityKey(item.identity)).toBe("github.com:I_demo_api_318")
    expect(
      validateIssueIdentity({ ...item.identity, url: "http://github.com/team/api/issues/318" }),
    ).toBe(false)
  })
})

describe("Prepared Issue actions", () => {
  test("pins auth, target update and state before a write", () => {
    const prepared = prepareIssueAction({
      actionId: "action-1",
      kind: "close",
      target: item.identity,
      expectedUpdatedAt: item.updatedAt,
      expectedState: item.state,
      auth,
    })
    const details = demoIssueDetails(item)
    expect(beginIssueAction(prepared, { ...auth, generation: 4 }, details)).toMatchObject({
      status: "rejected",
      reason: "auth-context-changed",
    })
    expect(beginIssueAction(prepared, auth, { ...details, updatedAt: "later" })).toMatchObject({
      status: "rejected",
      reason: "issue-changed",
    })
    expect(beginIssueAction(prepared, auth, details)).toMatchObject({ status: "executing" })
  })

  test("derives eligibility from complete details and reconciles direct reads", () => {
    const before = demoIssueDetails(item)
    const summaryWithoutAssignees = { ...item, assignees: [] }
    expect(
      issueActionAvailability({
        kind: "unassign",
        summary: summaryWithoutAssignees,
        details: before,
        hasCheckout: false,
      }),
    ).toEqual({ enabled: true, reason: null })
    expect(
      issueActionAvailability({
        kind: "labels",
        summary: item,
        details: { ...before, metadataComplete: false },
        hasCheckout: false,
      }),
    ).toEqual({ enabled: false, reason: "details-partial" })
    const comment = prepareIssueAction({
      actionId: "comment",
      kind: "comment",
      target: item.identity,
      expectedUpdatedAt: item.updatedAt,
      expectedState: item.state,
      auth,
      payload: { body: "integrated" },
    })
    if (comment.status !== "prepared") throw new Error("action was not prepared")
    expect(
      issueMutationWasReconciled({
        action: comment.action,
        before,
        after: {
          ...before,
          comments: [
            ...before.comments,
            {
              id: "new",
              author: { login: "deivid" },
              body: "integrated",
              createdAt: "2026-09-07T10:00:00Z",
              updatedAt: "2026-09-07T10:00:00Z",
              url: `${item.identity.url}#issuecomment-new`,
              reactionCount: 0,
            },
          ],
        },
        viewerLogin: "deivid",
      }),
    ).toBe(true)
  })
})

describe("Issue sections", () => {
  const sections = [
    { id: "created", title: "Criadas", query: "is:open author:@me" },
    { id: "assigned", title: "Atribuídas", query: "is:open assignee:@me" },
  ]

  test("creates, edits, duplicates, reorders and protects the last section", () => {
    expect(createIssueSectionId("Minha Equipe", sections)).toBe("minha-equipe")
    expect(
      makeIssueSection({ title: "Criadas", query: " is:open  label:bug ", sections }),
    ).toMatchObject({ id: "criadas", query: "is:open label:bug" })
    expect(
      updateIssueSection(sections, "created", { title: "Minhas", query: "is:open" })[0],
    ).toMatchObject({ id: "created", title: "Minhas" })
    expect(duplicateIssueSection(sections, "created")).toHaveLength(3)
    expect(moveIssueSection(sections, "created", 1).map((section) => section.id)).toEqual([
      "assigned",
      "created",
    ])
    expect(removeIssueSection(sections, "created")).toHaveLength(1)
    expect(() => removeIssueSection(sections.slice(0, 1), "created")).toThrow("one section")
  })

  test("validates columns/sort/limit and keeps Alt reordering reachable", () => {
    expect(
      parseIssueSectionOptions({ columns: "title,labels,title", sort: "number-asc", limit: "30" }),
    ).toEqual({ columns: ["title", "labels"], sort: "number-asc", limit: 30 })
    expect(() =>
      parseIssueSectionOptions({ columns: "bad", sort: "updated-desc", limit: "20" }),
    ).toThrow("valid column")
    expect(
      issueSectionManagerAction({
        key: { name: "down", option: true },
        tab: "sections",
        hasSelection: true,
      }),
    ).toEqual({ type: "move-section", delta: 1 })
  })
})
