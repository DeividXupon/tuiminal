import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { act, useState } from "react"
import { RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { COLORS, getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import {
  TerminalSidebar,
  terminalSidebarFocusSweep,
} from "../../packages/feature-terminal/src/ui/TerminalSidebar"
import type { TerminalSession } from "../../packages/feature-terminal/src/model/sessions"
import type { AgentState } from "../../packages/feature-terminal/src/model/agent-state"

let tui: TestRendererSetup | undefined
const originalSettings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(originalSettings)
})

function session(id: string, state: AgentState): TerminalSession {
  return {
    id,
    sectionId: id,
    folderId: "terminal",
    row: 0,
    column: 0,
    title: `Task ${id}`,
    status: "running",
    pid: 123,
    exitCode: null,
    startedAt: 0,
    kind: "shell",
    label: "Terminal",
    shortLabel: "TTY",
    displayCommand: "sh",
    command: ["sh"],
    accent: "#64d8ff",
    workingDirectory: "/tmp/workspace",
    backend: "native",
    agent: {
      key: id,
      label: id,
      profile: "codex",
      state,
      activity: state === "working" ? "reading" : null,
    },
  }
}

test("sidebar separates numbered terminals from independently clickable agent status rows", async () => {
  updateUiSettings({ language: "pt-BR" })
  const selections: string[] = []
  const sessions: TerminalSession[] = [
    session("Codex", "working"),
    session("Claude", "blocked"),
    session("Gemini", "done"),
    { ...session("Shell", "idle"), agent: null, busy: true },
    { ...session("Exited", "idle"), status: "exited" },
    { ...session("Failed", "unknown"), status: "failed" },
  ]
  tui = await testRender(
    <TerminalSidebar
      sessions={sessions}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Shell"
      width={32}
      height={30}
      masterKey="Ctrl+B"
      onActivate={(id) => selections.push(id)}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 32, height: 30 },
  )
  await tui.renderOnce()
  const frame = tui.captureCharFrame()
  for (const label of ["Terminais", "Agentes", "Lendo", "Aguardando", "Concluído", "Task Claude"])
    expect(frame).toContain(label)
  const lines = frame.split("\n")
  const count = (id: string) => lines[tui!.renderer.root.findDescendantById(id)!.screenY]
  expect(count("terminal-sidebar-count")).toMatch(/Terminais\s+3/)
  expect(count("terminal-agent-count")).toMatch(/Agentes\s+3/)
  for (const id of ["Codex", "Claude", "Gemini"]) {
    expect(tui.renderer.root.findDescendantById(`terminal-sidebar-pane-${id}`)).toBeUndefined()
    expect(tui.renderer.root.findDescendantById(`terminal-sidebar-section-${id}`)).toBeUndefined()
    expect(tui.renderer.root.findDescendantById(`terminal-agent-${id}`)).toBeDefined()
  }
  for (const id of ["Shell", "Exited", "Failed"]) {
    expect(tui.renderer.root.findDescendantById(`terminal-sidebar-pane-${id}`)).toBeDefined()
    expect(tui.renderer.root.findDescendantById(`terminal-agent-${id}`)).toBeUndefined()
  }
  const agent = tui.renderer.root.findDescendantById("terminal-agent-Claude")!
  const codexAgent = tui.renderer.root.findDescendantById("terminal-agent-Codex")!
  const section = tui.renderer.root.findDescendantById("terminal-sidebar-section-Shell")!
  const folder = tui.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-folder-ai")).toBeUndefined()
  expect(section.parent).toBe(folder.parent)
  expect(section.height).toBe(2)
  expect(lines[section.screenY]).toMatch(/▌01\s+● Task Shell\s+Executando/)
  expect(lines[section.screenY + 1]).toContain("workspace · native")
  expect(agent.screenY).toBeLessThan(section.screenY)
  expect(codexAgent.height).toBe(2)
  expect(lines[codexAgent.screenY]).toMatch(/⠋ Codex\s+Lendo/)
  expect(lines[codexAgent.screenY + 1]).toContain("Task Codex")
  await act(async () => tui?.mockMouse.click(agent.screenX + 2, agent.screenY))
  expect(selections).toEqual(["Claude"])
  // Listing an unseen result never acknowledges it; only the workspace owns that transition.
  expect(sessions[2]?.agent?.state).toBe("done")
})

