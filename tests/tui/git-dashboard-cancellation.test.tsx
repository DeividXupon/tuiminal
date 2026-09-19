import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { DEMO_ISSUES } from "../../packages/feature-git/src/model/issue/fixtures"
import { GitHubTransportError } from "../../packages/feature-git/src/services/github/transport"
import {
  IssueSession,
  type IssueSessionResult,
} from "../../packages/feature-git/src/services/issue-session"
import { useIssueDashboard } from "../../packages/feature-git/src/ui/issue/useIssueDashboard"

let tui: TestRendererSetup | undefined
const restoreSpies: Array<() => void> = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const restore of restoreSpies.splice(0)) restore()
})

test("an Issue refresh suppresses a superseded page cancellation but reports real failures", async () => {
  const item = DEMO_ISSUES[0]
  if (!item) throw new Error("missing issue fixture")
  const section = { id: "mine", title: "My Issues", query: "is:open author:@me" }
  const ready: Extract<IssueSessionResult, { status: "ready" }> = {
    status: "ready",
    auth: { host: "github.com", viewerId: "viewer", viewerLogin: "fixture", generation: 1 },
    profile: { host: "github.com", repositories: ["equipe/api"], sections: [section] },
    section,
    items: [item],
    totalCount: 2,
    partial: true,
    hasNextPage: true,
    loadedCount: 1,
    fromCache: false,
    cachedAt: Date.now(),
    refreshSeconds: 300,
    scope: { mode: "repositories", sourceCount: 1, partial: false },
    root: process.env.TUIMINAL_WORKDIR ?? "",
  }
  let rejectPage: ((error: unknown) => void) | undefined
  let resolvePage: ((result: IssueSessionResult) => void) | undefined
  const loadSpy = spyOn(IssueSession.prototype, "loadSection").mockResolvedValue(ready)
  const pageSpy = spyOn(IssueSession.prototype, "loadNextPage").mockImplementation(
    () =>
      new Promise<IssueSessionResult>((resolve, reject) => {
        resolvePage = resolve
        rejectPage = reject
      }),
  )
  const refreshSpy = spyOn(IssueSession.prototype, "refreshSections").mockImplementation(
    async () => {
      rejectPage?.(new GitHubTransportError("cancelled", "GitHub request cancelled"))
      return { ...ready, cachedAt: Date.now() }
    },
  )
  restoreSpies.push(
    () => loadSpy.mockRestore(),
    () => pageSpy.mockRestore(),
    () => refreshSpy.mockRestore(),
  )

  let dashboard: ReturnType<typeof useIssueDashboard> | undefined
  function Harness() {
    dashboard = useIssueDashboard(true, "mine")
    return (
      <text>
        {dashboard.state.status === "ready"
          ? `ready ${dashboard.state.totalCount}`
          : dashboard.state.status}
      </text>
    )
  }
  tui = await testRender(
    <NotificationProvider>
      <Harness />
    </NotificationProvider>,
    { width: 90, height: 16 },
  )
  for (let attempt = 0; attempt < 30 && dashboard?.state.status !== "ready"; attempt += 1) {
    await act(async () => Bun.sleep(10))
  }
  expect(dashboard?.state.status).toBe("ready")

  await act(async () => {
    const page = dashboard?.loadMore()
    await dashboard?.refresh()
    await page
  })
  await tui.renderOnce()
  expect(dashboard?.state.status).toBe("ready")
  expect(dashboard?.loadingMore).toBe(false)
  expect(tui.captureCharFrame()).not.toContain("GitHub request cancelled")
  expect(refreshSpy).toHaveBeenCalledTimes(1)
  expect(pageSpy).toHaveBeenCalledTimes(1)

  refreshSpy.mockResolvedValueOnce({ ...ready, hasNextPage: false, totalCount: 99 })
  await act(async () => {
    const page = dashboard?.loadMore()
    await dashboard?.refresh()
    resolvePage?.({ ...ready, totalCount: 2 })
    await page
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("ready 99")

  refreshSpy.mockRejectedValueOnce(new GitHubTransportError("forbidden", "HTTP 403"))
  await act(async () => dashboard?.refresh())
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("HTTP 403")
})
