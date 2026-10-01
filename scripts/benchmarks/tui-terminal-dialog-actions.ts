import type { TestRendererSetup } from "@opentui/core/testing"
import { act } from "react"
import { type BenchmarkCase, defineBenchmark } from "./harness"

type TerminalDialogActionContext = {
  tui: TestRendererSetup
  clickTab: (key: string, label: string) => Promise<string>
  waitForUi: (condition: () => boolean, action: string) => Promise<string>
  closeRunnerProjectPickerIfOpen: () => Promise<void>
}

export function tuiTerminalDialogActionBenchmarks({
  tui,
  clickTab,
  waitForUi,
  closeRunnerProjectPickerIfOpen,
}: TerminalDialogActionContext): BenchmarkCase[] {
  async function closeAgentDialogs() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = [
        "terminal-dialog-folder-browser",
        "terminal-dialog-project-picker",
        "terminal-dialog-agent-provider",
      ].find((candidate) => tui.renderer.root.findDescendantById(candidate))
      if (!id) return
      await act(async () => tui.mockInput.pressEscape())
      await waitForUi(
        () => !tui.renderer.root.findDescendantById(id),
        `Terminal dialog close for ${id}`,
      )
    }
    throw new Error("Terminal agent dialogs did not close")
  }
  async function prepareTerminal() {
    await closeRunnerProjectPickerIfOpen()
    if (tui.renderer.root.findDescendantById("http-overlay")) {
      await act(async () => tui.mockInput.pressEscape())
      await waitForUi(
        () => !tui.renderer.root.findDescendantById("http-overlay"),
        "HTTP overlay close before Terminal dialog benchmark",
      )
    }
    await clickTab("5", "Terminal")
    await closeAgentDialogs()
    if (tui.renderer.root.findDescendantById("terminal-actions")) {
      await act(async () => tui.mockInput.pressEscape())
      await waitForUi(
        () => !tui.renderer.root.findDescendantById("terminal-actions"),
        "Terminal Master Key close before dialog benchmark",
      )
    }
  }
  async function openProviderPicker() {
    await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
    await waitForUi(
      () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
      "Terminal actions for agent picker",
    )
    await act(async () => tui.mockInput.pressKey("a"))
    return waitForUi(
      () => Boolean(tui.renderer.root.findDescendantById("terminal-dialog-agent-provider")),
      "Terminal agent provider picker",
    )
  }
  async function openProjectPicker() {
    await openProviderPicker()
    await act(async () => tui.mockInput.pressEnter())
    return waitForUi(
      () => Boolean(tui.renderer.root.findDescendantById("terminal-dialog-project-picker")),
      "Terminal agent project picker",
    )
  }

  return [
    defineBenchmark({
      id: "ui.terminal_agent_provider",
      tool: "terminal",
      description: "Open the first-party agent provider picker from the Master Key",
      beforeEach: prepareTerminal,
      afterEach: closeAgentDialogs,
      run: openProviderPicker,
      verify: (frame) => {
        if (
          !frame.includes("Codex") ||
          !frame.includes("Claude Code") ||
          !frame.includes("OpenCode")
        )
          throw new Error("Agent provider picker omitted a first-party integration")
      },
    }),
    defineBenchmark({
      id: "ui.terminal_agent_projects",
      tool: "terminal",
      description: "Select a provider and render its local project picker",
      beforeEach: async () => {
        await prepareTerminal()
        await openProviderPicker()
      },
      afterEach: closeAgentDialogs,
      run: async () => {
        await act(async () => tui.mockInput.pressEnter())
        return waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-dialog-project-picker")),
          "Terminal local project picker",
        )
      },
      verify: (frame) => {
        if (
          !frame.includes("Local") ||
          !tui.renderer.root.findDescendantById("terminal-dialog-project-launch")
        )
          throw new Error("Agent project picker did not render its local launch")
      },
    }),
    defineBenchmark({
      id: "ui.terminal_project_browser",
      tool: "terminal",
      description: "Open and load the bounded local folder browser from the agent project picker",
      beforeEach: async () => {
        await prepareTerminal()
        await openProjectPicker()
      },
      afterEach: closeAgentDialogs,
      run: async () => {
        await act(async () => tui.mockInput.pressKey("p"))
        return waitForUi(
          () =>
            Boolean(tui.renderer.root.findDescendantById("terminal-dialog-folder-browser")) &&
            !tui.captureCharFrame().includes("Carregando pastas"),
          "Terminal local folder browser",
        )
      },
      verify: () => {
        if (!tui.renderer.root.findDescendantById("terminal-dialog-folder-choose"))
          throw new Error("Agent folder browser did not finish loading")
      },
    }),
  ]
}
