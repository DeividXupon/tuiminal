import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ownsKeyboardFocus } from "../packages/core/src/keyboard/scope"
import { gitKeyboardScope } from "../packages/feature-git/src/keyboard"
import {
  inboxItemsForSection,
  mergeInboxNotifications,
  notificationBrowserUrl,
} from "../packages/feature-git/src/model/inbox/notifications"
import { DEMO_INBOX_NOTIFICATIONS } from "../packages/feature-git/src/model/inbox/fixtures"
import {
  applyGitHubQuerySuggestion,
  githubQuerySuggestions,
} from "../packages/feature-git/src/model/query-autocomplete"
import { shouldLoadNextPage } from "../packages/feature-git/src/model/remote-pagination"
import { gitWorkspaceTabForKey } from "../packages/feature-git/src/model/workspace"
import {
  loadNotificationsPage,
  markNotificationDone,
  markNotificationRead,
  openNotificationInBrowser,
  unsubscribeNotification,
} from "../packages/feature-git/src/services/github/notifications"
import { loadInboxSubjectStates } from "../packages/feature-git/src/services/github/notification-subject-state"
import * as subjectReader from "../packages/feature-git/src/services/github/notification-subject-state"
import { InboxSession } from "../packages/feature-git/src/services/inbox-session"
import {
  loadInboxSavedIds,
  saveInboxSavedIds,
} from "../packages/feature-git/src/storage/inbox/state"

const directory = mkdtempSync(join(tmpdir(), "tuiminal-inbox-"))
const fakeGh = join(directory, "gh")
const callLog = join(directory, "calls.jsonl")

