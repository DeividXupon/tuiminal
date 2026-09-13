import "./setup"
import { afterEach, describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { COLORS, getUiSettings, updateUiSettings } from "../../src/core/settings/theme"
import { DEMO_ISSUES } from "../../src/features/git/model/issue/fixtures"
import type { IssueSummary } from "../../src/features/git/model/issue/types"
import { DEMO_PULL_REQUESTS } from "../../src/features/git/model/pr/fixtures"
import type { PullRequestSummary } from "../../src/features/git/model/pr/types"
import { IssueList } from "../../src/features/git/ui/issue/IssueList"
import { PullRequestList } from "../../src/features/git/ui/pr/PullRequestList"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const titleColumns = ["title"] as const
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

function fixture(kind: "pr" | "issue") {
  updateUiSettings({ language: "pt-BR", palette: "prime" })
  const seed = kind === "pr" ? DEMO_PULL_REQUESTS[0] : DEMO_ISSUES[0]
  if (!seed) throw new Error("Missing list fixture")
  const titleReads = Array<number>(100).fill(0)
  const initialItems = Array.from({ length: 100 }, (_, index) => ({
    ...seed,
    identity: { ...seed.identity, nodeId: `node-${index}`, number: index + 1 },
    assignees: [],
    labels: [],
    get title() {
      titleReads[index] = (titleReads[index] ?? 0) + 1
      return `Entry ${index}`
    },
  }))
  type Scope = {
    items: Array<PullRequestSummary | IssueSummary>
    selectedIndex: number
    width: number
    titlesOnly: boolean
    focused: boolean
  }
  let update: ((change: (current: Scope) => Scope) => void) | undefined
  const clicks: number[] = []
  function Harness() {
    const [state, setState] = useState<Scope>({
      items: initialItems,
      selectedIndex: 0,
      width: 160,
      titlesOnly: false,
      focused: true,
    })
    update = setState
    const props = {
      selectedIndex: state.selectedIndex,
      width: state.width,
      focused: state.focused,
      ...(state.titlesOnly ? { columns: titleColumns } : {}),
      onSelect: (index: number) => {
        clicks.push(index)
        setState((current) => ({ ...current, selectedIndex: index }))
      },
    }
    return kind === "pr" ? (
      <PullRequestList {...props} items={state.items as PullRequestSummary[]} />
    ) : (
      <IssueList {...props} items={state.items as IssueSummary[]} />
    )
  }
  return {
    Harness,
    clicks,
    change: (change: (current: Scope) => Scope) => act(() => update?.(change)),
    reset: () => {
      titleReads.fill(0)
    },
    reads: (start = 0) => titleReads.slice(start).reduce((sum, count) => sum + count, 0),
  }
}

async function frame() {
  await tui?.renderOnce()
}

describe.each(["pr", "issue"] as const)("%s list formatting", (kind) => {
  test("reuses row text when only selection, focus or the containing array changes", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 160, height: 20 })
    await frame()
    expect(h.reads()).toBe(100)
    h.reset()
    h.change((current) => ({
      ...current,
      selectedIndex: 40,
      items: [...current.items],
      focused: false,
    }))
    await frame()
    expect(h.reads()).toBe(0)
    expect(tui.captureCharFrame()).toContain("Entry 40")
    expect(tui.renderer.root.findDescendantById(`git-${kind}-row-40`)).toBeDefined()
  })

  test("invalidates changed records, widths, columns and UI language", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 160, height: 20 })
    h.reset()
    h.change((current) => ({
      ...current,
      items: current.items.map((item, index) =>
        index === 0 ? { ...item, title: "Updated entry" } : item,
      ),
    }))
    await frame()
    // React may evaluate the updater more than once; unchanged records must not be formatted.
    expect(h.reads(1)).toBe(0)
    expect(tui.captureCharFrame()).toContain("Updated entry")
    h.reset()
    h.change((current) => ({ ...current, width: 90 }))
    expect(h.reads()).toBe(99)
    h.change((current) => ({ ...current, width: 160 }))
    h.reset()
    act(() => updateUiSettings({ language: "en" }))
    h.change((current) => ({ ...current }))
    await frame()
    expect(h.reads()).toBe(99)
    expect(tui.captureCharFrame()).toContain("no assignees")
    if (kind === "issue") expect(tui.captureCharFrame()).toContain("09/06")
    h.reset()
    h.change((current) => ({ ...current, titlesOnly: true }))
    await frame()
    expect(h.reads()).toBe(99)
    expect(tui.captureCharFrame()).not.toContain("no assignees")
  })

  test("updates palette colors and mouse selection without reformatting text", async () => {
    const h = fixture(kind)
    tui = await testRender(<h.Harness />, { width: 160, height: 20 })
    h.reset()
    act(() => updateUiSettings({ palette: "nord" }))
    h.change((current) => ({ ...current }))
    await frame()
    expect(h.reads()).toBe(0)
    const span = tui
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((value) => value.text.includes("Entry 1"))
    expect(span?.fg.toInts()).toEqual(RGBA.fromHex(COLORS.text).toInts())
    const row = tui.renderer.root.findDescendantById(`git-${kind}-row-1`)
    if (!row) throw new Error("Missing second list row")
    await act(async () => tui?.mockMouse.click(row.x + 5, row.y))
    await frame()
    expect(h.clicks).toEqual([1])
    expect(h.reads()).toBe(0)
  })
})
