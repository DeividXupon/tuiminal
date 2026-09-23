import type { TestRendererSetup } from "@opentui/core/testing"
import { act } from "react"
import { terminalSidebarSnapshot } from "../../packages/feature-terminal/src/model/pinned-sidebar"
import { type BenchmarkCase, defineBenchmark } from "./harness"
import { tuiTerminalActionBenchmarks } from "./tui-terminal-actions"

type TuiActionContext = {
  tui: TestRendererSetup
  switchTo: (key: string, label: string) => Promise<string>
  clickTab: (key: string, label: string) => Promise<string>
  waitForUi: (condition: () => boolean, action: string) => Promise<string>
  focus: (id: string) => Promise<void>
  click: (id: string) => Promise<void>
}

export function tuiActionBenchmarks({
  tui,
  switchTo,
  clickTab,
  waitForUi,
  focus,
  click,
}: TuiActionContext): BenchmarkCase[] {
  const cases: BenchmarkCase[] = []
  cases.push(
    defineBenchmark({
      id: "ui.database_catalog_search",
      tool: "database",
      description: "Focus the Database catalog search from keyboard input",
      beforeEach: async () => {
        if (tui.renderer.root.findDescendantById("terminal-actions")) {
          await act(async () => tui.mockInput.pressKey("escape"))
          await waitForUi(
            () => !tui.renderer.root.findDescendantById("terminal-actions"),
            "Terminal Master Key close",
          )
        }
        await clickTab("1", "Database")
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("table-list")),
          "Database catalog",
        )
        await focus("table-list")
      },
      run: async () => {
        await act(async () => tui.mockInput.pressKey("/"))
        const frame = await waitForUi(
          () => tui.renderer.currentFocusedRenderable?.id === "table-search",
          "Database catalog search",
        )
        return { frame, focused: tui.renderer.currentFocusedRenderable?.id }
      },
      verify: (result) => {
        if (result.focused !== "table-search") throw new Error("Catalog search lost focus")
      },
    }),
  )
  let graphOpen = false
  cases.push(
    defineBenchmark({
      id: "ui.git_graph",
      tool: "git",
      description: "Open the full Git commit graph from keyboard input",
      beforeEach: async () => {
        if (tui.renderer.currentFocusedRenderable?.id === "table-search") {
          await focus("table-list")
        }
        await switchTo("2", "Git")
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("git-file-list-row-0")),
          "Git file tree",
        )
        if (graphOpen) {
          await act(async () => tui.mockInput.pressKey("g"))
          await waitForUi(
            () => !tui.captureCharFrame().includes("ÁRVORE DE COMMITS"),
            "Git diff view",
          )
          graphOpen = false
        }
        await focus("git-file-list-row-0")
      },
      run: async () => {
        await act(async () => tui.mockInput.pressKey("g"))
        const frame = await waitForUi(() => {
          const current = tui.captureCharFrame()
          return current.includes("ÁRVORE DE COMMITS") && current.includes("Benchmark fixture")
        }, "Git graph")
        graphOpen = true
        return frame
      },
      verify: (frame) => {
        if (!frame.includes("ÁRVORE DE COMMITS") || !frame.includes("Benchmark fixture")) {
          throw new Error("Git graph did not render the fixture commit")
        }
      },
    }),
  )
  let multiOpen = false
  cases.push(
    defineBenchmark({
      id: "ui.runner_multi",
      tool: "runner",
      description: "Switch the Runner to multi-process layout from keyboard input",
      beforeEach: async () => {
        await switchTo("3", "Runner")
        if (multiOpen) {
          await focus("runner-command-list")
          await act(async () => tui.mockInput.pressKey("m"))
          await tui.renderOnce()
          multiOpen = false
        }
        await focus("runner-command-list")
      },
      run: async () => {
        await act(async () => tui.mockInput.pressKey("m"))
        const frame = await waitForUi(
          () => tui.captureCharFrame().includes("MULTI"),
          "Runner multi view",
        )
        multiOpen = true
        return frame
      },
      verify: (frame) => {
        if (!frame.includes("MULTI")) throw new Error("Runner multi view is missing")
      },
    }),
  )
  let projectPickerOpen = false
  async function closeRunnerProjectPicker() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!tui.renderer.root.findDescendantById("runner-project-search")) {
        projectPickerOpen = false
        return
      }
      await act(async () => {
        tui.mockInput.pressKey("ESCAPE")
        await Bun.sleep(60)
      })
      await tui.renderOnce()
    }
    throw new Error(
      `Runner project picker did not close; focus=${tui.renderer.currentFocusedRenderable?.id}:\n${tui.captureCharFrame()}`,
    )
  }
  cases.push(
    defineBenchmark({
      id: "ui.runner_project_picker",
      tool: "runner",
      description: "Open the Runner project picker from keyboard input",
      beforeEach: async () => {
        await switchTo("3", "Runner")
        if (projectPickerOpen) {
          await closeRunnerProjectPicker()
        }
        await focus("runner-command-list")
      },
      run: async () => {
        await act(async () => tui.mockInput.pressKey("n"))
        const frame = await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("runner-project-search")),
          "Runner project picker",
        )
        projectPickerOpen = true
        return frame
      },
      verify: () => {
        if (!tui.renderer.root.findDescendantById("runner-project-search")) {
          throw new Error("Runner project picker is missing")
        }
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.http_help",
      tool: "http",
      description: "Open the HTTP help overlay from the F1 shortcut",
      beforeEach: async () => {
        if (projectPickerOpen) {
          await switchTo("3", "Runner")
          await closeRunnerProjectPicker()
        }
        await switchTo("4", "HTTP")
        if (tui.renderer.root.findDescendantById("http-source-local-card")) {
          await click("http-source-local-card")
        }
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("http-help-button")),
          "HTTP workspace",
        )
        if (tui.renderer.root.findDescendantById("http-overlay")) {
          await act(async () => {
            tui.mockInput.pressKey("ESCAPE")
            await Bun.sleep(60)
          })
          await waitForUi(
            () => !tui.renderer.root.findDescendantById("http-overlay"),
            "HTTP help close",
          )
        }
        await focus("http-help-button")
      },
      run: async () => {
        await act(async () => tui.mockInput.pressKey("F1"))
        const frame = await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("http-overlay")),
          "HTTP help",
        )
        return frame
      },
      verify: () => {
        if (!tui.renderer.root.findDescendantById("http-overlay")) {
          throw new Error("HTTP help overlay is missing")
        }
      },
    }),
  )
  cases.push(
    ...tuiTerminalActionBenchmarks({
      tui,
      switchTo,
      waitForUi,
      click,
      closeRunnerProjectPickerIfOpen: async () => {
        if (!projectPickerOpen) return
        await switchTo("3", "Runner")
        await closeRunnerProjectPicker()
      },
    }),
  )
  let pinnedTargetId = ""
  cases.push(
    defineBenchmark({
      id: "ui.terminal_pinned_activate",
      tool: "terminal",
      description: "Activate a pinned Terminal row from Git and render its existing pane",
      beforeEach: async () => {
        await clickTab("5", "Terminal")
        const first = terminalSidebarSnapshot().view?.sessions[0]
        if (!first) throw new Error("Pinned activation needs a Terminal session")
        pinnedTargetId = first.id
        if (terminalSidebarSnapshot().view?.collapsedFolderIds.includes("terminal")) {
          await click("terminal-sidebar-folder-terminal")
        }
        if (!terminalSidebarSnapshot().pinned) {
          await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
          await waitForUi(
            () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
            "Terminal actions",
          )
          await act(async () => tui.mockInput.pressKey("b"))
          await waitForUi(() => terminalSidebarSnapshot().pinned, "Pinned Terminal sidebar")
        }
        await clickTab("2", "Git")
        await waitForUi(
          () =>
            Boolean(
              tui.renderer.root.findDescendantById(`terminal-sidebar-pane-${pinnedTargetId}`),
            ),
          "Pinned Terminal row in Git",
        )
      },
      run: async () => {
        await click(`terminal-sidebar-pane-${pinnedTargetId}`)
        return waitForUi(
          () =>
            tui.captureCharFrame().includes("◆ Terminal [Alt+5]") &&
            terminalSidebarSnapshot().view?.activeSessionId === pinnedTargetId &&
            Boolean(tui.renderer.root.findDescendantById(`free-terminal-${pinnedTargetId}`)),
          "Existing Terminal pane from pinned sidebar",
        )
      },
      verify: () => {
        if (!terminalSidebarSnapshot().pinned) throw new Error("Pinned sidebar lost its state")
      },
    }),
  )
  return cases
}
