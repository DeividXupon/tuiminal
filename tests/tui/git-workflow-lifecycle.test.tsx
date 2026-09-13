import "./setup"
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { DEMO_PULL_REQUESTS } from "../../src/features/git/model/pr/fixtures"
import type { PullRequestSummary } from "../../src/features/git/model/pr/types"
import type { PullRequestWorkflowRun } from "../../src/features/git/model/pr/workflows"
import * as workflows from "../../src/features/git/services/github/workflows"
import { usePullRequestWorkflows } from "../../src/features/git/ui/pr/usePullRequestWorkflows"

let tui: TestRendererSetup | undefined
const originalDemo = process.env.TUIMINAL_GIT_PR_DEMO
const cleanups: Array<() => void> = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  if (originalDemo === undefined) delete process.env.TUIMINAL_GIT_PR_DEMO
  else process.env.TUIMINAL_GIT_PR_DEMO = originalDemo
})

type Scope = { active: boolean; item: PullRequestSummary | null }
type Read = {
  signal: AbortSignal | undefined
  headSha: string
  finish: (name: string) => void
  fail: (error: Error) => void
}
function fixture() {
  delete process.env.TUIMINAL_GIT_PR_DEMO
  const first = DEMO_PULL_REQUESTS[0]
  const second = DEMO_PULL_REQUESTS[1]
  if (!first || !second) throw new Error("Missing workflow PR fixtures")
  const reads: Read[] = []
  const renders: Array<{ item: PullRequestSummary | null; runs: string[]; error: string }> = []
  const reader = spyOn(workflows, "loadPullRequestWorkflowRuns").mockImplementation(
    ({ headSha, options }) =>
      new Promise((resolve, reject) => {
        reads.push({
          signal: options?.signal,
          headSha,
          fail: reject,
          finish: (name) =>
            resolve([
              {
                id: 1,
                name,
                status: "action_required",
                conclusion: "",
                headSha,
                headRepository: "fixture/fork",
                actor: { login: "fixture" },
                event: "pull_request",
                url: "https://github.example.test/team/project/actions/runs/1",
                attempt: 1,
                eligibleForApproval: true,
                deploymentProtection: false,
              } satisfies PullRequestWorkflowRun,
            ]),
        })
      }),
  )
  cleanups.push(() => reader.mockRestore())
  let update: ((scope: Scope) => void) | undefined
  function Harness() {
    const [scope, setScope] = useState<Scope>({ active: true, item: first ?? null })
    update = setScope
    const state = usePullRequestWorkflows(scope.active, scope.item)
    renders.push({ item: scope.item, runs: state.runs.map((run) => run.name), error: state.error })
    return <text content={`${state.runs.map((run) => run.name).join(",")}|${state.error}`} />
  }
  return {
    Harness,
    first,
    second,
    reads,
    renders,
    select: (item: PullRequestSummary | null, active = true) =>
      act(() => update?.({ item, active })),
    get latest() {
      return renders.at(-1)
    },
  }
}

async function frame() {
  await act(async () => {})
  await tui?.renderOnce()
}

describe("PR workflow request ownership", () => {
  test("an older completion cannot replace the selected PR's workflows", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 80, height: 8 })
    h.select(h.second)
    expect(h.reads[0]?.signal?.aborted).toBe(true)
    await act(async () => h.reads[1]?.finish("current"))
    await act(async () => h.reads[0]?.finish("obsolete"))
    await frame()
    expect(tui.captureCharFrame()).toContain("current|")
    expect(tui.captureCharFrame()).not.toContain("obsolete")
  })

  test("never exposes a previous PR's eligible runs during the next render", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 80, height: 8 })
    await act(async () => h.reads[0]?.finish("previous"))
    h.select(h.second)
    const next = h.renders.filter((render) => render.item === h.second)
    expect(next.length).toBeGreaterThan(0)
    expect(next.every((render) => render.runs.length === 0 && render.error === "")).toBe(true)
    await frame()
    expect(tui.captureCharFrame()).not.toContain("previous")
  })

  test("clears errors for a new selection and ignores the previous failure", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 80, height: 8 })
    await act(async () => h.reads[0]?.fail(new Error("previous error")))
    h.select(h.second)
    expect(h.latest?.error).toBe("")
    h.select(h.first)
    await act(async () => h.reads[2]?.finish("current"))
    await act(async () => h.reads[1]?.fail(new Error("obsolete error")))
    expect(h.latest).toMatchObject({ runs: ["current"], error: "" })
  })

  test.each(["inactive", "empty", "demo"] as const)(
    "hides and aborts pending runs in the %s state",
    async (mode) => {
      const h = fixture()
      tui = await testRender(<h.Harness />, { width: 80, height: 8 })
      if (mode === "demo") process.env.TUIMINAL_GIT_PR_DEMO = "1"
      h.select(mode === "empty" ? null : h.first, mode !== "inactive")
      expect(h.reads[0]?.signal?.aborted).toBe(true)
      await act(async () => h.reads[0]?.finish("obsolete"))
      expect(h.latest).toMatchObject({ runs: [], error: "" })
      expect(h.reads).toHaveLength(1)
    },
  )

  test("reactivating the same PR starts fresh without exposing the old result", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 80, height: 8 })
    await act(async () => h.reads[0]?.finish("previous"))
    h.select(h.first, false)
    h.renders.length = 0
    h.select(h.first)
    expect(h.reads).toHaveLength(2)
    expect(h.renders.every((render) => render.runs.length === 0)).toBe(true)
    await act(async () => h.reads[1]?.finish("fresh"))
    expect(h.latest?.runs).toEqual(["fresh"])
  })

  test("a changed head has a separate request and unchanged renders do not refetch", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 80, height: 8 })
    h.select(h.first)
    expect(h.reads).toHaveLength(1)
    const changed = { ...h.first, headSha: "new-head" }
    h.select(changed)
    expect(h.reads[1]?.headSha).toBe("new-head")
    await act(async () => h.reads[1]?.finish("fresh"))
    await act(async () => h.reads[0]?.finish("old head"))
    expect(h.latest?.runs).toEqual(["fresh"])
    act(() => tui?.renderer.destroy())
    tui = undefined
    expect(h.reads[1]?.signal?.aborted).toBe(true)
  })
})