test("integrated Codex rows show a third activity line", async () => {
  updateUiSettings({ language: "pt-BR" })
  const codex = session("Codex", "working")
  codex.agentIntegration = "codex-app-server"
  codex.agent!.activity = "running"
  tui = await testRender(
    <TerminalSidebar
      sessions={[codex]}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Codex"
      width={32}
      height={30}
      masterKey="Ctrl+B"
      onActivate={() => undefined}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 32, height: 30 },
  )
  await tui.renderOnce()

  const row = tui.renderer.root.findDescendantById("terminal-agent-Codex")!
  const lines = tui.captureCharFrame().split("\n")
  expect(row.height).toBe(3)
  expect(lines[row.screenY + 2]).toMatch(/\.\.\.\s+\{\}\s+>_\s+txt\s+●/)
})

test("agent list separates terminal and localhost sessions", async () => {
  updateUiSettings({ language: "pt-BR" })
  const localhost = session("Localhost", "idle")
  localhost.agentIntegration = "codex-app-server"
  const terminal = session("Terminal", "unknown")
  tui = await testRender(
    <TerminalSidebar
      sessions={[localhost, terminal]}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Terminal"
      width={32}
      height={30}
      masterKey="Ctrl+B"
      onActivate={() => undefined}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 32, height: 30 },
  )
  await tui.renderOnce()

  const terminalGroup = tui.renderer.root.findDescendantById("terminal-agent-group-term")!
  const localhostGroup = tui.renderer.root.findDescendantById("terminal-agent-group-localhost")!
  const terminalRow = tui.renderer.root.findDescendantById("terminal-agent-Terminal")!
  const localhostRow = tui.renderer.root.findDescendantById("terminal-agent-Localhost")!
  const frame = tui.captureCharFrame()
  expect(frame).toContain("Local • term")
  expect(frame).toContain("Local • localhost")
  expect(terminalGroup.screenY).toBeLessThan(terminalRow.screenY)
  expect(terminalRow.screenY).toBeLessThan(localhostGroup.screenY)
  expect(localhostGroup.screenY).toBeLessThan(localhostRow.screenY)
})

test("Master Key labels only the visible agents and terminals in sidebar order", async () => {
  const sessions: TerminalSession[] = [
    session("Codex", "working"),
    { ...session("Shell", "idle"), agent: null },
    { ...session("Hidden", "idle"), agent: null, folderId: "tmux" },
  ]
  tui = await testRender(
    <TerminalSidebar
      masterKeyActive
      sessions={sessions}
      folders={[
        { id: "terminal", name: "Terminal" },
        { id: "tmux", name: "tmux" },
      ]}
      collapsedFolderIds={["tmux"]}
      selectedFolder="terminal"
      activeSessionId="Shell"
      width={40}
      height={30}
      masterKey="Ctrl+B"
      onActivate={() => undefined}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 40, height: 30 },
  )
  await tui.renderOnce()

  const frame = tui.captureCharFrame()
  expect(frame).toContain("[1]")
  expect(frame).toContain("[2]")
  expect(tui.renderer.root.findDescendantById("terminal-agent-shortcut-Codex")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-shortcut-Shell")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-shortcut-Hidden")).toBeUndefined()
})

