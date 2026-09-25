import { dirname, join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"
import { terminalFeatureBenchmarks } from "./terminal-features"
import { terminalRuntimeBenchmarks } from "./terminal-runtime"

export async function terminalBenchmarks(root: string): Promise<BenchmarkCase[]> {
  const { AgentMonitor } = await import(
    "../../packages/feature-terminal/src/services/agent-monitor"
  )
  const { AgentOutput } = await import("../../packages/feature-terminal/src/model/agent-output")
  const { readLiveDiffRoot, readLiveDiffPatch } = await import(
    "../../packages/feature-terminal/src/services/live-diff"
  )
  const { parseLiveDiffStatus } = await import(
    "../../packages/feature-terminal/src/model/live-diff"
  )
  const { startFreeTerminalProcess } = await import(
    "../../packages/feature-terminal/src/services/terminal"
  )
  const { parseTmuxPanes } = await import("../../packages/feature-terminal/src/model/tmux")
  const { fitTmuxLayout, formatTmuxLayout, parseTmuxLayout, tmuxLayoutPanes } = await import(
    "../../packages/feature-terminal/src/model/tmux-layout"
  )
  const { observeAgent } = await import("../../packages/feature-terminal/src/model/agent-state")
  const { identifyAgent } = await import(
    "../../packages/feature-terminal/src/model/agent-detection"
  )
  const { terminalSections, numberedTerminalSections, normalizeSectionLayout } = await import(
    "../../packages/feature-terminal/src/model/sessions"
  )
  const { loadTerminalWorkspaceState, saveTerminalWorkspaceState } = await import(
    "../../packages/feature-terminal/src/services/terminal-workspace-state"
  )
  const {
    clearTerminalSidebar,
    publishTerminalSidebar,
    requestPinnedTerminalTarget,
    requestTerminalSidebarFocus,
    resetPinnedTerminalSidebarForTests,
    terminalSidebarReplica,
    terminalSidebarSnapshot,
  } = await import("../../packages/feature-terminal/src/model/pinned-sidebar")
  const { routePinnedTerminalToTuiminal } = await import(
    "../../packages/feature-terminal/src/services/pinned-sidebar-navigation"
  )
  const { TmuxMirrorRefresh } = await import(
    "../../packages/feature-terminal/src/services/tmux-mirror-refresh"
  )
  const { isTmuxSidebarOnlyChange, requestedTmuxMirrorLayout } = await import(
    "../../packages/feature-terminal/src/services/tmux-mirror-state"
  )
  type TmuxMirrorSnapshot =
    import("../../packages/feature-terminal/src/services/tmux-mirror-state").TmuxMirrorSnapshot
  type TerminalSession =
    import("../../packages/feature-terminal/src/model/sessions").TerminalSession
  const plain = new TextEncoder().encode("terminal output 0123456789 日本語\r\n".repeat(4))
  const ansi = new TextEncoder().encode("\u001b[38;2;120;180;255mcolored output\u001b[0m\r\n")
  const status = Array.from({ length: 500 }, (_, index) => ` M file-${index}.txt\0`).join("")
  const tmuxOutput = Array.from(
    { length: 100 },
    (_, index) =>
      `/tmp/bench.sock\t$1\tbench\t@${index}\t${index}\tshell\t%${index}\t0\tbun\t1234\t${root}\n`,
  ).join("")
  const initial = await readLiveDiffRoot(root, new AbortController().signal)
  const layout = parseTmuxLayout(
    formatTmuxLayout({
      width: 107,
      height: 24,
      direction: "row",
      children: Array.from({ length: 12 }, (_, index) => ({
        width: 8,
        height: 24,
        pane: `%${index + 1}`,
        children: [],
      })),
    }),
  )
  const mirrorSnapshot: TmuxMirrorSnapshot = {
    id: "@1",
    width: 107,
    height: 24,
    layout: formatTmuxLayout(layout),
    visible: formatTmuxLayout(layout),
    zoomed: false,
    panes: tmuxLayoutPanes(layout).map((id, index) => ({
      id,
      columns: index === 11 ? 19 : 8,
      rows: 24,
      active: index === 0,
      sidebar: false,
    })),
    mode: "largest",
    effectiveMode: "largest",
    sidebarMutation: "",
    visibleToClient: true,
  }
  const mirrorSizes = tmuxLayoutPanes(layout).map((pane) => ({
    pane,
    columns: 10,
    rows: 28,
  }))
  const processes = Array.from({ length: 2_000 }, (_, index) => ({
    pid: index + 1,
    parentPid: index ? Math.floor((index + 1) / 2) : 0,
    executable: index === 1_999 ? "codex" : "sh",
    command: index === 1_999 ? "codex" : "sh",
    foreground: true,
  }))
  const sessions: TerminalSession[] = Array.from({ length: 12 }, (_, index) => ({
    id: `terminal-${index}`,
    sectionId: `section-${index}`,
    folderId: "terminal",
    row: 0,
    column: 0,
    kind: "shell",
    label: "Shell",
    shortLabel: "sh",
    displayCommand: "sh",
    command: ["sh"],
    accent: "#4488ff",
    title: `Terminal ${index}`,
    status: "running",
    pid: index + 1,
    exitCode: null,
    startedAt: 1_780_000_000_000,
    agent:
      index < 3
        ? {
            key: `agent-${index}`,
            label: "Codex",
            profile: "codex",
            state: "working",
            activity: null,
          }
        : null,
  }))
  const splitRemainder: TerminalSession[] = sessions.map((session, index) =>
    index === 0 ? { ...session, row: 1, column: 1 } : session,
  )
  const folderEnvironment = {
    ...process.env,
    XDG_DATA_HOME: join(dirname(root), "terminal-benchmark-data"),
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  const folderAssignments = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [
      `tmux-pane-${index}`,
      index % 2 ? "tmux" : "terminal",
    ]),
  )
  const changedFile = initial.files.find((file) => file.path === "file-0.txt")
  if (!changedFile) throw new Error("Live Diff fixture has no changed file")
  const cases: BenchmarkCase[] = [
    defineBenchmark({
      id: "terminal.output_plain",
      tool: "terminal",
      description: "Process 1,000 plain PTY chunks without screen inspection",
      operationsPerSample: 1_000,
      run: () => {
        const monitor = new AgentMonitor(120, 30)
        for (let index = 0; index < 1_000; index += 1) monitor.write(plain)
        const revision = monitor.revision
        monitor.dispose()
        return revision
      },
      verify: (result) => {
        if (result !== 1_000) throw new Error("Dropped PTY chunks")
      },
    }),
    defineBenchmark({
      id: "terminal.output_screen",
      tool: "terminal",
      description: "Process 1,000 ANSI chunks and capture the agent screen",
      run: () => {
        const monitor = new AgentMonitor(120, 30)
        for (let index = 0; index < 1_000; index += 1) monitor.write(ansi)
        const screen = monitor.screen()
        monitor.dispose()
        return screen
      },
      verify: (result) => {
        if (!result.includes("colored")) throw new Error("Screen capture failed")
      },
    }),
    defineBenchmark({
      id: "terminal.osc_title",
      tool: "terminal",
      description: "Process 1,000 OSC title changes",
      operationsPerSample: 1_000,
      run: () => {
        const output = new AgentOutput()
        for (let index = 0; index < 1_000; index += 1) {
          output.write(new TextEncoder().encode(`\u001b]0;task-${index}\u0007`))
        }
        return output.title
      },
      verify: (result) => {
        if (result !== "task-999") throw new Error("OSC title missing")
      },
    }),
    defineBenchmark({
      id: "terminal.pty_launch",
      tool: "terminal",
      description: "Start a native PTY command, receive output and retire it",
      run: async () => {
        const exited = Promise.withResolvers<number | null>()
        let output = ""
        const decoder = new TextDecoder()
        const handle = startFreeTerminalProcess(
          [process.execPath, "-e", "console.log('BENCHMARK_READY')"],
          {
            cwd: root,
            onData: (data) => {
              output += decoder.decode(data, { stream: true })
            },
            onExit: (result) => exited.resolve(result.code),
          },
        )
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const code = await Promise.race([
            exited.promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("PTY benchmark timed out")), 5_000)
            }),
          ])
          return { code, output }
        } finally {
          clearTimeout(timer)
          await handle.stop()
        }
      },
      verify: (result) => {
        if (result.code !== 0 || !result.output.includes("BENCHMARK_READY")) {
          throw new Error("PTY process did not complete")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.tmux_discovery_parse",
      tool: "terminal",
      description: "Parse 100 tmux pane records",
      run: () => parseTmuxPanes(tmuxOutput),
      verify: (result) => {
        if (result.length !== 100) throw new Error("Tmux pane parse failed")
      },
    }),
    defineBenchmark({
      id: "terminal.tmux_layout",
      tool: "terminal",
      description: "Fit, format and parse a 12-pane tmux layout",
      run: () => {
        const fitted = fitTmuxLayout(layout, new Map(), new Map(), {
          columns: 120,
          rows: 30,
        })
        return tmuxLayoutPanes(parseTmuxLayout(formatTmuxLayout(fitted)))
      },
      verify: (result) => {
        if (result.length !== 12) throw new Error("Tmux layout lost panes")
      },
    }),
    defineBenchmark({
      id: "terminal.tmux_mirror_resize",
      tool: "terminal",
      description: "Resolve 12 pane-size requests into a tmux mirror layout",
      run: () => requestedTmuxMirrorLayout(layout, new Map(), mirrorSnapshot, mirrorSizes),
      verify: (result) => {
        if (tmuxLayoutPanes(result.layout).length !== 12 || !result.formatted) {
          throw new Error("Tmux mirror resize lost panes")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.tmux_sidebar_change",
      tool: "terminal",
      description: "Classify a tmux sidebar pane update without refreshing content panes",
      run: () =>
        isTmuxSidebarOnlyChange(
          {
            ...mirrorSnapshot,
            sidebarMutation: "complete:benchmark",
            panes: [
              ...mirrorSnapshot.panes,
              { id: "%99", columns: 24, rows: 24, active: false, sidebar: true },
            ],
          },
          mirrorSnapshot,
        ),
      verify: (result) => {
        if (!result) throw new Error("Tmux sidebar update was not recognized")
      },
    }),
    defineBenchmark({
      id: "terminal.tmux_mirror_refresh",
      tool: "terminal",
      description: "Schedule and complete one input-triggered tmux mirror capture",
      run: async () => {
        const captured = Promise.withResolvers<void>()
        const refresh = new TmuxMirrorRefresh(
          async () => {
            captured.resolve()
            return false
          },
          () => captured.reject(new Error("Tmux mirror capture failed")),
        )
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          refresh.request()
          await Promise.race([
            captured.promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Tmux mirror refresh timed out")), 1_000)
            }),
          ])
          return true
        } finally {
          clearTimeout(timer)
          await refresh.stop()
        }
      },
      verify: (result) => {
        if (!result) throw new Error("Tmux mirror did not capture")
      },
    }),
    defineBenchmark({
      id: "terminal.agent_observation",
      tool: "terminal",
      description: "Apply 10,000 agent state observations",
      operationsPerSample: 10_000,
      run: () => {
        let observation: ReturnType<typeof observeAgent> | undefined
        for (let index = 0; index < 10_000; index += 1) {
          observation = observeAgent(
            observation,
            { key: "bench-agent", label: "Agent", profile: "codex" },
            { state: index % 4 ? "idle" : "working" },
            true,
            index * 1_000,
          )
        }
        return observation
      },
      verify: (result) => {
        if (result?.status.state !== "idle") throw new Error("Agent state did not settle")
      },
    }),
    defineBenchmark({
      id: "terminal.agent_detection",
      tool: "terminal",
      description: "Find an agent in a 2,000-process terminal tree",
      run: () => identifyAgent(1, processes),
      verify: (result) => {
        if (result?.profile !== "codex") throw new Error("Terminal agent was not detected")
      },
    }),
    defineBenchmark({
      id: "terminal.section_grouping",
      tool: "terminal",
      description: "Group 12 terminal panes and exclude three active agents from navigation",
      run: () => ({
        all: terminalSections(sessions),
        numbered: numberedTerminalSections(sessions),
      }),
      verify: (result) => {
        if (result.all.length !== 12 || result.numbered.length !== 9) {
          throw new Error("Terminal section navigation is incomplete")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.split_layout_normalize",
      tool: "terminal",
      description: "Normalize the remaining pane after 1,000 split closures",
      operationsPerSample: 1_000,
      run: () => {
        let normalized = splitRemainder
        for (let index = 0; index < 1_000; index += 1) {
          normalized = normalizeSectionLayout(splitRemainder, "section-0")
        }
        return normalized[0]
      },
      verify: (result) => {
        if (result?.row !== 0 || result.column !== 0) {
          throw new Error("Remaining split pane was not normalized")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.folder_state_roundtrip",
      tool: "terminal",
      description: "Save and reload 100 tmux folder assignments in disposable state storage",
      run: () => {
        saveTerminalWorkspaceState(
          root,
          {
            folders: [],
            assignments: folderAssignments,
            collapsedFolderIds: ["terminal", "tmux"],
          },
          folderEnvironment,
        )
        return loadTerminalWorkspaceState(root, folderEnvironment)
      },
      verify: (result) => {
        if (
          Object.keys(result.assignments).length !== 100 ||
          result.collapsedFolderIds.length !== 2
        ) {
          throw new Error("Terminal folder state was not restored")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.pinned_sidebar_relay",
      tool: "terminal",
      description: "Publish sidebar sessions, request navigation and produce a replica",
      beforeEach: resetPinnedTerminalSidebarForTests,
      run: () => {
        const owner = {}
        publishTerminalSidebar(owner, {
          sessions,
          folders: [{ id: "terminal", name: "Tuiminais" }],
          collapsedFolderIds: [],
          selectedFolder: "terminal",
          activeSessionId: "terminal-3",
          width: 24,
          height: 30,
          masterKey: "Ctrl+B",
          recentThreads: [],
          onSelectFolder: () => undefined,
          onToggleFolder: () => undefined,
          onActivate: () => undefined,
          onActions: () => undefined,
          onNew: () => undefined,
          onCommand: () => undefined,
        })
        requestPinnedTerminalTarget({ sessionId: "terminal-4" })
        requestTerminalSidebarFocus()
        const replica = terminalSidebarReplica()
        const snapshot = terminalSidebarSnapshot()
        clearTerminalSidebar(owner)
        return { replica, snapshot }
      },
      verify: ({ replica, snapshot }) => {
        if (
          replica?.sessions.length !== 12 ||
          snapshot.requestRevision !== 1 ||
          snapshot.focusRevision !== 1 ||
          !snapshot.requestedTarget ||
          !("sessionId" in snapshot.requestedTarget) ||
          snapshot.requestedTarget.sessionId !== "terminal-4"
        ) {
          throw new Error("Pinned sidebar did not relay navigation state")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.pinned_navigation_route",
      tool: "terminal",
      description: "Route pinned pane selection through Tuiminal to its host",
      run: async () => {
        const events: string[] = []
        const delivered = await routePinnedTerminalToTuiminal(
          { socket: "/tmp/benchmark.sock", paneId: "%8" },
          async (selection) => {
            events.push("paneId" in selection ? selection.paneId : "invalid")
            return true
          },
          async () => {
            events.push("host")
          },
        )
        return { delivered, events }
      },
      verify: ({ delivered, events }) => {
        if (!delivered || events.join(",") !== "%8,host") {
          throw new Error("Pinned navigation did not reach the host")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.live_diff_status",
      tool: "terminal",
      description: "Parse 500 Git status entries for Live Diff",
      run: () => parseLiveDiffStatus(status),
      verify: (result) => {
        if (result.length !== 500) throw new Error("Missing status entries")
      },
    }),
    defineBenchmark({
      id: "terminal.live_diff_scan",
      tool: "terminal",
      description: "Scan disposable Git worktree for Live Diff",
      run: () => readLiveDiffRoot(root, new AbortController().signal),
      verify: (result) => {
        if (!result.files.some((file) => file.path === "file-0.txt")) {
          throw new Error("Missing Live Diff file")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.live_diff_patch",
      tool: "terminal",
      description: "Load a changed file patch for Live Diff",
      run: () => readLiveDiffPatch({ ...changedFile, changedAt: 0 }, new AbortController().signal),
      verify: (result) => {
        if (!result.includes("+changed")) throw new Error("Missing Live Diff patch")
      },
    }),
  ]
  cases.push(...(await terminalFeatureBenchmarks()))
  cases.push(...(await terminalRuntimeBenchmarks(root)))
  return cases
}
