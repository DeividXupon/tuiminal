import "./setup"
import { afterEach, expect, test } from "bun:test"
import { CliRenderEvents, type ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { DEMO_ISSUES, demoIssueDetails } from "../../packages/feature-git/src/model/issue/fixtures"
import { demoPullRequestDetails } from "../../packages/feature-git/src/model/pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../../packages/feature-git/src/model/pr/fixtures"
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
  })
}

for (const kind of ["pr", "issue"] as const) {
  test(`${kind} detail pages load at the last row or scroll end, once per cursor`, async () => {
    let requests = 0
    const initial = { focused: false, selected: 0, count: 20, cursor: "page-1", loading: false }
    let change: (patch: Partial<typeof initial>) => void = noop
    function Harness() {
      const [state, setState] = useState(initial)
      change = (patch) => setState((current) => ({ ...current, ...patch }))
      const shared = {
        focused: state.focused,
        width: 90,
        scrollOffset: 0,
        descriptionExpanded: false,
        loadingMore: state.loading,
        onLoadMore: () => {
          requests++
        },
        onToggleDescription: noop,
        onOpenBrowser: noop,
        onCopyUrl: noop,
        onCopyNumber: noop,
        onReactComment: noop,
        onReplyComment: noop,
      }
      if (kind === "pr") {
        const item = DEMO_PULL_REQUESTS[0]
        if (!item) throw new Error("Missing PR fixture")
        const details = demoPullRequestDetails(item)
        const commit = details.commits[0]
        if (!commit) throw new Error("Missing commit fixture")
        details.commits = Array.from({ length: state.count }, (_, index) => ({
          ...commit,
          sha: String(index).padStart(40, "0"),
          headline: `Commit ${index}`,
        }))
        details.pages.commits = {
          totalCount: 60,
          endCursor: state.cursor,
          hasNextPage: true,
          partial: true,
        }
        return (
          <PreviewPane
            {...shared}
            item={item}
            details={{ status: "ready", details, fromCache: false }}
            activeTab="commits"
            selectedItemIndex={state.selected}
            onTabChange={noop}
            onCopySha={noop}
            onSelectItem={noop}
            onOpenDiff={noop}
            watching={false}
            onToggleWatch={noop}
            workflows={[]}
            workflowError=""
            onOpenWorkflow={noop}
          />
        )
      }
      const item = DEMO_ISSUES[0]
      if (!item) throw new Error("Missing issue fixture")
      const details = demoIssueDetails(item)
      const comment = details.comments[0]
      if (!comment) throw new Error("Missing comment fixture")
      details.comments = Array.from({ length: state.count }, (_, index) => ({
        ...comment,
        id: `comment-${index}`,
        body: `Comment ${index}`,
      }))
      details.commentPage = {
        totalCount: 60,
        endCursor: state.cursor,
        hasNextPage: true,
        partial: true,
      }
      return (
        <IssuePreviewPane
          {...shared}
          item={item}
          details={{ status: "ready", details, fromCache: false }}
          activeTab="activity"
          selectedCommentIndex={state.selected}
          onTabChange={noop}
          onSelectComment={noop}
        />
      )
    }
    tui = await testRender(<Harness />, { width: 90, height: 20 })
    await settle()
    const listeners = tui.renderer.listenerCount(CliRenderEvents.FRAME)
    act(() => change({ selected: 19 }))
    await settle()
    expect(requests).toBe(0)
    act(() => change({ focused: true }))
    await settle()
    expect(requests).toBe(1)
    expect(tui.captureCharFrame()).not.toContain("[N]")
    await settle()
    expect(requests).toBe(1)
    act(() => change({ loading: true }))
    await settle()
    expect(requests).toBe(1)
    act(() => change({ loading: false, count: 40, cursor: "page-2" }))
    await settle()
    expect(requests).toBe(1)
    const scroll = tui.renderer.root.findDescendantById(
      `git-${kind}-preview-scroll`,
    ) as ScrollBoxRenderable
    act(() => scroll.scrollTo(Math.max(0, scroll.scrollHeight - scroll.viewport.height - 1)))
    await settle()
    await act(async () =>
      tui?.mockMouse.scroll(scroll.screenX + 1, scroll.screenY + 1, "down", { delayMs: 0 }),
    )
    await settle()
    expect(requests).toBe(2)
    await settle()
    expect(requests).toBe(2)
    // Leaving the preview releases its renderer listener; retained inactive tabs do not page.
    act(() => change({ focused: false, cursor: "page-3" }))
    await settle()
    expect(requests).toBe(2)
    expect(tui.renderer.listenerCount(CliRenderEvents.FRAME)).toBe(listeners)
  })
}