test("focused sidebar navigates continuously from sessions into agents and opens with Enter", async () => {
  const selections: string[] = []
  let masterKeys = 0
  const sessions: TerminalSession[] = [
    { ...session("Shell1", "idle"), agent: null },
    { ...session("Shell2", "idle"), agent: null },
    session("Codex", "working"),
  ]
  tui = await testRender(
    <TerminalSidebar
      sessions={sessions}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Shell1"
      width={32}
      height={24}
      masterKey="Ctrl+B"
      onActivate={(id) => selections.push(id)}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onMasterKey={() => masterKeys++}
      onNew={() => undefined}
    />,
    { width: 32, height: 24 },
  )
  await tui.renderOnce()
  await act(async () => tui!.renderer.root.findDescendantById("terminal-sidebar")!.focus())
  await act(async () => tui!.mockInput.pressArrow("down"))
  await tui.renderOnce()
  await act(async () => tui!.mockInput.pressArrow("down"))
  await tui.renderOnce()
  await act(async () => tui!.mockInput.pressEnter())
  await act(async () => tui!.mockInput.pressKey("b", { ctrl: true }))

  expect(selections).toEqual(["Codex"])
  expect(masterKeys).toBe(1)
})

test("folder rows are keyboard targets and Enter toggles their fold", async () => {
  const selected: string[] = []
  const activated: string[] = []
  function Fixture() {
    const [collapsed, setCollapsed] = useState<string[]>([])
    return (
      <TerminalSidebar
        sessions={[{ ...session("Shell", "idle"), agent: null }]}
        folders={[
          { id: "terminal", name: "Terminal" },
          { id: "empty", name: "Empty" },
        ]}
        collapsedFolderIds={collapsed}
        selectedFolder="terminal"
        activeSessionId="Shell"
        width={32}
        height={24}
        masterKey="Ctrl+B"
        onActivate={(id) => activated.push(id)}
        onSelectFolder={(id) => selected.push(id)}
        onToggleFolder={(id) =>
          setCollapsed((current) =>
            current.includes(id) ? current.filter((folder) => folder !== id) : [...current, id],
          )
        }
        onActions={() => undefined}
        onNew={() => undefined}
      />
    )
  }
  tui = await testRender(<Fixture />, { width: 32, height: 24 })
  await tui.renderOnce()
  await act(async () => tui!.renderer.root.findDescendantById("terminal-sidebar")!.focus())
  await act(async () => tui!.mockInput.pressArrow("up"))
  await act(async () => tui!.mockInput.pressEnter())
  await tui.renderOnce()

  expect(tui.renderer.root.findDescendantById("terminal-sidebar-section-Shell")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-folder-empty")).toBeUndefined()
  expect(selected).toEqual(["terminal"])
  expect(activated).toEqual([])

  await act(async () => tui!.mockInput.pressEnter())
  await tui.renderOnce()
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-section-Shell")).toBeDefined()
  expect(selected).toEqual(["terminal", "terminal"])
})

test("isolated tmux sidebar navigation works immediately without an internal focus request", async () => {
  const selections: string[] = []
  tui = await testRender(
    <TerminalSidebar
      navigationOnly
      sessions={[
        { ...session("Shell1", "idle"), agent: null },
        { ...session("Shell2", "idle"), agent: null },
      ]}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Shell1"
      width={32}
      height={24}
      masterKey="Ctrl+B"
      onActivate={(id) => selections.push(id)}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 32, height: 24 },
  )
  await tui.renderOnce()
  tui.renderer.currentFocusedRenderable?.blur()
  await act(async () => tui?.mockInput.pressArrow("down"))
  await tui.renderOnce()
  await act(async () => tui?.mockInput.pressEnter())
  expect(selections).toEqual(["Shell2"])
})

test("sidebar focus sweep crosses the full box background diagonally", () => {
  const first = terminalSidebarFocusSweep(24, 18, 0)
  const middle = terminalSidebarFocusSweep(24, 18, 5)
  const last = terminalSidebarFocusSweep(24, 18, 9)
  expect(first).toHaveLength(18)
  expect(first[0]!.left + first[0]!.width).toBe(0)
  expect(first.at(-1)!.left).toBeLessThan(first[0]!.left)
  expect(middle[0]!.left).toBeGreaterThan(middle.at(-1)!.left)
  expect(middle.at(-1)!.left).toBeGreaterThan(0)
  expect(middle[0]!.left).toBeLessThan(23)
  expect(last.at(-1)!.left).toBe(23)
  expect(middle[0]!.width).toBe(first[0]!.width)
})

