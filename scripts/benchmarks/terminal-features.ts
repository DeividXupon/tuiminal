import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function terminalFeatureBenchmarks(): Promise<BenchmarkCase[]> {
  const { detectAgentScreen } = await import(
    "../../packages/feature-terminal/src/model/agent-screen"
  )
  const { AgentTaskTitle } = await import(
    "../../packages/feature-terminal/src/model/agent-task-title"
  )
  const { mergeAgentMessageHistory } = await import(
    "../../packages/feature-terminal/src/model/agent-message-store"
  )
  const { nextTerminalFocusTarget } = await import(
    "../../packages/feature-terminal/src/model/focus-selection"
  )
  const { mergeLiveDiffFiles, liveDiffTotals } = await import(
    "../../packages/feature-terminal/src/model/live-diff"
  )
  const { visibleTerminalShortcutTargets } = await import(
    "../../packages/feature-terminal/src/model/sessions"
  )
  const { prepareLiveDiffPatch } = await import(
    "../../packages/feature-terminal/src/rendering/live-diff-hunks"
  )
  const { externalTerminalsFromProcesses } = await import(
    "../../packages/feature-terminal/src/services/external-terminal-discovery"
  )
  const { historyFromTurns } = await import(
    "../../packages/feature-terminal/src/services/codex-message-history"
  )
  const { codexResumeThreads } = await import(
    "../../packages/feature-terminal/src/services/codex-resume"
  )
  const { createCodexAgentCommand, createFreeTerminalCommand, createShellTerminalCommand } =
    await import("../../packages/feature-terminal/src/services/terminal")
  type AgentMessageHistoryEntry =
    import("../../packages/feature-terminal/src/model/agent-message-history").AgentMessageHistoryEntry
  type LiveDiffFile = import("../../packages/feature-terminal/src/model/live-diff").LiveDiffFile
  type TerminalFocusTargetKey =
    import("../../packages/feature-terminal/src/model/focus-selection").TerminalFocusTargetKey
  type TerminalSession =
    import("../../packages/feature-terminal/src/model/sessions").TerminalSession

  const identity = { key: "42:codex", label: "Codex", profile: "codex" as const }
  const agentScreen = `${Array.from(
    { length: 24 },
    (_, index) => `  output line ${index} with unicode 日本語 and build details`,
  ).join("\n")}\n• Running tests (12s • esc to interrupt)\n› write tests`
  const focusTargets = [
    { key: "sidebar:main" as const, left: 0, top: 0, width: 24, height: 40 },
    { key: "terminal:one" as const, left: 25, top: 0, width: 67, height: 25 },
    { key: "history:one" as const, left: 25, top: 26, width: 67, height: 14 },
    { key: "terminal:two" as const, left: 93, top: 0, width: 67, height: 40 },
    { key: "live-diff:two" as const, left: 126, top: 0, width: 34, height: 40 },
  ]
  const processCount = 1_000
  const externalProcesses = Array.from({ length: processCount }, (_, index) => ({
    pid: index + 1,
    parentPid: index % 10 === 0 ? 0 : index,
    executable: index % 10 === 9 ? "codex" : index % 10 === 0 ? "bash" : "worker",
    command: index % 10 === 9 ? "codex" : index % 10 === 0 ? "bash" : "worker",
  }))
  const externalGroups = externalProcesses.map((process, index) => ({
    pid: process.pid,
    parentPid: process.parentPid,
    processGroupId: Math.floor(index / 10) + 1,
    foregroundProcessGroupId: Math.floor(index / 10) + 1,
    terminalId: `pts/${Math.floor(index / 10)}`,
  }))
  const turns = Array.from({ length: 100 }, (_, index) => ({
    id: `turn-${index}`,
    status: "completed",
    startedAt: 1_780_000_000 + index,
    completedAt: 1_780_000_001 + index,
    items: [
      {
        id: `user-${index}`,
        type: "userMessage",
        content: [{ type: "text", text: `Implement feature ${index}` }],
      },
      { id: `reason-${index}`, type: "reasoning", summary: [`Plan ${index}`] },
      { id: `command-${index}`, type: "commandExecution", command: `bun test ${index}` },
      {
        id: `change-${index}`,
        type: "fileChange",
        changes: [
          {
            path: `src/feature-${index}.ts`,
            kind: "update",
            diff: `@@ -1 +1 @@\n-old ${index}\n+new ${index}\n`,
          },
        ],
      },
      {
        id: `response-${index}`,
        type: "agentMessage",
        phase: "final_answer",
        text: `Completed feature ${index}`,
      },
    ],
  }))
  const history = historyFromTurns(turns)
  const incomingHistory: AgentMessageHistoryEntry[] = history.map((entry, index) => ({
    ...entry,
    status: index % 10 ? "completed" : "failed",
    commentary: [`Update ${index}`],
  }))
  const resumeMessage = {
    result: {
      data: Array.from({ length: 100 }, (_, index) => ({
        id: `thread-${index}`,
        name: `Terminal feature ${index}`,
        preview: `Implement terminal feature ${index}`,
        cwd: `/tmp/project-${index}`,
        recencyAt: index,
        status: { type: index % 3 ? "idle" : "active", activeFlags: [] },
      })),
    },
  }
  const sessions: TerminalSession[] = Array.from({ length: 12 }, (_, index) => ({
    id: `feature-terminal-${index}`,
    sectionId: `feature-section-${index}`,
    folderId: index < 8 ? "terminal" : "others",
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
  const previousFiles: LiveDiffFile[] = Array.from({ length: 500 }, (_, index) => ({
    root: "/tmp/project",
    path: `src/file-${index}.ts`,
    additions: index,
    deletions: index % 7,
    fingerprint: `old-${index}`,
    untracked: false,
    newFile: false,
    change: "Edit",
    headExists: true,
    changedAt: index,
  }))
  const currentFiles = previousFiles.map(({ changedAt: _changedAt, ...file }, index) => ({
    ...file,
    fingerprint: index % 5 ? file.fingerprint : `new-${index}`,
  }))
  const patch = Array.from(
    { length: 200 },
    (_, index) => `@@ -${index + 1} +${index + 1} @@\n-old line ${index}\n+new line ${index}`,
  ).join("\n")

  return [
    defineBenchmark({
      id: "terminal.command_build",
      tool: "terminal",
      description: "Build 3,000 native shell, custom and Codex launch descriptions",
      operationsPerSample: 3_000,
      run: () => {
        let result = ""
        for (let index = 0; index < 1_000; index += 1) {
          result = createShellTerminalCommand().displayCommand
          result = createFreeTerminalCommand(`bun test --filter feature-${index}`).displayCommand
          result = createCodexAgentCommand(`thread-${index}`).displayCommand
        }
        return result
      },
      verify: (result) => {
        if (result !== "codex resume thread-999 --remote") throw new Error("Launch command changed")
      },
    }),
    defineBenchmark({
      id: "terminal.agent_screen",
      tool: "terminal",
      description: "Classify 1,000 rendered agent screens",
      operationsPerSample: 1_000,
      run: () => {
        let state = ""
        for (let index = 0; index < 1_000; index += 1) {
          state = detectAgentScreen("codex", agentScreen).state
        }
        return state
      },
      verify: (result) => {
        if (result !== "working") throw new Error("Agent screen was not classified")
      },
    }),
    defineBenchmark({
      id: "terminal.agent_task_title",
      tool: "terminal",
      description: "Observe 1,000 agent task title revisions",
      operationsPerSample: 1_000,
      run: () => {
        const title = new AgentTaskTitle(identity)
        for (let index = 0; index < 1_000; index += 1) {
          title.observe(`Codex - Implement terminal feature ${index} | working`, index)
        }
        return title.value
      },
      verify: (result) => {
        if (result !== "Implement terminal feature 999") throw new Error("Task title was lost")
      },
    }),
    defineBenchmark({
      id: "terminal.focus_navigation",
      tool: "terminal",
      description: "Resolve 10,000 spatial focus movements across Terminal companion panels",
      operationsPerSample: 10_000,
      run: () => {
        let key: TerminalFocusTargetKey = "sidebar:main"
        const directions = ["right", "down", "left", "up"] as const
        for (let index = 0; index < 10_000; index += 1) {
          const direction = directions[index % directions.length] ?? "right"
          key = nextTerminalFocusTarget(focusTargets, key, direction)
        }
        return key
      },
      verify: (result) => {
        if (!focusTargets.some((target) => target.key === result)) {
          throw new Error("Focus navigation returned an unknown panel")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.external_terminals",
      tool: "terminal",
      description: "Group 1,000 processes into 100 external terminal mirrors",
      run: () => externalTerminalsFromProcesses(externalGroups, externalProcesses, -1),
      verify: (result) => {
        if (result.length !== 100 || result.some((terminal) => !terminal.agent)) {
          throw new Error("External terminal discovery lost an agent")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.message_history_parse",
      tool: "terminal",
      description: "Parse 100 Codex turns with public activity and file changes",
      run: () => historyFromTurns(turns),
      verify: (result) => {
        if (result.length !== 100 || result[99]?.changes.length !== 1) {
          throw new Error("Codex history parsing lost a turn")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.message_history_merge",
      tool: "terminal",
      description: "Merge 100 live Codex message updates into sent-message history",
      run: () => mergeAgentMessageHistory(history, incomingHistory),
      verify: (result) => {
        if (result.length !== 100 || result[0]?.status !== "failed") {
          throw new Error("Codex history merge lost an update")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.resume_threads",
      tool: "terminal",
      description: "Parse, sort and bound 100 Codex resume thread summaries",
      run: () => codexResumeThreads(resumeMessage),
      verify: (result) => {
        if (result.length !== 6 || result[0]?.id !== "thread-99") {
          throw new Error("Recent Codex threads were not ordered")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.shortcut_targets",
      tool: "terminal",
      description: "Order agent and visible section targets for 10,000 Master Key updates",
      operationsPerSample: 10_000,
      run: () => {
        let targets: readonly TerminalSession[] = []
        for (let index = 0; index < 10_000; index += 1) {
          targets = visibleTerminalShortcutTargets(
            sessions,
            [
              { id: "terminal", name: "Tuiminais" },
              { id: "others", name: "Others" },
            ],
            index % 2 ? ["others"] : [],
          )
        }
        return targets
      },
      verify: (result) => {
        if (result.length !== 8 || !result[0]?.agent) throw new Error("Shortcut order changed")
      },
    }),
    defineBenchmark({
      id: "terminal.live_diff_merge",
      tool: "terminal",
      description: "Merge, sort and total 500 Live Diff file observations",
      run: () => {
        const files = mergeLiveDiffFiles(
          previousFiles,
          currentFiles,
          1_780_000_001_000,
          new Set(["/tmp/project"]),
        )
        return { files, totals: liveDiffTotals(files) }
      },
      verify: ({ files, totals }) => {
        if (
          files.length !== 500 ||
          totals.files !== 500 ||
          files[0]?.changedAt !== 1_780_000_001_000
        ) {
          throw new Error("Live Diff merge lost file state")
        }
      },
    }),
    defineBenchmark({
      id: "terminal.live_diff_render",
      tool: "terminal",
      description: "Prepare a 200-hunk Live Diff patch for the code preview",
      run: () => prepareLiveDiffPatch(patch),
      verify: (result) => {
        if (result.patch.split("\n").length < 600 || result.separatorLines.length !== 199) {
          throw new Error("Live Diff preview lost hunks")
        }
      },
    }),
  ]
}
