import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { DEMO_ISSUES, demoIssueDetails } from "../../packages/feature-git/src/model/issue/fixtures"
import { DEMO_PULL_REQUESTS } from "../../packages/feature-git/src/model/pr/fixtures"
import { demoPullRequestDetails } from "../../packages/feature-git/src/model/pr/detail-fixtures"
import { IssuePreviewPane } from "../../packages/feature-git/src/ui/issue/IssuePreviewPane"
import { PreviewPane } from "../../packages/feature-git/src/ui/pr/PreviewPane"

let tui: TestRendererSetup | undefined
const noop = () => undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
async function settle() {
  await act(async () => {
    await tui?.renderOnce()
    await Bun.sleep(10)
    await tui?.renderOnce()
  })
}

for (const kind of ["issue", "pr"] as const) {
  test(`${kind} activity keeps selection visible and pages from its actual scroll position`, async () => {
    let change: (index: number, offset?: number) => void = noop
    const issue = DEMO_ISSUES[0]
    const pr = DEMO_PULL_REQUESTS[0]
    if (!issue || !pr) throw new Error("Missing fixtures")
    const issueDetails = demoIssueDetails(issue)
    const prDetails = demoPullRequestDetails(pr)
    const comments = Array.from({ length: 30 }, (_, index) => ({
      id: `comment-${index}`,
      author: { login: `person${index}` },
      body: `Comment ${index}\n\nBody line one\n\nBody line two`,
      url: `${issue.identity.url}#issuecomment-${index + 1}`,
      createdAt: "2026-09-08T10:00:00Z",
      updatedAt: "2026-09-08T10:00:00Z",
      reactionCount: 0,
    }))
    issueDetails.comments = comments
    prDetails.comments = comments
    prDetails.reviews = []
    prDetails.timeline = []
    function Harness() {
      const [selection, select] = useState({ index: 0, offset: 0 })
      change = (index, offset = 0) => select({ index, offset })
      const shared = {
        activeTab: "activity" as const,
        focused: true,
        width: 90,
        scrollOffset: selection.offset,
        descriptionExpanded: false,
        onToggleDescription: noop,
        onOpenBrowser: noop,
        onCopyUrl: noop,
        onCopyNumber: noop,
        loadingMore: false,
        onLoadMore: noop,
        onReactComment: noop,
        onReplyComment: noop,
        onTabChange: noop,
      }
      return kind === "issue" ? (
        <IssuePreviewPane
          {...shared}
          item={issue ?? null}
          details={{ status: "ready", details: issueDetails, fromCache: false }}
          selectedCommentIndex={selection.index}
          onSelectComment={noop}
        />
      ) : (
        <PreviewPane
          {...shared}
          item={pr ?? null}
          details={{ status: "ready", details: prDetails, fromCache: false }}
          selectedItemIndex={selection.index}
          onSelectItem={noop}
          onCopySha={noop}
          onOpenDiff={noop}
          watching={false}
          onToggleWatch={noop}
          workflows={[]}
          workflowError=""
          onOpenWorkflow={noop}
        />
      )
    }
    tui = await testRender(<Harness />, { width: 90, height: 20 })
    await settle()
    const scroll = tui.renderer.root.findDescendantById(
      `git-${kind}-preview-scroll`,
    ) as ScrollBoxRenderable
    act(() => change(15))
    await settle()
    const selected = tui.renderer.root.findDescendantById(`git-${kind}-activity-15`)
    if (!selected) throw new Error("Missing selected comment")
    expect(selected.screenY).toBeGreaterThanOrEqual(scroll.viewport.screenY)
    expect(selected.screenY + selected.height).toBeLessThanOrEqual(
      scroll.viewport.screenY + scroll.viewport.height,
    )
    const followed = scroll.scrollTop
    expect(followed).toBeGreaterThan(50)
    act(() => change(15, -10))
    await settle()
    expect(scroll.scrollTop).toBe(followed - 10)
    act(() => change(15, 0))
    await settle()
    expect(scroll.scrollTop).toBe(followed)
    act(() => scroll.scrollTo(0))
    await settle()
    expect(scroll.scrollTop).toBe(0)
    act(() => change(16, 0))
    await settle()
    expect(tui.captureCharFrame()).toContain("person16")
  })
}
