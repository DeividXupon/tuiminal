import type { TestRendererSetup } from "@opentui/core/testing"
import { act } from "react"
import { EMPTY_AGENT_MESSAGE_TURN_DETAIL } from "../../packages/feature-terminal/src/model/agent-message-history"
import { publishCodexResumeThreads } from "../../packages/feature-terminal/src/model/codex-resume-threads"
import { terminalSidebarSnapshot } from "../../packages/feature-terminal/src/model/pinned-sidebar"
import type { CodexAppServerEvents } from "../../packages/feature-terminal/src/services/codex-app-server"
import { stopAllFreeTerminalProcesses } from "../../packages/feature-terminal/src/services/terminal-resources"
import { type BenchmarkCase, defineBenchmark } from "./harness"

type TerminalActionContext = {
  tui: TestRendererSetup
  clickTab: (key: string, label: string) => Promise<string>
  waitForUi: (condition: () => boolean, action: string) => Promise<string>
  click: (id: string) => Promise<void>
  codexEvents: () => CodexAppServerEvents | undefined
  closeRunnerProjectPickerIfOpen: () => Promise<void>
}

export function tuiTerminalActionBenchmarks({
  tui,
  clickTab,
  waitForUi,
  click,
  codexEvents,
  closeRunnerProjectPickerIfOpen,
}: TerminalActionContext): BenchmarkCase[] {
  const cases: BenchmarkCase[] = []
  async function masterAction(key: string) {
    await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
    await waitForUi(
      () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
      `Terminal actions for ${key}`,
    )
    await act(async () => tui.mockInput.pressKey(key))
  }
  async function terminalSessions() {
    if (tui.renderer.root.findDescendantById("http-overlay")) {
      await act(async () => tui.mockInput.pressEscape())
      await waitForUi(
        () => !tui.renderer.root.findDescendantById("http-overlay"),
        "HTTP overlay close before Terminal benchmark",
      )
    }
    await clickTab("5", "Terminal")
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
  let renameInitial = ""
  let renameSessionId = ""
  let resumedSessionId = ""
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
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-split-dialog")),
          "Terminal split choice",
        )
        await act(async () => tui.mockInput.pressKey("n"))
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
  cases.push(
    defineBenchmark({
      id: "ui.terminal_rename",
      tool: "terminal",
      description: "Rename the active Terminal through the Master Key dialog",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        const active = sessions.find(
          (session) => session.id === terminalSidebarSnapshot().view?.activeSessionId,
        )
        if (!active) throw new Error("Terminal rename needs an active session")
        renameInitial = active.title
        renameSessionId = active.id
        await click(`terminal-sidebar-pane-${active.id}`)
      },
      run: async () => {
        await masterAction("e")
        await waitForUi(
          () => tui.renderer.currentFocusedRenderable?.id === "terminal-command-input",
          "Terminal rename input",
        )
        await act(async () => tui.mockInput.pressKey("END"))
        for (const _character of renameInitial) {
          await act(async () => tui.mockInput.pressBackspace())
        }
        await act(async () => tui.mockInput.typeText("Benchmark terminal"))
        await act(async () => tui.mockInput.pressEnter())
        return waitForUi(
          () => !tui.renderer.root.findDescendantById("terminal-dialog"),
          "Renamed Terminal session",
        )
      },
      verify: () => {
        const active = terminalSidebarSnapshot().view?.sessions.find(
          (session) => session.id === renameSessionId,
        )
        if (active?.title !== "Benchmark terminal" || active.titleMode !== "manual") {
          throw new Error(`Terminal rename was not retained: ${JSON.stringify(active)}`)
        }
      },
    }),
  )
  let customSessionId = ""
  cases.push(
    defineBenchmark({
      id: "ui.terminal_custom_command",
      tool: "terminal",
      description: "Submit a custom command and render its new Terminal section",
      beforeEach: async () => {
        await terminalSessions()
        const existing = terminalSidebarSnapshot().view?.sessions.find(
          (session) => session.id === customSessionId,
        )
        if (existing) {
          await click(`terminal-sidebar-pane-${existing.id}`)
          await masterAction("x")
          await waitForUi(
            () =>
              !terminalSidebarSnapshot().view?.sessions.some(
                (session) => session.id === existing.id,
              ),
            "Previous custom Terminal close",
          )
        }
        customSessionId = ""
      },
      run: async () => {
        const previousIds = new Set(
          (terminalSidebarSnapshot().view?.sessions ?? []).map((session) => session.id),
        )
        await click("terminal-sidebar-command")
        await waitForUi(
          () => tui.renderer.currentFocusedRenderable?.id === "terminal-command-input",
          "Terminal custom command input",
        )
        await act(async () => tui.mockInput.typeText("bun --version"))
        await act(async () => tui.mockInput.pressEnter())
        return waitForUi(() => {
          const created = terminalSidebarSnapshot().view?.sessions.find(
            (session) => !previousIds.has(session.id),
          )
          if (created?.displayCommand !== "bun --version" || created?.status !== "running")
            return false
          customSessionId = created.id
          return Boolean(tui.renderer.root.findDescendantById(`free-terminal-${created.id}`))
        }, "Custom Terminal section")
      },
      verify: () => {
        if (
          !terminalSidebarSnapshot().view?.sessions.some(
            (session) =>
              session.id === customSessionId && session.displayCommand === "bun --version",
          )
        ) {
          throw new Error("Custom Terminal command was not preserved")
        }
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.terminal_close",
      tool: "terminal",
      description: "Close the active Terminal and render the remaining session",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        if (sessions.length < 2) {
          await click("terminal-sidebar-new")
          await waitForUi(
            () => (terminalSidebarSnapshot().view?.sessions.length ?? 0) >= 2,
            "Second Terminal for close",
          )
        }
        const active = terminalSidebarSnapshot().view?.sessions.at(-1)
        if (!active) throw new Error("Terminal close needs an active session")
        await click(`terminal-sidebar-pane-${active.id}`)
      },
      run: async () => {
        const closingId = terminalSidebarSnapshot().view?.activeSessionId
        const count = terminalSidebarSnapshot().view?.sessions.length ?? 0
        await masterAction("x")
        return waitForUi(
          () =>
            terminalSidebarSnapshot().view?.sessions.length === count - 1 &&
            !terminalSidebarSnapshot().view?.sessions.some((session) => session.id === closingId),
          "Closed Terminal session",
        )
      },
      verify: () => {
        if (!terminalSidebarSnapshot().view?.activeSessionId) {
          throw new Error("Closing Terminal did not retain a focused session")
        }
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.terminal_focus_selection",
      tool: "terminal",
      description: "Select the sidebar spatially through Master Key focus mode",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        const active = sessions.find(
          (session) => session.id === terminalSidebarSnapshot().view?.activeSessionId,
        )
        if (!active) throw new Error("Focus selection needs an active Terminal")
        await click(`free-terminal-${active.id}`)
      },
      run: async () => {
        await masterAction("m")
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-focus-selection-prompt")),
          "Terminal focus selection",
        )
        for (let index = 0; index < 3; index += 1) {
          await act(async () => tui.mockInput.pressArrow("left"))
        }
        await act(async () => tui.mockInput.pressEnter())
        return waitForUi(
          () => tui.renderer.currentFocusedRenderable?.id === "terminal-sidebar",
          "Focused Terminal sidebar",
        )
      },
      verify: () => {
        if (tui.renderer.currentFocusedRenderable?.id !== "terminal-sidebar") {
          throw new Error("Focus selection did not reach the sidebar")
        }
      },
    }),
  )
  let codexSessionId = ""
  cases.push(
    defineBenchmark({
      id: "ui.terminal_message_history",
      tool: "terminal",
      description: "Open rendered sent-message history for an integrated Codex Terminal",
      beforeEach: async () => {
        const sessions = await terminalSessions()
        let codex = sessions.find((session) => session.agentIntegration === "codex-app-server")
        if (!codex) {
          await masterAction("a")
          await waitForUi(
            () =>
              terminalSidebarSnapshot().view?.sessions.some(
                (session) => session.agentIntegration === "codex-app-server",
              ) === true,
            "Integrated Codex Terminal",
          )
          codex = terminalSidebarSnapshot().view?.sessions.find(
            (session) => session.agentIntegration === "codex-app-server",
          )
        }
        if (!codex) throw new Error("Message history needs an integrated Codex Terminal")
        codexSessionId = codex.id
        const previousHistory = tui.renderer.root.findDescendantById(
          `agent-message-history-${codexSessionId}`,
        )
        if (previousHistory) {
          act(() => previousHistory.focus())
          await act(async () => tui.renderOnce())
          await act(async () => tui.mockInput.pressKey("x"))
          await waitForUi(
            () => !tui.renderer.root.findDescendantById(`agent-message-history-${codexSessionId}`),
            "Previous message history close",
          )
        }
        await click(`terminal-agent-${codexSessionId}`)
        await act(async () => {
          codexEvents()?.onUserMessage({
            id: "benchmark-message",
            turnId: "benchmark-turn",
            text: "Benchmark the sent-message panel",
            sentAt: Date.now() - 1_000,
            durationMs: 1_000,
            status: "completed",
            hasImage: false,
            hasAudio: false,
            hasSkill: false,
            model: "gpt-benchmark",
            effort: "medium",
            serviceTier: "fast",
            ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
          })
        })
      },
      run: async () => {
        await masterAction("s")
        return waitForUi(
          () =>
            Boolean(
              tui.renderer.root.findDescendantById(`agent-message-history-${codexSessionId}`),
            ) && tui.captureCharFrame().includes("Benchmark the sent-message panel"),
          "Codex sent-message history",
        )
      },
      verify: () => {
        if (!tui.renderer.root.findDescendantById(`agent-message-history-${codexSessionId}`)) {
          throw new Error("Codex sent-message history is missing")
        }
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.terminal_live_diff",
      tool: "terminal",
      description: "Open Live Diff for an integrated agent through its rendered first snapshot",
      beforeEach: async () => {
        await terminalSessions()
        if (!codexSessionId) throw new Error("Live Diff needs the benchmark Codex session")
        const history = tui.renderer.root.findDescendantById(
          `agent-message-history-${codexSessionId}`,
        )
        if (history) {
          act(() => history.focus())
          await act(async () => tui.renderOnce())
          await act(async () => tui.mockInput.pressKey("x"))
          await waitForUi(
            () => !tui.renderer.root.findDescendantById(`agent-message-history-${codexSessionId}`),
            "Message history close before Live Diff",
          )
        }
        if (tui.renderer.root.findDescendantById(`live-diff-${codexSessionId}`)) {
          const files = tui.renderer.root.findDescendantById(`live-diff-files-${codexSessionId}`)
          if (!files) throw new Error("Live Diff file navigation is missing")
          act(() => files.focus())
          await act(async () => tui.renderOnce())
          await act(async () => tui.mockInput.pressKey("x"))
          await waitForUi(
            () => !tui.renderer.root.findDescendantById(`live-diff-${codexSessionId}`),
            "Previous Live Diff close",
          )
        }
        await click(`terminal-agent-${codexSessionId}`)
      },
      run: async () => {
        await masterAction("d")
        return waitForUi(
          () =>
            Boolean(tui.renderer.root.findDescendantById(`live-diff-${codexSessionId}`)) &&
            tui.captureCharFrame().includes("benchmark-git.txt"),
          "Terminal Live Diff snapshot",
        )
      },
      verify: (frame) => {
        if (!frame.includes("benchmark-git.txt")) throw new Error("Live Diff fixture is missing")
      },
    }),
  )
  cases.push(
    defineBenchmark({
      id: "ui.terminal_resume_thread",
      tool: "terminal",
      description: "Resume a recent Codex thread from the Master Key agent list",
      beforeEach: async () => {
        await terminalSessions()
        const previous = terminalSidebarSnapshot().view?.sessions.find(
          (session) => session.id === resumedSessionId,
        )
        if (previous) {
          await click(`terminal-agent-${previous.id}`)
          await masterAction("x")
          await waitForUi(
            () =>
              !terminalSidebarSnapshot().view?.sessions.some(
                (session) => session.id === previous.id,
              ),
            "Previous resumed Codex Terminal close",
          )
        }
        resumedSessionId = ""
        await act(async () => {
          publishCodexResumeThreads([
            {
              id: "benchmark-resume",
              title: "Benchmark conversation",
              preview: "Continue benchmark coverage",
              lastResponse: "Ready to continue.",
              cwd: process.env.TUIMINAL_WORKDIR ?? "",
              updatedAt: Date.now(),
              state: "idle",
            },
          ])
        })
      },
      run: async () => {
        const previousIds = new Set(
          (terminalSidebarSnapshot().view?.sessions ?? []).map((session) => session.id),
        )
        await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
        await waitForUi(
          () => Boolean(tui.renderer.root.findDescendantById("terminal-actions")),
          "Terminal actions for Codex resume",
        )
        await act(async () => tui.mockInput.pressArrow("right"))
        await waitForUi(
          () =>
            Boolean(
              tui.renderer.root.findDescendantById("terminal-resume-thread-benchmark-resume"),
            ),
          "Recent Codex thread",
        )
        await act(async () => tui.mockInput.pressEnter())
        return waitForUi(() => {
          const resumed = terminalSidebarSnapshot().view?.sessions.find(
            (session) =>
              !previousIds.has(session.id) &&
              session.displayCommand === "codex resume benchmark-resume --remote",
          )
          if (!resumed) return false
          resumedSessionId = resumed.id
          return true
        }, "Resumed Codex Terminal")
      },
      verify: () => {
        if (
          !terminalSidebarSnapshot().view?.sessions.some(
            (session) =>
              session.id === resumedSessionId &&
              session.displayCommand === "codex resume benchmark-resume --remote",
          )
        ) {
          throw new Error("Codex resume did not create its Terminal")
        }
      },
    }),
  )
  let resizeSessionId = ""
  let resizePane: ReturnType<typeof tui.renderer.root.findDescendantById>
  let resizeSessionCount = 0
  cases.push(
    defineBenchmark({
      id: "ui.terminal_resize",
      tool: "terminal",
      description: "Resize the mounted Terminal workspace down and back without remounting its PTY",
      beforeEach: async () => {
        await act(async () => tui.resize(160, 40))
        const sessions = await terminalSessions()
        const active = sessions.find(
          (session) => session.id === terminalSidebarSnapshot().view?.activeSessionId,
        )
        if (!active) throw new Error("Terminal resize needs an active session")
        resizeSessionId = active.id
        resizeSessionCount = sessions.length
        resizePane = tui.renderer.root.findDescendantById(`free-terminal-${resizeSessionId}`)
        if (!resizePane) throw new Error("Terminal resize pane is missing")
      },
      run: async () => {
        await act(async () => tui.resize(120, 30))
        await waitForUi(
          () => tui.renderer.root.findDescendantById("terminal-workspace")?.width === 120,
          "Compact resized Terminal workspace",
        )
        await act(async () => tui.resize(160, 40))
        return waitForUi(
          () =>
            tui.renderer.root.findDescendantById("terminal-workspace")?.width === 160 &&
            tui.renderer.root.findDescendantById(`free-terminal-${resizeSessionId}`) === resizePane,
          "Restored Terminal workspace",
        )
      },
      verify: () => {
        if (terminalSidebarSnapshot().view?.sessions.length !== resizeSessionCount) {
          throw new Error("Terminal resize changed its sessions")
        }
      },
    }),
  )
  return cases
}
