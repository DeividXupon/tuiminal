import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { demoIssueDetails, DEMO_ISSUES } from "../src/features/git/model/issue/fixtures"
import { demoPullRequestDetails } from "../src/features/git/model/pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../src/features/git/model/pr/fixtures"
import * as prReader from "../src/features/git/services/github/details"
import * as prPages from "../src/features/git/services/github/detail-pages"
import * as issueReader from "../src/features/git/services/github/issue-details"
import { IssueDetailsSession } from "../src/features/git/services/issue-details-session"
import { PullRequestDetailsSession } from "../src/features/git/services/pr-details-session"

type Read = {
  signal: AbortSignal | undefined
  finish: (body: string) => void
  fail: (error: Error) => void
}
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function harness(kind: "PR" | "Issue") {
  const reads: Read[] = []
  function pending<T>(signal: AbortSignal | undefined, value: (body: string) => T) {
    return new Promise<T>((resolve, reject) =>
      reads.push({ signal, finish: (body) => resolve(value(body)), fail: reject }),
    )
  }
  if (kind === "PR") {
    const item = DEMO_PULL_REQUESTS[0]
    if (!item) throw new Error("Missing PR fixture")
    const fixture = (body: string) => {
      const value = demoPullRequestDetails(item)
      return {
        ...value,
        body,
        pages: {
          ...value.pages,
          comments: { totalCount: 100, hasNextPage: true, endCursor: "next", partial: true },
        },
      }
    }
    const reader = spyOn(prReader, "loadPullRequestDetails").mockImplementation(({ options }) =>
      pending(options?.signal, fixture),
    )
    const pages = spyOn(prPages, "loadPullRequestDetailPage").mockImplementation(({ options }) =>
      pending(options?.signal, fixture),
    )
    const session = new PullRequestDetailsSession()
    cleanups.push(
      () => reader.mockRestore(),
      () => pages.mockRestore(),
      () => session.dispose(),
    )
    return {
      reads,
      session,
      load: () => session.load(item),
      refresh: () => session.refresh(item),
      loadChanged: () => session.load({ ...item, updatedAt: "2026-09-12T12:00:00Z" }),
      loadRevision: (revision: number) => session.load({ ...item, updatedAt: String(revision) }),
      loadOther: () =>
        session.load({ ...item, identity: { ...item.identity, nodeId: "PR_other" } }),
      more: () => session.loadMore(item, fixture("old"), "activity"),
    }
  }
  const item = DEMO_ISSUES[0]
  if (!item) throw new Error("Missing Issue fixture")
  const fixture = (body: string) => ({
    ...demoIssueDetails(item),
    body,
    commentPage: { totalCount: 100, hasNextPage: true, endCursor: "next", partial: true },
  })
  const reader = spyOn(issueReader, "loadIssueDetails").mockImplementation(({ options }) =>
    pending(options?.signal, fixture),
  )
  const session = new IssueDetailsSession()
  cleanups.push(
    () => reader.mockRestore(),
    () => session.dispose(),
  )
  return {
    reads,
    session,
    load: () => session.load(item),
    refresh: () => session.refresh(item),
    loadChanged: () => session.load({ ...item, updatedAt: "2026-09-12T12:00:00Z" }),
    loadRevision: (revision: number) => session.load({ ...item, updatedAt: String(revision) }),
    loadOther: () => session.load({ ...item, identity: { ...item.identity, nodeId: "I_other" } }),
    more: () => session.loadMore(item, fixture("old")),
  }
}

describe.each(["PR", "Issue"] as const)("%s detail lifecycle", (kind) => {
  test("an old refresh cannot overwrite a newer cached response", async () => {
    const h = harness(kind)
    const old = h.refresh().catch((error: unknown) => error)
    const fresh = h.refresh()
    expect(h.reads[0]?.signal?.aborted).toBe(true)
    h.reads[1]?.finish("fresh")
    await fresh
    h.reads[0]?.finish("stale")
    expect(await old).toMatchObject({ kind: "cancelled" })
    expect(await h.load()).toMatchObject({ fromCache: true, details: { body: "fresh" } })
    expect(h.reads).toHaveLength(2)
  })

  test.each(["cancel", "dispose"] as const)(
    "%s prevents a late response from repopulating the cache",
    async (method) => {
      const h = harness(kind)
      const old = h.refresh().catch((error: unknown) => error)
      h.session[method]()
      expect(h.reads[0]?.signal?.aborted).toBe(true)
      h.reads[0]?.finish("stale")
      expect(await old).toMatchObject({ kind: "cancelled" })
      const cache = (h.session as unknown as { cache: Map<string, unknown> }).cache
      expect(cache.size).toBe(0)
    },
  )

  test("a cache hit cancels a different pending selection", async () => {
    const h = harness(kind)
    const initial = h.load()
    h.reads[0]?.finish("cached")
    await initial
    const other = h.loadOther().catch((error: unknown) => error)
    expect(await h.load()).toMatchObject({ fromCache: true, details: { body: "cached" } })
    expect(h.reads[1]?.signal?.aborted).toBe(true)
    h.reads[1]?.finish("obsolete selection")
    expect(await other).toMatchObject({ kind: "cancelled" })
  })

  test("a stale page cannot replace a refreshed detail snapshot", async () => {
    const h = harness(kind)
    const page = h.more().catch((error: unknown) => error)
    const fresh = h.refresh()
    h.reads[1]?.finish("fresh")
    await fresh
    h.reads[0]?.finish("late page")
    expect(await page).toMatchObject({ kind: "cancelled" })
    expect(await h.load()).toMatchObject({ fromCache: true, details: { body: "fresh" } })
  })

  test("updated discussion metadata invalidates cached details without a new head", async () => {
    const h = harness(kind)
    const initial = h.load()
    h.reads[0]?.finish("old")
    await initial
    const updated = h.loadChanged()
    expect(h.reads).toHaveLength(2)
    h.reads[1]?.finish("updated comments")
    expect(await updated).toMatchObject({ fromCache: false, details: { body: "updated comments" } })
  })

  test("an old failure cannot release the replacement's cancellation controller", async () => {
    const h = harness(kind)
    const old = h.refresh().catch((error: unknown) => error)
    const replacement = h.refresh().catch((error: unknown) => error)
    h.reads[0]?.fail(new Error("old failure"))
    expect(await old).toMatchObject({ message: "old failure" })
    expect(h.reads[1]?.signal?.aborted).toBe(false)
    h.session.cancel()
    expect(h.reads[1]?.signal?.aborted).toBe(true)
    h.reads[1]?.finish("cancelled")
    expect(await replacement).toMatchObject({ kind: "cancelled" })
  })

  test("versioned details stay bounded and cache hits preserve LRU recency", async () => {
    const h = harness(kind)
    for (let index = 0; index < 32; index += 1) {
      const result = h.loadRevision(index)
      h.reads[index]?.finish(String(index))
      await result
    }
    expect(await h.loadRevision(0)).toMatchObject({ fromCache: true })
    const next = h.loadRevision(32)
    h.reads[32]?.finish("32")
    await next
    expect((h.session as unknown as { cache: Map<string, unknown> }).cache.size).toBe(32)
    expect(await h.loadRevision(0)).toMatchObject({ fromCache: true })
    const evicted = h.loadRevision(1)
    expect(h.reads).toHaveLength(34)
    h.reads[33]?.finish("reloaded")
    expect(await evicted).toMatchObject({ fromCache: false, details: { body: "reloaded" } })
  })
})
