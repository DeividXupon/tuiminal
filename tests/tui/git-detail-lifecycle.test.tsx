import "./setup"
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { demoIssueDetails, DEMO_ISSUES } from "../../src/features/git/model/issue/fixtures"
import { demoPullRequestDetails } from "../../src/features/git/model/pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../../src/features/git/model/pr/fixtures"
import { IssueDetailsSession } from "../../src/features/git/services/issue-details-session"
import { PullRequestDetailsSession } from "../../src/features/git/services/pr-details-session"
import { useIssueDetails } from "../../src/features/git/ui/issue/useIssueDetails"
import { usePullRequestDetails } from "../../src/features/git/ui/pr/usePullRequestDetails"

let tui: TestRendererSetup | undefined
const cleanups: Array<() => void> = []
const demoValues = {
  TUIMINAL_GIT_PR_DEMO: process.env.TUIMINAL_GIT_PR_DEMO,
  TUIMINAL_GIT_ISSUES_DEMO: process.env.TUIMINAL_GIT_ISSUES_DEMO,
}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  for (const [name, value] of Object.entries(demoValues)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

type State = { status: string; details?: { body: string } }
type Completion = { finish: (body: string) => void; fail: (error: Error) => void }
type Controls = {
  state: State
  loadingMore: boolean
  loadMore: () => Promise<void>
  reload: () => Promise<void>
  selectOther: () => void
}
function fixture(kind: "PR" | "Issue") {
  delete process.env.TUIMINAL_GIT_PR_DEMO
  delete process.env.TUIMINAL_GIT_ISSUES_DEMO
  let controls: Controls | undefined
  let initialReads = 0
  const pages: Completion[] = []
  const refreshes: Completion[] = []
  function View(flow: Controls) {
    controls = flow
    return (
      <text
        content={`${flow.state.status}:${flow.state.details?.body ?? ""}:${flow.loadingMore ? "busy" : "idle"}`}
      />
    )
  }
  const harness =
    kind === "PR"
      ? (() => {
          const first = DEMO_PULL_REQUESTS[0]
          const second = DEMO_PULL_REQUESTS[1]
          if (!first || !second) throw new Error("Missing PR fixtures")
          const make = (body: string) => ({ ...demoPullRequestDetails(first), body })
          const load = spyOn(PullRequestDetailsSession.prototype, "load").mockImplementation(
            async (item) => {
              initialReads += 1
              return { details: make(item === first ? "first" : "second"), fromCache: false }
            },
          )
          const page = spyOn(PullRequestDetailsSession.prototype, "loadMore").mockImplementation(
            () =>
              new Promise((resolve, reject) =>
                pages.push({ finish: (body) => resolve(make(body)), fail: reject }),
              ),
          )
          const refresh = spyOn(PullRequestDetailsSession.prototype, "refresh").mockImplementation(
            () =>
              new Promise((resolve, reject) =>
                refreshes.push({
                  finish: (body) => resolve({ details: make(body), fromCache: false }),
                  fail: reject,
                }),
              ),
          )
          cleanups.push(
            () => load.mockRestore(),
            () => page.mockRestore(),
            () => refresh.mockRestore(),
          )
          return function Harness() {
            const [item, setItem] = useState(first)
            const flow = usePullRequestDetails(true, item ?? null)
            return View({
              ...flow,
              loadMore: () => flow.loadMore("activity"),
              selectOther: () => setItem(second),
            })
          }
        })()
      : (() => {
          const first = DEMO_ISSUES[0]
          const second = DEMO_ISSUES[1]
          if (!first || !second) throw new Error("Missing issue fixtures")
          const make = (body: string) => ({ ...demoIssueDetails(first), body })
          const load = spyOn(IssueDetailsSession.prototype, "load").mockImplementation(
            async (item) => {
              initialReads += 1
              return { details: make(item === first ? "first" : "second"), fromCache: false }
            },
          )
          const page = spyOn(IssueDetailsSession.prototype, "loadMore").mockImplementation(
            () =>
              new Promise((resolve, reject) =>
                pages.push({ finish: (body) => resolve(make(body)), fail: reject }),
              ),
          )
          const refresh = spyOn(IssueDetailsSession.prototype, "refresh").mockImplementation(
            () =>
              new Promise((resolve, reject) =>
                refreshes.push({
                  finish: (body) => resolve({ details: make(body), fromCache: false }),
                  fail: reject,
                }),
              ),
          )
          cleanups.push(
            () => load.mockRestore(),
            () => page.mockRestore(),
            () => refresh.mockRestore(),
          )
          return function Harness() {
            const [item, setItem] = useState(first)
            const flow = useIssueDetails(true, item ?? null)
            return View({ ...flow, selectOther: () => setItem(second) })
          }
        })()
  return {
    Harness: harness,
    pages,
    refreshes,
    initialReads: () => initialReads,
    get flow() {
      if (!controls) throw new Error("No detail controls")
      return controls
    },
  }
}

async function settle() {
  await act(async () => Bun.sleep(180))
  await tui?.renderOnce()
}

describe.each(["PR", "Issue"] as const)("%s detail UI lifecycle", (kind) => {
  test("switching items releases pagination and ignores the old page", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    await settle()
    act(() => {
      void h.flow.loadMore()
    })
    expect(h.flow.loadingMore).toBe(true)
    act(() => h.flow.selectOther())
    await settle()
    expect(tui.captureCharFrame()).toContain("ready:second:idle")
    await act(async () => h.pages[0]?.finish("old page"))
    expect(h.flow.state.details?.body).toBe("second")
    act(() => {
      void h.flow.loadMore()
    })
    expect(h.pages).toHaveLength(2)
  })

  test("repeated pagination in one event batch dispatches only once", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    await settle()
    act(() => {
      void h.flow.loadMore()
      void h.flow.loadMore()
      void h.flow.loadMore()
    })
    expect(h.pages).toHaveLength(1)
    await act(async () => h.pages[0]?.finish("page"))
    expect(h.flow.loadingMore).toBe(false)
    expect(h.flow.state.details?.body).toBe("page")
  })

  test("refresh supersedes pending pagination without letting its result return", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    await settle()
    act(() => {
      void h.flow.loadMore()
      void h.flow.reload()
    })
    await act(async () => h.refreshes[0]?.finish("fresh"))
    await act(async () => h.pages[0]?.finish("obsolete page"))
    expect(h.flow.state.details?.body).toBe("fresh")
    expect(h.flow.loadingMore).toBe(false)
  })

  test("an explicit reload replaces the initial debounced read", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    act(() => {
      void h.flow.reload()
    })
    await act(async () => h.refreshes[0]?.finish("fresh"))
    await settle()
    expect(h.initialReads()).toBe(0)
    expect(h.flow.state.details?.body).toBe("fresh")
  })

  test("a callback retained by an old selection cannot reload the new selection", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    await settle()
    const oldReload = h.flow.reload
    const oldPage = h.flow.loadMore
    act(() => h.flow.selectOther())
    await settle()
    await act(async () => {
      await oldReload()
      await oldPage()
    })
    expect(h.refreshes).toHaveLength(0)
    expect(h.pages).toHaveLength(0)
    expect(h.flow.state.details?.body).toBe("second")
  })

  test("a stale failure cannot hide a newer successful refresh", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    await settle()
    act(() => {
      void h.flow.reload()
      void h.flow.reload()
    })
    await act(async () => h.refreshes[1]?.finish("fresh"))
    await act(async () => h.refreshes[0]?.fail(new Error("old request failed")))
    expect(h.flow.state.status).toBe("ready")
    expect(h.flow.state.details?.body).toBe("fresh")
  })

  test("a failed request releases its guard so an explicit reload can recover", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 70, height: 12 })
    await settle()
    act(() => {
      void h.flow.loadMore()
    })
    await act(async () => h.pages[0]?.fail(new Error("fixture read failed")))
    expect(h.flow.state.status).toBe("error")
    expect(h.flow.loadingMore).toBe(false)
    act(() => {
      void h.flow.reload()
    })
    await act(async () => h.refreshes[0]?.finish("recovered"))
    expect(h.flow.state.details?.body).toBe("recovered")
  })
})
