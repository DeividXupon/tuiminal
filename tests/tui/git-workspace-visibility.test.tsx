import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitViewer } from "../../packages/feature-git/src/GitFeatureWorkspace"

const settings = getUiSettings()
const demoKeys = ["TUIMINAL_GIT_PR_DEMO", "TUIMINAL_GIT_ISSUES_DEMO", "TUIMINAL_GIT_INBOX_DEMO"]
const environment = demoKeys.map((key) => process.env[key])
let tui: TestRendererSetup | undefined
const cleanups: Array<() => void> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
  demoKeys.forEach((key, index) => {
    const value = environment[index]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
})

function node(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return target
}

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (until()) return
  }
  throw new Error(`Git did not settle:\n${tui?.captureCharFrame()}`)
}

test.each(["compact", "framed"] as const)(
  "%s Git tabs keep their native trees mounted without painting inactive workspaces",
  async (layout) => {
    for (const key of demoKeys) process.env[key] = "1"
    updateUiSettings({ language: "pt-BR", layout })
    tui = await testRender(
      <box flexGrow={1}>
        <text content="WORKSPACE HEADER" height={1} flexShrink={0} />
        <GitViewer active />
      </box>,
      { width: 120, height: 32 },
    )
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("git-diffs-workspace")))
    const base = node("git-diffs-workspace")
    const basePaint = spyOn(base, "render")
    cleanups.push(() => basePaint.mockRestore())

    await act(async () => tui?.mockInput.pressKey("2"))
    await settle(() => tui?.captureCharFrame().includes("PULL REQUESTS · DEMO") ?? false)
    const query = node("git-pr-query")
    const pr = node("git-pr-dashboard")
    const prPaint = spyOn(pr, "render")
    cleanups.push(() => prPaint.mockRestore())
    basePaint.mockClear()
    await tui.renderOnce()
    expect(prPaint).toHaveBeenCalled()
    expect(basePaint).not.toHaveBeenCalled()
    expect(tui.renderer.root.findDescendantById(base.id)).toBe(base)

    // Preserve the selected PR section and its native query buffer on return.
    await act(async () => tui?.mockInput.pressKey("f"))
    await settle(() => tui?.captureCharFrame().includes("review-requested:@me") ?? false)
    const observed = new Map([
      [base.id, { target: base, paint: basePaint }],
      [pr.id, { target: pr, paint: prPaint }],
    ])
    for (const [key, id, marker] of [
      ["3", "git-issue-dashboard", "ISSUES · DEMO"],
      ["4", "git-inbox-dashboard", "INBOX · DEMO"],
      ["1", "git-diffs-workspace", "Nenhum repositório Git encontrado"],
      ["c", "git-compare-workspace", "[C] COMPARAR"],
      ["c", "git-diffs-workspace", "Nenhum repositório Git encontrado"],
    ] as const) {
      await act(async () => tui?.mockInput.pressKey(key))
      await settle(() => tui?.captureCharFrame().includes(marker) ?? false)
      if (!observed.has(id)) {
        const target = node(id)
        const paint = spyOn(target, "render")
        cleanups.push(() => paint.mockRestore())
        observed.set(id, { target, paint })
      }
      for (const { paint } of observed.values()) paint.mockClear()
      await tui.renderOnce()
      for (const [workspaceId, { target, paint }] of observed) {
        expect(tui.renderer.root.findDescendantById(workspaceId)).toBe(target)
        if (workspaceId === id) expect(paint).toHaveBeenCalled()
        else expect(paint).not.toHaveBeenCalled()
      }
      expect(tui.captureCharFrame()).not.toContain("PULL REQUESTS · DEMO")
      expect(tui.renderer.root.findDescendantById(query.id)).toBe(query)
      await act(async () => tui?.resize(key === "1" ? 100 : 120, 32))
      await tui.renderOnce()
      expect(tui.captureCharFrame().split("\n")[0]?.trim()).toBe("WORKSPACE HEADER")
    }
    await act(async () => tui?.mockInput.pressKey("2"))
    await settle(() => tui?.captureCharFrame().includes("review-requested:@me") ?? false)
    expect(tui.renderer.root.findDescendantById(query.id)).toBe(query)
    expect(tui.captureCharFrame().split("\n")[0]?.trim()).toBe("WORKSPACE HEADER")
  },
)
