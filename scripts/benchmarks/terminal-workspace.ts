import { dirname, join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function terminalWorkspaceBenchmarks(root: string): Promise<BenchmarkCase[]> {
  const { orderedRunningAgents } = await import(
    "../../packages/feature-terminal/src/model/sessions"
  )
  const { createRemoteProjectSyncPreview } = await import(
    "../../packages/feature-terminal/src/services/remote-project-sync-diff"
  )
  const { loadRemoteProjectSyncSnapshot, saveRemoteProjectSyncSnapshot } = await import(
    "../../packages/feature-terminal/src/services/remote-project-sync-state"
  )
  const { readTerminalRepositoryContext } = await import(
    "../../packages/feature-terminal/src/services/terminal-repository-context"
  )
  const { terminalContextTags } = await import(
    "../../packages/feature-terminal/src/rendering/terminal-context"
  )
  const { terminalWorkspaceFocusTargets } = await import(
    "../../packages/feature-terminal/src/rendering/terminal-workspace-presentation"
  )
  const {
    liveDiffHeights,
    messageHistoryHeights,
    paneContextWidth,
    paneLiveDiffWidths,
    remoteSetupHeights,
    terminalContentWidth,
  } = await import("../../packages/feature-terminal/src/ui/free-terminal-pane-layout")
  type RemoteProjectSyncEntry =
    import("../../packages/feature-terminal/src/model/remote-project-sync").RemoteProjectSyncEntry
  type RemoteProjectSyncMapping =
    import("../../packages/feature-terminal/src/model/remote-project-sync").RemoteProjectSyncMapping
  type TerminalSession =
    import("../../packages/feature-terminal/src/model/sessions").TerminalSession

  const baseSession = {
    sectionId: "section",
    folderId: "terminal",
    row: 0 as const,
    column: 0 as const,
    kind: "shell" as const,
    label: "Shell",
    shortLabel: "sh",
    displayCommand: "sh",
    command: ["sh"],
    accent: "#4488ff",
    title: "Terminal",
    status: "running" as const,
    pid: 42,
    exitCode: null,
    startedAt: 1_780_000_000_000,
  }
  const remoteProfile = { id: "work", name: "Work", host: "work" }
  const screenAgent = (index: number): TerminalSession => ({
    ...baseSession,
    id: `agent-${index}`,
    sectionId: `section-${index}`,
    title: `Agent ${index}`,
    agent: {
      key: `agent-${index}`,
      label: "Codex",
      profile: "codex",
      state: "working",
      activity: "coding",
    },
  })
  const localAgent = (index: number): TerminalSession => ({
    ...baseSession,
    id: `agent-${index}`,
    sectionId: `section-${index}`,
    title: `Agent ${index}`,
    agent: {
      key: `agent-${index}`,
      label: "Claude Code",
      profile: "claude",
      state: "working",
      activity: "coding",
    },
    agentIntegration: { providerId: "claude", transport: "hooks" },
    agentLaunch: { providerId: "claude", transport: "hooks" },
  })
  const remoteAgent = (index: number): TerminalSession => ({
    ...baseSession,
    id: `agent-${index}`,
    sectionId: `section-${index}`,
    title: `Agent ${index}`,
    agent: {
      key: `agent-${index}`,
      label: "OpenCode",
      profile: "opencode",
      state: "working",
      activity: "coding",
    },
    agentIntegration: { providerId: "opencode", transport: "app-server" },
    agentLaunch: {
      providerId: "opencode",
      transport: "app-server",
      remote: { profile: remoteProfile, workingDirectory: "/srv/project" },
    },
  })
  const agentSessions = [
    screenAgent(0),
    screenAgent(1),
    localAgent(2),
    localAgent(3),
    remoteAgent(4),
    remoteAgent(5),
  ]
  const splitSessions: TerminalSession[] = [
    {
      ...baseSession,
      id: "left",
      agent: {
        key: "left-agent",
        label: "Codex",
        profile: "codex",
        state: "working",
        activity: "coding",
      },
      agentIntegration: { providerId: "codex", transport: "app-server" },
    },
    {
      ...baseSession,
      id: "right",
      column: 1,
      title: "Remote setup",
      agent: null,
      remoteSetup: { profile: { id: "work", name: "Work", host: "work" } },
    },
  ]
  const liveDiffTargets = new Map([
    ["left", { startedAt: baseSession.startedAt, agentKey: "left-agent", sessionId: "left" }],
  ])
  const messageHistoryTargets = new Map([
    ["right", { sessionId: "right", startedAt: baseSession.startedAt, focusRequest: 1 }],
  ])
  const messages = new Map([["right", []]])

  const baselineEntries: RemoteProjectSyncEntry[] = Array.from({ length: 5_000 }, (_, index) => ({
    path: `src/file-${index}.ts`,
    type: "file",
    mode: 0o644,
    size: 100 + index,
    modifiedAt: index,
    changedAt: index,
    target: "",
    digest: index.toString(16).padStart(40, "0"),
  }))
  const changedEntry = (entry: RemoteProjectSyncEntry, marker: string) => ({
    ...entry,
    digest: `${marker}${entry.digest?.slice(1)}`,
  })
  const remoteEntries = baselineEntries.map((entry, index) =>
    index % 10 === 0 ? changedEntry(entry, "a") : entry,
  )
  const localEntries = baselineEntries.map((entry, index) =>
    index % 25 === 0 ? changedEntry(entry, "b") : entry,
  )
  const manifest = (
    entries: RemoteProjectSyncEntry[],
    fingerprint: string,
    canonicalPath: string,
  ) => ({
    fingerprint,
    canonicalPath,
    scope: "complete" as const,
    entries,
    hasUnsupported: false,
    hasSymlink: false,
  })
  const baseline = {
    version: 1 as const,
    remote: manifest(baselineEntries, "1".repeat(64), "/srv/project"),
    local: manifest(baselineEntries, "2".repeat(64), join(dirname(root), "project-sync")),
  }
  const currentRemote = manifest(remoteEntries, "3".repeat(64), "/srv/project")
  const currentLocal = manifest(localEntries, "4".repeat(64), join(dirname(root), "project-sync"))
  const stateEnvironment = {
    ...process.env,
    XDG_DATA_HOME: join(dirname(root), "terminal-workspace-benchmark-data"),
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  let snapshotMapping: RemoteProjectSyncMapping = {
    profileId: "benchmark",
    sourcePath: "/srv/project",
    remotePath: "/srv/project",
    localPath: baseline.local.canonicalPath,
    remoteFingerprint: baseline.remote.fingerprint,
    localFingerprint: baseline.local.fingerprint,
    syncedAt: 1_780_000_000_000,
  }

  return [
    defineBenchmark({
      id: "terminal.agent_grouping",
      tool: "terminal",
      description: "Order 10,000 screen, localhost and remote integrated-agent groups",
      operationsPerSample: 10_000,
      run: () => {
        let ordered: readonly TerminalSession[] = []
        for (let index = 0; index < 10_000; index += 1)
          ordered = orderedRunningAgents(index % 2 ? agentSessions : [...agentSessions].reverse())
        return ordered
      },
      verify: (result) => {
        if (
          result.length !== 6 ||
          result.slice(0, 2).some((session) => session.agentIntegration) ||
          result.slice(-2).some((session) => !session.agentLaunch?.remote)
        )
          throw new Error("Agent origin grouping changed")
      },
    }),
    defineBenchmark({
      id: "terminal.context_tags",
      tool: "terminal",
      description: "Fit 10,000 repository and synchronization context-tag layouts",
      operationsPerSample: 10_000,
      run: () => {
        let tags: ReturnType<typeof terminalContextTags> = []
        for (let index = 0; index < 10_000; index += 1)
          tags = terminalContextTags(
            {
              directory: "/workspace/project",
              projectName: "project",
              branch: "feature/terminal-benchmarks",
              state: "dirty",
            },
            30 + (index % 91),
            { kind: "out-of-sync", localPath: "/local/project", difference: "both" },
            "Ctrl+B",
            index,
          )
        return tags
      },
      verify: (result) => {
        if (!result.some((tag) => tag.kind === "sync"))
          throw new Error("Terminal context omitted synchronization state")
      },
    }),
    defineBenchmark({
      id: "terminal.pane_layout",
      tool: "terminal",
      description: "Resolve 10,000 companion, history and setup pane geometries",
      operationsPerSample: 10_000,
      run: () => {
        let result: unknown
        for (let index = 0; index < 10_000; index += 1) {
          const liveDiff = {
            agentKey: "agent",
            manualDirectories: [],
            stacked: index % 2 === 0,
            coversTerminal: false,
            sharesSplitPane: index % 3 === 0,
            running: true,
            focusRequest: index,
          }
          const widths = paneLiveDiffWidths(80 + (index % 80), index % 2 === 0, liveDiff)
          result = {
            widths,
            content: terminalContentWidth(liveDiff, 120, widths.terminalWidth),
            diff: liveDiffHeights(20 + (index % 30), false, liveDiff.stacked, true),
            history: messageHistoryHeights(30, true, index % 2 === 0),
            setup: remoteSetupHeights(30, true),
            context: paneContextWidth(liveDiff, 120, widths.terminalWidth, false),
          }
        }
        return result as {
          widths: { terminalWidth: number }
          setup: { setupHeight: number | string }
        }
      },
      verify: (result) => {
        if (result.widths.terminalWidth < 1 || result.setup.setupHeight !== 10)
          throw new Error("Terminal pane geometry became invalid")
      },
    }),
    defineBenchmark({
      id: "terminal.workspace_focus_targets",
      tool: "terminal",
      description: "Build 10,000 spatial focus maps for a split workspace with companions",
      operationsPerSample: 10_000,
      run: () => {
        let targets: ReturnType<typeof terminalWorkspaceFocusTargets> = []
        for (let index = 0; index < 10_000; index += 1)
          targets = terminalWorkspaceFocusTargets({
            sessions: splitSessions,
            activeSession: splitSessions[index % splitSessions.length],
            liveDiffTargets,
            messageHistoryTargets,
            messages,
            availableWidth: 160,
            availableHeight: 40,
            sidebarWidth: 24,
          })
        return targets
      },
      verify: (result) => {
        if (
          !result.includes("sidebar:main") ||
          !result.includes("live-diff:left") ||
          !result.includes("history:right") ||
          !result.includes("setup:right")
        )
          throw new Error("Terminal workspace focus map lost a companion")
      },
    }),
    defineBenchmark({
      id: "terminal.repository_context",
      tool: "terminal",
      description: "Read branch and dirty state from the disposable Terminal repository",
      run: () => readTerminalRepositoryContext(root, new AbortController().signal),
      verify: (result) => {
        if (result.branch !== "feature" || result.state !== "dirty")
          throw new Error("Terminal repository context lost branch or status")
      },
    }),
    defineBenchmark({
      id: "terminal.project_sync_diff",
      tool: "terminal",
      description: "Compare 5,000-entry remote, local and baseline project manifests",
      run: () =>
        createRemoteProjectSyncPreview({
          remote: currentRemote,
          local: currentLocal,
          mapping: snapshotMapping,
          snapshot: baseline,
        }),
      verify: (result) => {
        if (
          result.changes.length !== 600 ||
          result.indicator.difference !== "both" ||
          !result.hasLocalChanges
        )
          throw new Error("Project synchronization comparison lost changed paths")
      },
    }),
    defineBenchmark({
      id: "terminal.project_sync_snapshot",
      tool: "terminal",
      description: "Validate, compress, save and reload a 5,000-entry synchronization snapshot",
      run: async () => {
        snapshotMapping = await saveRemoteProjectSyncSnapshot(
          snapshotMapping,
          baseline,
          stateEnvironment,
        )
        return loadRemoteProjectSyncSnapshot(snapshotMapping, stateEnvironment)
      },
      verify: (result) => {
        if (result?.remote.entries.length !== 5_000 || result.local.entries.length !== 5_000)
          throw new Error("Project synchronization snapshot did not roundtrip")
      },
    }),
  ]
}
