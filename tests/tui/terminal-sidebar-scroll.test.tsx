import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import type { TerminalSession } from "../../packages/feature-terminal/src/model/sessions"
import { TerminalSidebar } from "../../packages/feature-terminal/src/ui/TerminalSidebar"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

const sessions: TerminalSession[] = Array.from({ length: 30 }, (_, index) => ({
  id: `shell-${index}`,
  sectionId: `section-${index}`,
  folderId: "terminal",
  row: 0,
  column: 0,
  title: `Shell ${index}`,
  status: "running",
  pid: null,
  exitCode: null,
  startedAt: 0,
  kind: "shell",
  label: "Terminal",
  shortLabel: "TTY",
  displayCommand: "sh",
  command: ["sh"],
  accent: "#64d8ff",
  agent: null,
}))

test("overflowing terminal lists scroll by mouse and keyboard and reveal newly selected terminals", async () => {
  let select: (id: string) => void = () => undefined
  let refresh: () => void = () => undefined
  function Harness() {
    const [active, setActive] = useState("shell-0")
    const [items, setItems] = useState(sessions)
    select = setActive
    refresh = () => setItems((current) => current.map((item) => ({ ...item, busy: true })))
    return (
      <TerminalSidebar
        sessions={items}
        folders={[{ id: "terminal", name: "Tuiminais" }]}
        selectedFolder="terminal"
        activeSessionId={active}
        width={32}
        height={18}
        masterKey="Ctrl+B"
        autoFocus
        onActivate={setActive}
        onSelectFolder={() => undefined}
        onActions={() => undefined}
        onNew={() => undefined}
        onNewAgent={() => undefined}
      />
    )
  }
  tui = await testRender(<Harness />, { width: 32, height: 18 })
  await act(async () => tui?.renderOnce())
  const scroll = tui.renderer.root.findDescendantById(
    "terminal-sidebar-scroll",
  ) as ScrollBoxRenderable
  expect(scroll).toBeDefined()
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.viewport.height)
  const actionsY = tui.renderer.root.findDescendantById("terminal-sidebar-new")?.screenY
  expect(tui.captureCharFrame()).toContain("Shell 0")
  await act(async () => {
    await tui?.mockMouse.scroll(scroll.screenX + 2, scroll.screenY + 2, "down")
  })
  await act(async () => tui?.renderOnce())
  expect(scroll.scrollTop).toBeGreaterThan(0)
  const position = scroll.scrollTop
  await act(async () => refresh())
  await act(async () => tui?.renderOnce())
  expect(scroll.scrollTop).toBe(position)
  await act(async () => select("shell-29"))
  await act(async () => tui?.renderOnce())
  expect(tui.captureCharFrame()).toContain("Shell 29")
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-new")?.screenY).toBe(actionsY)
  await act(async () => tui?.mockInput.pressArrow("up"))
  await act(async () => tui?.renderOnce())
  await act(async () => tui?.mockInput.pressKey("enter"))
  await act(async () => tui?.renderOnce())
  expect(tui.captureCharFrame()).toContain("Shell 28")
  expect(
    tui.renderer.root.findDescendantById("terminal-sidebar-pane-shell-28")?.screenY,
  ).toBeGreaterThanOrEqual(scroll.viewport.screenY)
})