test("sidebar focus keeps its heading while the background sweep covers its height", async () => {
  const originalStatic = process.env.TUIMINAL_TEST_STATIC_LOADERS
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "0"
  let focusSidebar: () => void = () => undefined
  function Fixture() {
    const [focusRequest, setFocusRequest] = useState(0)
    focusSidebar = () => setFocusRequest((current) => current + 1)
    return (
      <TerminalSidebar
        sessions={[{ ...session("Shell", "idle"), agent: null }]}
        folders={[{ id: "terminal", name: "Terminal" }]}
        selectedFolder="terminal"
        activeSessionId="Shell"
        width={24}
        height={18}
        masterKey="Ctrl+B"
        focusRequest={focusRequest}
        onActivate={() => undefined}
        onSelectFolder={() => undefined}
        onActions={() => undefined}
        onNew={() => undefined}
      />
    )
  }
  try {
    tui = await testRender(<Fixture />, { width: 24, height: 18 })
    await tui.renderOnce()
    await act(async () => focusSidebar())
    await tui.renderOnce()
    const sidebar = tui.renderer.root.findDescendantById("terminal-sidebar")!
    const sweep = tui.renderer.root.findDescendantById("terminal-sidebar-focus-sweep")!
    expect(sweep.height).toBe(sidebar.height)
    expect(tui.captureCharFrame()).toContain("Terminais")
    expect(tui.renderer.root.findDescendantById("terminal-sidebar-count")).toBeDefined()
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    if (originalStatic === undefined) delete process.env.TUIMINAL_TEST_STATIC_LOADERS
    else process.env.TUIMINAL_TEST_STATIC_LOADERS = originalStatic
  }
})

test("sidebar shows read-only external terminal references in Others", async () => {
  updateUiSettings({ language: "pt-BR" })
  const selections: string[] = []
  const external: TerminalSession = {
    ...session("External", "idle"),
    id: "external-pts-7-500",
    sectionId: "external-pts-7-500",
    folderId: "others",
    title: "lazygit",
    workingDirectory: "/workspace/other",
    external: { terminalId: "pts/7" },
    backend: "external",
    agent: null,
    busy: true,
  }
  tui = await testRender(
    <TerminalSidebar
      sessions={[{ ...session("Shell", "idle"), agent: null }, external]}
      folders={[
        { id: "terminal", name: "Tuiminais" },
        { id: "others", name: "Outros" },
      ]}
      selectedFolder="others"
      activeSessionId="Shell"
      width={32}
      height={24}
      masterKey="Ctrl+B"
      onActivate={(id) => selections.push(id)}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 32, height: 24 },
  )
  await tui.renderOnce()

  const row = tui.renderer.root.findDescendantById("terminal-sidebar-pane-external-pts-7-500")!
  const lines = tui.captureCharFrame().split("\n")
  expect(tui.captureCharFrame()).toContain("Outros")
  expect(lines[row.screenY]).toContain("lazygit")
  expect(lines[row.screenY + 1]).toContain("other · pts/7")
  await act(async () => tui?.mockMouse.click(row.screenX + 2, row.screenY))
  expect(selections).toEqual(["external-pts-7-500"])
})

test.each([3, 5, 8])("%i-row sidebars keep agents in a clickable compact list", async (height) => {
  updateUiSettings({ language: "pt-BR" })
  const sessions = [session("Codex", "working")]
  const selections: string[] = []
  tui = await testRender(
    <TerminalSidebar
      sessions={sessions}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Codex"
      width={18}
      height={height}
      masterKey="Ctrl+B"
      onActivate={(id) => selections.push(id)}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 18, height },
  )
  await tui.renderOnce()
  expect(tui.renderer.root.findDescendantById("terminal-agent-list")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-pane-Codex")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("terminal-sidebar-folder-ai")).toBeUndefined()
  expect(tui.captureCharFrame()).toContain("Ctrl+B")
  const target = tui.renderer.root.findDescendantById("terminal-agent-Codex")!
  expect(target.screenY).toBeGreaterThanOrEqual(0)
  expect(target.screenY).toBeLessThan(height)
  expect(target.height).toBe(1)
  expect(target.width).toBeGreaterThan(0)
  expect(tui.captureCharFrame().split("\n")[target.screenY]).toContain("Codex")
  await act(async () => tui?.mockMouse.click(target.screenX + 2, target.screenY))
  expect(selections).toEqual(["Codex"])
})