beforeAll(() => {
  writeFileSync(
    fakeGh,
    `#!/usr/bin/env bun
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + "\\n")
if (args.includes("notifications?all=true&participating=false&per_page=2&page=1")) {
  console.log(JSON.stringify([
    { id: "1", unread: true, reason: "review_requested", updated_at: "2026-09-08T10:00:00Z", last_read_at: null, subject: { title: "Review\\u001b]52;unsafe", url: "https://api.github.com/repos/team/api/pulls/7", type: "PullRequest" }, repository: { full_name: "team/api", html_url: "https://github.com/team/api" }, url: "https://api.github.com/notifications/threads/1", subscription_url: "https://api.github.com/notifications/threads/1/subscription" },
    { id: "2", unread: false, reason: "mention", updated_at: "2026-09-07T10:00:00Z", last_read_at: "2026-09-07T11:00:00Z", subject: { title: "Issue fixture", url: "https://api.github.com/repos/team/web/issues/9", type: "Issue" }, repository: { full_name: "team/web", html_url: "https://github.com/team/web" }, url: "https://api.github.com/notifications/threads/2", subscription_url: "https://api.github.com/notifications/threads/2/subscription" }
  ]))
} else if (args.includes("repos/team/api/pulls/7")) {
  console.log(JSON.stringify({ state: "closed", draft: false, merged_at: "2026-09-08T11:00:00Z" }))
} else if (args.includes("repos/team/api/pulls/8")) {
  console.log(JSON.stringify({ state: "open", draft: true, merged_at: null }))
} else if (args.includes("repos/team/api/pulls/10")) {
  console.log(JSON.stringify({ state: "closed", draft: false, merged_at: null }))
} else if (args.includes("repos/team/web/issues/9")) {
  console.log(JSON.stringify({ state: "closed" }))
} else if (args[0] === "api" || args[0] === "pr" || args[0] === "issue" || args[0] === "browse") {
  console.log("{}")
}
`,
    "utf8",
  )
  chmodSync(fakeGh, 0o755)
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe("Git Inbox model", () => {
  test("adds Inbox as the fourth lazy Git destination", () => {
    expect(gitWorkspaceTabForKey("4")).toBe("inbox")
    expect(gitWorkspaceTabForKey("5")).toBeNull()
    expect(ownsKeyboardFocus(gitKeyboardScope, "git-inbox-action-modal")).toBe(true)
  })

  test("filters notification sections, preserves saved threads and merges pages", () => {
    const saved = new Set(["demo-103"])
    expect(
      inboxItemsForSection(DEMO_INBOX_NOTIFICATIONS, "review", saved).map((item) => item.id),
    ).toEqual(["demo-101"])
    expect(
      inboxItemsForSection(DEMO_INBOX_NOTIFICATIONS, "mentioned", saved).map((item) => item.id),
    ).toEqual(["demo-102"])
    expect(
      inboxItemsForSection(DEMO_INBOX_NOTIFICATIONS, "saved", saved).map((item) => item.id),
    ).toEqual(["demo-103"])
    expect(
      mergeInboxNotifications(DEMO_INBOX_NOTIFICATIONS, [
        { ...DEMO_INBOX_NOTIFICATIONS[0]!, title: "new" },
      ])[0]?.title,
    ).toBe("new")
  })

  test("derives browser targets and starts automatic pagination only at the end", () => {
    expect(
      notificationBrowserUrl({
        host: "github.com",
        repository: "team/api",
        subjectType: "PullRequest",
        subjectApiUrl: "https://api.github.com/repos/team/api/pulls/42",
        repositoryUrl: "",
      }),
    ).toBe("https://github.com/team/api/pull/42")
    expect(
      shouldLoadNextPage({ selectedIndex: 18, itemCount: 20, hasNextPage: true, loading: false }),
    ).toBe(false)
    expect(
      shouldLoadNextPage({ selectedIndex: 19, itemCount: 20, hasNextPage: true, loading: false }),
    ).toBe(true)
    expect(
      shouldLoadNextPage({ selectedIndex: 19, itemCount: 20, hasNextPage: true, loading: true }),
    ).toBe(false)
  })
})

describe("GitHub query autocomplete", () => {
  test("suggests PR, Issue and profile-repository qualifiers contextually", () => {
    expect(githubQuerySuggestions({ query: "is:open rev", kind: "pr" })[0]?.value).toBe(
      "review-requested:@me",
    )
    expect(
      githubQuerySuggestions({ query: "no:", kind: "issue" }).map((item) => item.value),
    ).toEqual(["no:assignee", "no:label"])
    expect(
      githubQuerySuggestions({ query: "repo:t", kind: "pr", repositories: ["team/api"] })[0]?.value,
    ).toBe("repo:team/api")
    expect(applyGitHubQuerySuggestion("is:open rev", "review-requested:@me")).toBe(
      "is:open review-requested:@me",
    )
  })
})

describe("GitHub notification transport", () => {
  test("a retired Inbox subject read cannot publish over its replacement", async () => {
    const pending: Array<{
      signal: AbortSignal | undefined
      finish: (states: Map<string, "open" | "closed">) => void
    }> = []
    const reader = spyOn(subjectReader, "loadInboxSubjectStates").mockImplementation(
      (_items, _host, options) =>
        new Promise((resolve) => pending.push({ signal: options.signal, finish: resolve })),
    )
    const session = new InboxSession()
    try {
      const old = session.loadSubjectStates(DEMO_INBOX_NOTIFICATIONS, "github.com")
      const fresh = session.loadSubjectStates(DEMO_INBOX_NOTIFICATIONS, "github.com")
      expect(pending[0]?.signal?.aborted).toBe(true)
      pending[1]?.finish(new Map([["demo-101", "closed"]]))
      expect(await fresh).toEqual(new Map([["demo-101", "closed"]]))
      pending[0]?.finish(new Map([["demo-101", "open"]]))
      expect(await old).toBeNull()
    } finally {
      session.dispose()
      reader.mockRestore()
    }
  })

  test("resolves PR and Issue colors from exact subject reads without following untrusted URLs", async () => {
    const options = { executable: fakeGh, env: { FAKE_GH_LOG: callLog } }
    const page = await loadNotificationsPage({ host: "github.com", page: 1, perPage: 2, options })
    const pr = page.items[0]
    const issue = page.items[1]
    if (!pr || !issue) throw new Error("Missing notification fixtures")
    const items = [
      pr,
      { ...pr, id: "draft", subjectApiUrl: "https://api.github.com/repos/team/api/pulls/8" },
      { ...pr, id: "closed", subjectApiUrl: "https://api.github.com/repos/team/api/pulls/10" },
      issue,
      { ...pr, id: "other-host", subjectApiUrl: "https://example.test/repos/team/api/pulls/7" },
      { ...pr, id: "other-repo", subjectApiUrl: "https://api.github.com/repos/other/api/pulls/7" },
    ]
    const cache = new Map()
    const states = await loadInboxSubjectStates(items, "github.com", options, cache)
    expect([...states]).toEqual([
      [pr.id, "merged"],
      ["draft", "draft"],
      ["closed", "closed"],
      [issue.id, "closed"],
    ])
    const beforeCache = readFileSync(callLog, "utf8").split("\n").length
    await loadInboxSubjectStates(items, "github.com", options, cache)
    expect(readFileSync(callLog, "utf8").split("\n").length).toBe(beforeCache)
    const calls = readFileSync(callLog, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(calls).toContainEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "GET",
      "-H",
      "Accept: application/vnd.github+json",
      "repos/team/api/pulls/7",
    ])
    expect(
      calls.some(
        (args) => args.includes("example.test") || args.includes("repos/other/api/pulls/7"),
      ),
    ).toBe(false)
  })

  test("loads a bounded page, sanitizes display text and uses explicit mutation targets", async () => {
    const options = { executable: fakeGh, env: { FAKE_GH_LOG: callLog } }
    const page = await loadNotificationsPage({ host: "github.com", page: 1, perPage: 2, options })
    expect(page).toMatchObject({ page: 1, hasNextPage: true })
    expect(page.items.map((item) => item.url)).toEqual([
      "https://github.com/team/api/pull/7",
      "https://github.com/team/web/issues/9",
    ])
    expect(page.items[0]?.title).not.toContain("\u001b")
    const item = page.items[0]!
    await markNotificationRead(item, "github.com", options)
    await markNotificationDone(item, "github.com", options)
    await unsubscribeNotification(item, "github.com", options)
    await openNotificationInBrowser(item, "github.com", options)
    const calls = readFileSync(callLog, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(calls).toContainEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "PATCH",
      "notifications/threads/1",
    ])
    expect(calls).toContainEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "DELETE",
      "notifications/threads/1",
    ])
    expect(calls).toContainEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "DELETE",
      "notifications/threads/1/subscription",
    ])
    expect(calls).toContainEqual(["pr", "view", "7", "--repo", "team/api", "--web"])
  })

  test("persists only local saved thread ids with restricted permissions", () => {
    const path = join(directory, "state", "git-inbox.json")
    saveInboxSavedIds(new Set(["2", "1"]), path)
    expect([...loadInboxSavedIds(path)]).toEqual(["2", "1"])
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})
