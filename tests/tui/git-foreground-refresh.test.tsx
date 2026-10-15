import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { GitHubTransportError } from "../../packages/feature-git/src/services/github/transport"
import { useGitForegroundRefresh } from "../../packages/feature-git/src/ui/shared/useGitForegroundRefresh"
import { useGitRemoteDetails } from "../../packages/feature-git/src/ui/shared/useGitRemoteDetails"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test("visible remote sections refresh both list and details, and pause when inactive", async () => {
  let listReads = 0
  let detailReads = 0
  let setActive: ((active: boolean) => void) | undefined
  function Harness() {
    const [active, updateActive] = useState(true)
    setActive = updateActive
    useGitForegroundRefresh({
      active,
      sectionKey: "mine",
      dashboard: { status: "ready", cachedAt: Date.now() - 100 },
      intervalMs: 30,
      refreshList: async () => {
        listReads += 1
      },
      refreshDetails: async () => {
        detailReads += 1
      },
    })
    return <text>{active ? "active" : "inactive"}</text>
  }
  tui = await testRender(<Harness />, { width: 30, height: 5 })
  await act(async () => Bun.sleep(10))
  expect(listReads).toBeGreaterThan(0)
  expect(detailReads).toBe(listReads)
  act(() => setActive?.(false))
  const pausedAt = listReads
  await act(async () => Bun.sleep(50))
  expect(listReads).toBe(pausedAt)
  expect(detailReads).toBe(pausedAt)
  act(() => setActive?.(true))
  await act(async () => Bun.sleep(10))
  expect(listReads).toBeGreaterThan(pausedAt)
  expect(detailReads).toBe(listReads)
})

test("a quiet detail refresh shows a browser comment without clearing the preview on failure", async () => {
  let selectedBody = "old comment"
  let fail = false
  let loads = 0
  let refresh: (() => Promise<void>) | undefined
  let rerender: (() => void) | undefined
  const demoDetails = () => ({ body: "demo" })
  function Harness() {
    const [version, setVersion] = useState(0)
    rerender = () => setVersion((current) => current + 1)
    const remote = useGitRemoteDetails<{ id: string }, { body: string }, []>({
      active: true,
      item: { id: "issue-1" },
      itemKey: (item) => item.id,
      demo: false,
      demoDetails,
      createSession: () => ({
        load: async () => {
          loads += 1
          return { details: { body: "old comment" }, fromCache: false }
        },
        refresh: async () => {
          if (fail) throw new Error("offline")
          return { details: { body: selectedBody }, fromCache: false }
        },
        loadMore: async (_item, current) => current,
        cancel: () => undefined,
        dispose: () => undefined,
      }),
    })
    refresh = remote.refreshQuietly
    return (
      <text>
        {remote.state.status === "ready" ? remote.state.details.body : remote.state.status}
        {version}
      </text>
    )
  }
  tui = await testRender(<Harness />, { width: 40, height: 5 })
  await act(async () => Bun.sleep(180))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("old comment")
  selectedBody = "new browser comment"
  await act(async () => refresh?.())
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("new browser comment")
  fail = true
  await act(async () => refresh?.())
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("new browser comment")
  act(() => rerender?.())
  await tui.renderOnce()
  expect(loads).toBe(1)
})

test("a cancelled detail reload preserves the usable preview", async () => {
  let reload: (() => Promise<void>) | undefined
  const demoDetails = () => ({ body: "demo" })
  function Harness() {
    const remote = useGitRemoteDetails<{ id: string }, { body: string }, []>({
      active: true,
      item: { id: "issue-1" },
      itemKey: (item) => item.id,
      demo: false,
      demoDetails,
      createSession: () => ({
        load: async () => ({ details: { body: "latest comment" }, fromCache: false }),
        refresh: async () => {
          throw new GitHubTransportError("cancelled", "GitHub request cancelled")
        },
        loadMore: async (_item, current) => current,
        cancel: () => undefined,
        dispose: () => undefined,
      }),
    })
    reload = remote.reload
    return (
      <text>
        {remote.state.status === "ready" ? remote.state.details.body : remote.state.status}
      </text>
    )
  }
  tui = await testRender(<Harness />, { width: 40, height: 5 })
  await act(async () => Bun.sleep(180))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("latest comment")
  await act(async () => reload?.())
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("latest comment")
  expect(tui.captureCharFrame()).not.toContain("GitHub request cancelled")
})