test("the tmux sidebar keeps agents first above a full sessions list", async () => {
  updateUiSettings({ language: "pt-BR" })
  const sessions: TerminalSession[] = [
    ...Array.from({ length: 6 }, (_, index) => ({
      ...session(`Shell${index + 1}`, "idle"),
      agent: null,
    })),
    session("Codex", "working"),
  ]
  tui = await testRender(
    <TerminalSidebar
      navigationOnly
      sessions={sessions}
      folders={[{ id: "terminal", name: "Terminal" }]}
      selectedFolder="terminal"
      activeSessionId="Shell1"
      width={17}
      height={24}
      masterKey="Ctrl+B"
      onActivate={() => undefined}
      onSelectFolder={() => undefined}
      onActions={() => undefined}
      onNew={() => undefined}
    />,
    { width: 17, height: 24 },
  )
  await tui.renderOnce()

  const list = tui.renderer.root.findDescendantById("terminal-agent-list")!
  const agent = tui.renderer.root.findDescendantById("terminal-agent-Codex")!
  const folder = tui.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  expect(list.screenY).toBeGreaterThanOrEqual(0)
  expect(agent.screenY).toBeGreaterThanOrEqual(list.screenY)
  expect(agent.screenY).toBeLessThan(folder.screenY)
  expect(agent.screenY).toBeLessThan(24)
  expect(tui.captureCharFrame()).toContain("Agentes")
  expect(tui.captureCharFrame().split("\n")[agent.screenY]).toContain("Codex")
})

test.each([8, 30])(
  "%i-row agent items show the task title and keep their click target",
  async (height) => {
    updateUiSettings({ language: "pt-BR", colorMode: height < 10 ? "dark" : "light" })
    const agent = session("Codex", "idle")
    agent.agent!.taskTitle = "Fix login"
    const selections: string[] = []
    tui = await testRender(
      <TerminalSidebar
        sessions={[agent]}
        folders={[{ id: "terminal", name: "Terminal" }]}
        selectedFolder="terminal"
        activeSessionId="Codex"
        width={32}
        height={height}
        masterKey="Ctrl+B"
        onActivate={(id) => selections.push(id)}
        onSelectFolder={() => undefined}
        onActions={() => undefined}
        onNew={() => undefined}
      />,
      { width: 32, height },
    )
    await tui.renderOnce()
    const row = tui.renderer.root.findDescendantById("terminal-agent-Codex")!
    const lines = tui.captureCharFrame().split("\n")
    expect(lines[row.screenY + (height < 10 ? 0 : 1)]).toContain("Fix login")
    expect(lines[row.screenY]).toContain("Ocioso")
    if (height >= 10) expect(lines[row.screenY]).toContain("Codex")
    const coloredTitle = tui
      .captureSpans()
      .lines[row.screenY + (height < 10 ? 0 : 1)]!.spans.find((span) =>
        span.text.includes("Fix login"),
      )
    expect(coloredTitle?.fg.toInts()).toEqual(RGBA.fromHex(COLORS.focus).toInts())
    expect(tui.captureCharFrame()).not.toContain("Task Codex")
    expect(tui.renderer.root.findDescendantById("terminal-sidebar-pane-Codex")).toBeUndefined()
    await act(async () => tui?.mockMouse.click(row.screenX + 2, row.screenY))
    expect(selections).toEqual(["Codex"])
  },
)

