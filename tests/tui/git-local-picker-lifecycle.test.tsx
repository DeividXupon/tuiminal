import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { GitLocalTargetPicker } from "../../packages/feature-git/src/ui/config/GitLocalTargetPicker"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

function fixture(kind: "project" | "branch") {
  updateUiSettings({ language: "pt-BR" })
  const requests: Array<{
    value: string
    finish: (saved: boolean) => void
    fail: (error: Error) => void
  }> = []
  const closures: number[] = []
  let reopen: (() => void) | undefined
  const target = {
    root: "/fixture",
    name: "fixture",
    displayPath: "/fixture",
    isRepository: true,
    branch: "development",
    branches: ["development", "feature"],
  }
  function Harness() {
    const [open, setOpen] = useState(true)
    const [instance, setInstance] = useState(0)
    reopen = () => {
      setInstance((value) => value + 1)
      setOpen(true)
    }
    const select = (value: string) =>
      new Promise<boolean>((finish, fail) => requests.push({ value, finish, fail }))
    return open ? (
      <GitLocalTargetPicker
        key={instance}
        width={92}
        kind={kind}
        target={target}
        projects={[target]}
        projectsLoading={false}
        projectError=""
        onSelectProject={select}
        onSelectBranch={select}
        onClose={() => {
          closures.push(instance)
          setOpen(false)
        }}
      />
    ) : (
      <text content="PICKER CLOSED" />
    )
  }
  return { Harness, requests, closures, reopen: () => act(() => reopen?.()) }
}

async function settle() {
  await act(async () => Bun.sleep(5))
  await tui?.renderOnce()
}

async function mount(h: ReturnType<typeof fixture>) {
  tui = await testRender(<h.Harness />, { width: 100, height: 32 })
  await settle()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("git-local-target-list")
}

test.each(["project", "branch"] as const)(
  "%s selection dispatches once for repeated Enter in one batch",
  async (kind) => {
    const h = fixture(kind)
    await mount(h)
    act(() => {
      tui?.mockInput.pressEnter()
      tui?.mockInput.pressEnter()
      tui?.mockInput.pressEnter()
    })
    expect(h.requests).toHaveLength(1)
    expect(h.requests[0]?.value).toBe(kind === "project" ? "/fixture" : "development")
    await tui?.renderOnce()
    expect(tui?.captureCharFrame()).toContain("Aplicando seleção")
    await act(async () => h.requests[0]?.finish(true))
    await settle()
    expect(h.closures).toEqual([0])
    expect(tui?.captureCharFrame()).toContain("PICKER CLOSED")
  },
)

test.each(["success", "failure"] as const)(
  "a closed selection's late %s cannot affect a replacement picker",
  async (result) => {
    const h = fixture("branch")
    await mount(h)
    act(() => tui?.mockInput.pressEnter())
    await act(async () => tui?.mockInput.pressEscape())
    await act(async () => Bun.sleep(60))
    await settle()
    expect(h.closures).toEqual([0])
    h.reopen()
    await settle()
    await act(async () =>
      result === "success"
        ? h.requests[0]?.finish(true)
        : h.requests[0]?.fail(new Error("obsolete selection")),
    )
    await settle()
    expect(h.closures).toEqual([0])
    expect(tui?.renderer.currentFocusedRenderable?.id).toBe("git-local-target-list")
    expect(tui?.captureCharFrame()).toContain("ESCOLHER BRANCH LOCAL")
    expect(tui?.captureCharFrame()).not.toContain("obsolete selection")
    act(() => tui?.mockInput.pressEnter())
    expect(h.requests).toHaveLength(2)
    await act(async () => h.requests[1]?.finish(true))
    expect(h.closures).toEqual([0, 1])
  },
)

test.each(["false", "throw"] as const)(
  "%s result releases the selection guard for an explicit retry",
  async (result) => {
    const h = fixture("project")
    await mount(h)
    act(() => tui?.mockInput.pressEnter())
    await act(async () =>
      result === "false"
        ? h.requests[0]?.finish(false)
        : h.requests[0]?.fail(new Error("fixture selection failure")),
    )
    await settle()
    expect(tui?.captureCharFrame()).toContain(
      result === "false" ? "Não foi possível aplicar a seleção." : "fixture selection failure",
    )
    expect(h.closures).toEqual([])
    act(() => tui?.mockInput.pressEnter())
    expect(h.requests).toHaveLength(2)
    await act(async () => h.requests[1]?.finish(true))
    expect(h.closures).toEqual([0])
  },
)

test("unmounting a pending selection never calls its close callback later", async () => {
  const h = fixture("project")
  await mount(h)
  act(() => tui?.mockInput.pressEnter())
  act(() => tui?.renderer.destroy())
  tui = undefined
  await act(async () => h.requests[0]?.finish(true))
  expect(h.closures).toEqual([])
})

test.each(["header", "backdrop"] as const)(
  "closing through the %s ignores a later success",
  async (control) => {
    const h = fixture("branch")
    await mount(h)
    act(() => tui?.mockInput.pressEnter())
    const button = tui?.renderer.root.findDescendantById("git-local-target-close")
    if (!button) throw new Error("Missing close button")
    await act(async () =>
      tui?.mockMouse.click(
        control === "header" ? button.screenX + 1 : 99,
        control === "header" ? button.screenY : 0,
      ),
    )
    expect(h.closures).toEqual([0])
    h.reopen()
    await settle()
    await act(async () => h.requests[0]?.finish(true))
    await settle()
    expect(h.closures).toEqual([0])
    expect(tui?.captureCharFrame()).toContain("ESCOLHER BRANCH LOCAL")
  },
)

test("clicking an input inside the dialog does not dismiss the picker", async () => {
  const h = fixture("project")
  await mount(h)
  const input = tui?.renderer.root.findDescendantById("git-local-target-search")
  if (!input) throw new Error("Missing search input")
  await act(async () => tui?.mockMouse.click(input.screenX + 1, input.screenY))
  expect(h.closures).toEqual([])
  expect(h.requests).toHaveLength(0)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("git-local-target-search")
})
