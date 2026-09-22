import type { TestRendererSetup } from "@opentui/core/testing"
import { act } from "react"
import { terminalSidebarSnapshot } from "../../packages/feature-terminal/src/model/pinned-sidebar"
import { stopAllFreeTerminalProcesses } from "../../packages/feature-terminal/src/services/terminal-resources"
import { type BenchmarkCase, defineBenchmark } from "./harness"

type TerminalActionContext = {
  tui: TestRendererSetup
  switchTo: (key: string, label: string) => Promise<string>
  waitForUi: (condition: () => boolean, action: string) => Promise<string>
  click: (id: string) => Promise<void>
  closeRunnerProjectPickerIfOpen: () => Promise<void>
}

export function tuiTerminalActionBenchmarks({
  tui,
  switchTo,
  waitForUi,
  click,
  closeRunnerProjectPickerIfOpen,
}: TerminalActionContext): BenchmarkCase[] {
  const cases: BenchmarkCase[] = []
  async function terminalSessions() {
    await switchTo("5", "Terminal")
    await waitForUi(
      () => Boolean(tui.renderer.root.findDescendantById("terminal-sidebar-new")),
      "Terminal sidebar",
    )
    return terminalSidebarSnapshot().view?.sessions ?? []
  }
  function firstTerminalSectionVisible() {
    const sectionId = terminalSidebarSnapshot().view?.sessions[0]?.sectionId
    return Boolean(
      sectionId && tui.renderer.root.findDescendantById(`terminal-sidebar-section-${sectionId}`),
    )
  }
  cases.push(
    defineBenchmark({
      id: "ui.terminal_new",
      tool: "terminal",
      description: "Create a Terminal session from the sidebar to its rendered running pane",
      beforeEach: async () => {
        await closeRunnerProjectPickerIfOpen()
        const sessions = await terminalSessions()
        if (!sessions.length) return
        await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
          "Terminal actions",
        )
        await act(async () => tui.mockInput.pressKey("x"))
        await waitForUi(
          () => terminalSidebarSnapshot().view?.sessions.length === 0,
          "Terminal close",
        )
      },
      run: async () => {
        await click("terminal-sidebar-new")
        return waitForUi(
          () =>
            terminalSidebarSnapshot().view?.sessions.length === 1 &&
            terminalSidebarSnapshot().view?.sessions[0]?.status === "running" &&
            firstTerminalSectionVisible(),
          "New Terminal pane",
        )
      },
      verify: () => {
        if (terminalSidebarSnapshot().view?.sessions[0]?.status !== "running") {
          throw new Error("New Terminal pane did not start")
        }
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.terminal_folder_fold",
      tool: "terminal",
      description: "Collapse a mounted Terminal folder by mouse click",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        if (!sessions.length) {
          await click("terminal-sidebar-new")
          await waitForUi(
            () => terminalSidebarSnapshot().view?.sessions[0]?.status === "running",
            "Terminal session for folder navigation",
          )
        }
        if (terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal")) {
          await click("terminal-sidebar-folder-terminal")
          await waitForUi(() => firstTerminalSectionVisible(), "Expanded Terminal folder")
        }
      },
      run: async () => {
        await click("terminal-sidebar-folder-terminal")
        return waitForUi(
          () =>
            terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal") === true &&
            !firstTerminalSectionVisible(),
          "Collapsed Terminal folder",
        )
      },
      verify: () => {
        if (terminalSidebarSnapshot().view?.sessions.length !== 1) {
          throw new Error("Folding a Terminal folder changed its session")
        }
      },
    }),
  )
  let folderSessionId = ""
  cases.push(
    defineBenchmark({
      id: "ui.terminal_folder_keyboard",
      tool: "terminal",
      description: "Move the sidebar cursor to the Terminal folder and collapse it with Enter",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        const first = sessions[0]
        if (!first) throw new Error("Terminal folder navigation needs a session")
        folderSessionId = first.id
        if (terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal")) {
          await click("terminal-sidebar-folder-terminal")
          await waitForUi(() => firstTerminalSectionVisible(), "Expanded Terminal folder")
        }
        await click(`terminal-sidebar-pane-${first.id}`)
        await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
          "Terminal actions for folder navigation",
        )
        await act(async () => tui.mockInput.pressKey("l"))
        await waitForUi(
          () => tui.renderer.currentFocusedRenderable?.id === "terminal-sidebar",
          "Terminal sidebar focus",
        )
      },
      run: async () => {
        await act(async () => {
          tui.mockInput.pressArrow("up")
          tui.mockInput.pressEnter()
        })
        return waitForUi(
          () =>
            terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal") === true &&
            !firstTerminalSectionVisible(),
          "Keyboard-collapsed Terminal folder",
        )
      },
      verify: () => {
        const sessions = terminalSidebarSnapshot().view?.sessions ?? []
        if (
          sessions.length !== 1 ||
          sessions[0]?.id !== folderSessionId ||
          sessions[0]?.status !== "running"
        ) {
          throw new Error("Keyboard folder navigation changed its Terminal session")
        }
      },
    }),
  )
  async function toggleTerminalPin() {
    await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
    await waitForUi(
      () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
      "Terminal actions for sidebar pinning",
    )
    await act(async () => tui.mockInput.pressKey("b"))
  }
  cases.push(
    defineBenchmark({
      id: "ui.terminal_pin_sidebar",
      tool: "terminal",
      description: "Pin the live Terminal sidebar through the Master Key menu",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        const first = sessions[0]
        if (!first) throw new Error("Sidebar pinning needs a Terminal session")
        if (terminalSidebarSnapshot().pinned) {
          await toggleTerminalPin()
          await waitForUi(() => !terminalSidebarSnapshot().pinned, "Unpinned Terminal sidebar")
        }
        if (terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal")) {
          await click("terminal-sidebar-folder-terminal")
        }
        await click(`terminal-sidebar-pane-${first.id}`)
      },
      run: async () => {
        await toggleTerminalPin()
        return waitForUi(
          () =>
            terminalSidebarSnapshot().pinned &&
            (tui.renderer.root.findDescendantById("terminal-workspace")?.screenX ?? 0) > 0 &&
            Boolean(tui.renderer.root.findDescendantById("terminal-sidebar")),
          "Pinned Terminal sidebar",
        )
      },
      verify: () => {
        if (
          !terminalSidebarSnapshot().pinned ||
          terminalSidebarSnapshot().view?.sessions.length !== 1
        ) {
          throw new Error("Pinning changed the Terminal session or failed to show the sidebar")
        }
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.terminal_unpin_sidebar",
      tool: "terminal",
      description: "Return the pinned sidebar to the Terminal workspace",
      beforeEach: async () => {
        await terminalSessions()
        if (!terminalSidebarSnapshot().pinned) {
          await toggleTerminalPin()
          await waitForUi(() => terminalSidebarSnapshot().pinned, "Pinned Terminal sidebar")
        }
      },
      run: async () => {
        await toggleTerminalPin()
        return waitForUi(
          () =>
            !terminalSidebarSnapshot().pinned &&
            tui.renderer.root.findDescendantById("terminal-workspace")?.screenX === 0 &&
            Boolean(tui.renderer.root.findDescendantById("terminal-sidebar")),
          "Returned Terminal sidebar",
        )
      },
      verify: () => {
        if (
          terminalSidebarSnapshot().pinned ||
          terminalSidebarSnapshot().view?.sessions.length !== 1
        ) {
          throw new Error("Unpinning changed the Terminal session or kept the sidebar global")
        }
      },
    }),
  )
  let nextTerminalId = ""
  cases.push(
    defineBenchmark({
      id: "ui.terminal_session_navigation",
      tool: "terminal",
      description: "Move the sidebar cursor and activate another mounted session",
      beforeEach: async () => {
        await terminalSessions()
        if (terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal")) {
          await click("terminal-sidebar-folder-terminal")
        }
        if ((terminalSidebarSnapshot().view?.sessions.length ?? 0) < 2) {
          await click("terminal-sidebar-new")
          await waitForUi(
            () => terminalSidebarSnapshot().view?.sessions.length === 2,
            "Second Terminal session",
          )
        }
        const sessions = terminalSidebarSnapshot().view?.sessions ?? []
        const first = sessions[0]
        const second = sessions[1]
        if (!first || !second) throw new Error("Terminal navigation needs two sessions")
        nextTerminalId = second.id
        await click(`terminal-sidebar-pane-${first.id}`)
        await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
          "Terminal actions for sidebar focus",
        )
        await act(async () => tui.mockInput.pressKey("l"))
        await waitForUi(
          () => tui.renderer.currentFocusedRenderable?.id === "terminal-sidebar",
          "Terminal sidebar focus",
        )
      },
      run: async () => {
        await act(async () => {
          tui.mockInput.pressArrow("down")
          tui.mockInput.pressEnter()
        })
        return waitForUi(
          () =>
            terminalSidebarSnapshot().view?.activeSessionId === nextTerminalId &&
            tui.renderer.currentFocusedRenderable?.id !== "terminal-sidebar",
          "Terminal session activation",
        )
      },
      verify: () => {
        if (terminalSidebarSnapshot().view?.activeSessionId !== nextTerminalId) {
          throw new Error("Sidebar navigation selected the wrong Terminal session")
        }
      },
    }),
  )
  let splitSectionId = ""
  let splitFirstId = ""
  cases.push(
    defineBenchmark({
      id: "ui.terminal_split",
      tool: "terminal",
      description: "Split a mounted Terminal section to the right and render both panes",
      beforeEach: async () => {
        await terminalSessions()
        if (terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal")) {
          await click("terminal-sidebar-folder-terminal")
        }
        const sessions = terminalSidebarSnapshot().view?.sessions ?? []
        const first = sessions[0]
        if (!first) throw new Error("Terminal split needs a session")
        splitSectionId = first.sectionId
        splitFirstId = first.id
        const existingSplit = sessions.find(
          (session) => session.sectionId === splitSectionId && session.id !== first.id,
        )
        if (existingSplit) {
          await click(`terminal-sidebar-pane-${existingSplit.id}`)
          await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
          await waitForUi(
            () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
            "Terminal actions for split close",
          )
          await act(async () => tui.mockInput.pressKey("x"))
          await waitForUi(
            () =>
              terminalSidebarSnapshot().view?.sessions.filter(
                (session) => session.sectionId === splitSectionId,
              ).length === 1,
            "Terminal split close",
          )
          await stopAllFreeTerminalProcesses()
        }
        await click(`terminal-sidebar-pane-${splitFirstId}`)
      },
      run: async () => {
        await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
          "Terminal actions for split",
        )
        await act(async () => tui.mockInput.pressKey("v"))
        return waitForUi(() => {
          const panes = terminalSidebarSnapshot().view?.sessions.filter(
            (session) => session.sectionId === splitSectionId,
          )
          if (panes?.length !== 2) return false
          const left = tui.renderer.root.findDescendantById(`free-terminal-${splitFirstId}`)
          const right = tui.renderer.root.findDescendantById(`free-terminal-${panes[1]?.id}`)
          return Boolean(left && right && right.screenX === left.screenX + left.width + 1)
        }, "Terminal split panes")
      },
      verify: () => {
        const panes = terminalSidebarSnapshot().view?.sessions.filter(
          (session) => session.sectionId === splitSectionId,
        )
        if (panes?.length !== 2 || panes[1]?.column !== 1) {
          throw new Error("Terminal split did not create the right pane")
        }
      },
    }),
  )
  return cases
}