test("working agents share an animated loader that stops with activity, visibility or teardown", async () => {
  const originalStatic = process.env.TUIMINAL_TEST_STATIC_LOADERS
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "0"
  const timers = new Map<ReturnType<typeof setInterval>, () => void>()
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const schedule = spyOn(globalThis, "setInterval").mockImplementation(
    new Proxy(originalSetInterval, {
      apply(target, receiver, args) {
        if (args[1] !== 100) return Reflect.apply(target, receiver, args)
        const timer = Reflect.apply(target, receiver, [() => {}, 60_000])
        timers.set(timer, args[0])
        return timer
      },
    }),
  )
  const cancel = spyOn(globalThis, "clearInterval").mockImplementation(
    new Proxy(originalClearInterval, {
      apply(target, receiver, args) {
        timers.delete(args[0])
        return Reflect.apply(target, receiver, args)
      },
    }),
  )
  let changeState: (state: AgentState) => void = () => {}
  let changeActive: (active: boolean) => void = () => {}
  function Fixture() {
    const [state, setState] = useState<AgentState>("working")
    const [active, setActive] = useState(true)
    changeState = setState
    changeActive = setActive
    return (
      <TerminalSidebar
        active={active}
        sessions={[
          session("Codex", state),
          session("Claude", state),
          { ...session("Shell", "idle"), agent: null },
        ]}
        folders={[{ id: "terminal", name: "Terminal" }]}
        selectedFolder="terminal"
        activeSessionId="Codex"
        width={32}
        height={30}
        masterKey="Ctrl+B"
        onActivate={() => undefined}
        onSelectFolder={() => undefined}
        onActions={() => undefined}
        onNew={() => undefined}
      />
    )
  }
  try {
    tui = await testRender(<Fixture />, { width: 32, height: 30 })
    await tui.renderOnce()
    const pane = tui.renderer.root.findDescendantById("terminal-sidebar-pane-Shell")!
    const agent = tui.renderer.root.findDescendantById("terminal-agent-Codex")!
    const row = (y: number) => tui!.captureCharFrame().split("\n")[y]!
    expect(timers.size).toBe(1)
    const shellRow = row(pane.screenY).split("│")[0]?.replace("█", "").trim().replace(/\s+/g, " ")
    expect(tui.renderer.root.findDescendantById("terminal-sidebar-pane-Codex")).toBeUndefined()
    expect(row(agent.screenY)).toContain("⠋")
    await act(async () => timers.values().next().value!())
    await tui.renderOnce()
    expect(row(pane.screenY).split("│")[0]?.replace("█", "").trim().replace(/\s+/g, " ")).toBe(
      shellRow,
    )
    expect(row(agent.screenY)).toContain("⠙")
    expect(tui.renderer.root.findDescendantById(pane.id)).toBe(pane)
    expect(tui.renderer.root.findDescendantById(agent.id)).toBe(agent)
    for (const [state, marker] of [
      ["blocked", "!"],
      ["idle", "○"],
      ["done", "✓"],
      ["unknown", "?"],
    ] as const) {
      await act(async () => changeState(state))
      await tui.renderOnce()
      expect(timers.size).toBe(0)
      expect(row(pane.screenY).split("│")[0]?.replace("█", "").trim().replace(/\s+/g, " ")).toBe(
        shellRow,
      )
      expect(tui.renderer.root.findDescendantById("terminal-sidebar-pane-Codex")).toBeUndefined()
      expect(row(agent.screenY)).toContain(marker)
    }
    await act(async () => changeState("working"))
    expect(timers.size).toBe(1)
    await act(async () => changeActive(false))
    expect(timers.size).toBe(0)
    await act(async () => changeActive(true))
    expect(timers.size).toBe(1)
    await act(async () => tui?.renderer.destroy())
    tui = undefined
    expect(timers.size).toBe(0)
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    for (const timer of timers.keys()) clearInterval(timer)
    schedule.mockRestore()
    cancel.mockRestore()
    if (originalStatic === undefined) delete process.env.TUIMINAL_TEST_STATIC_LOADERS
    else process.env.TUIMINAL_TEST_STATIC_LOADERS = originalStatic
  }
})
