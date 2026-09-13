import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { demoPullRequestDetails } from "../../src/features/git/model/pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../../src/features/git/model/pr/fixtures"
import * as details from "../../src/features/git/services/github/details"
import { usePullRequestWatch } from "../../src/features/git/ui/pr/usePullRequestWatch"

let tui: TestRendererSetup | undefined
let reader: ReturnType<typeof spyOn<typeof details, "loadPullRequestDetails">> | undefined
const initialDemo = process.env.TUIMINAL_GIT_PR_DEMO

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  reader?.mockRestore()
  reader = undefined
  if (initialDemo === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = initialDemo
})

test("the mounted watch passes cancellation to its reader on stop and unmount", async () => {
  delete process.env.TUIMINAL_GIT_PR_DEMO
  const item = DEMO_PULL_REQUESTS[0]
  if (!item) throw new Error("Missing PR fixture")
  const reads: Array<{
    signal: AbortSignal | undefined
    resolve: (value: ReturnType<typeof demoPullRequestDetails>) => void
  }> = []
  reader = spyOn(details, "loadPullRequestDetails").mockImplementation(
    ({ options }) => new Promise((resolve) => reads.push({ signal: options?.signal, resolve })),
  )
  let controls: ReturnType<typeof usePullRequestWatch> | undefined
  const notices: string[] = []
  function Harness() {
    controls = usePullRequestWatch((message) => notices.push(message))
    return <text content={controls.isWatching(item ?? null) ? "watching" : "stopped"} />
  }
  tui = await testRender(<Harness />, { width: 60, height: 10 })
  act(() => controls?.toggle(item))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("watching")
  expect(reads[0]?.signal?.aborted).toBe(false)
  act(() => controls?.toggle(item))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("stopped")
  expect(reads[0]?.signal?.aborted).toBe(true)
  act(() => controls?.toggle(item))
  expect(reads[1]?.signal?.aborted).toBe(false)
  const noticeCount = notices.length
  await act(async () => reads[0]?.resolve(demoPullRequestDetails(item)))
  expect(controls?.isWatching(item)).toBe(true)
  expect(notices).toHaveLength(noticeCount)
  act(() => tui?.renderer.destroy())
  tui = undefined
  expect(reads[1]?.signal?.aborted).toBe(true)
  await act(async () => reads[1]?.resolve(demoPullRequestDetails(item)))
  expect(notices).toHaveLength(noticeCount)
})
