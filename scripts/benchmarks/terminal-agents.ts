import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function terminalAgentBenchmarks(root: string): Promise<BenchmarkCase[]> {
  const { agentProvider } = await import("../../packages/feature-terminal/src/model/agent-provider")
  const {
    publishClaudeResumeThreads,
    resetClaudeResumeThreadsForTests,
    claudeResumeThreadsSnapshot,
  } = await import("../../packages/feature-terminal/src/model/claude-resume-threads")
  const {
    openCodeResumeThreadsSnapshot,
    publishOpenCodeResumeThreads,
    resetOpenCodeResumeThreadsForTests,
  } = await import("../../packages/feature-terminal/src/model/opencode-resume-threads")
  const { agentProviderAdapter } = await import(
    "../../packages/feature-terminal/src/services/agent-provider-adapters"
  )
  const { resolveAgentResumeCommand } = await import(
    "../../packages/feature-terminal/src/services/agent-resume-command"
  )
  const { mergeRecentProjects } = await import(
    "../../packages/feature-terminal/src/services/agent-project-recents"
  )
  const { directorySuggestions } = await import(
    "../../packages/feature-terminal/src/services/agent-directory-search"
  )
  const { discoverAgentGitProjects } = await import(
    "../../packages/feature-terminal/src/services/agent-git-projects"
  )
  const { parseClaudeBackgroundSessions } = await import(
    "../../packages/feature-terminal/src/services/claude-background"
  )
  const { ClaudeHookObserver } = await import(
    "../../packages/feature-terminal/src/services/claude-hooks"
  )
  const { openCodeMessageHistory } = await import(
    "../../packages/feature-terminal/src/services/opencode-api"
  )
  const { applyOpenCodeLiveEvent } = await import(
    "../../packages/feature-terminal/src/services/opencode-live-event"
  )
  const { OpenCodeSessionProjection } = await import(
    "../../packages/feature-terminal/src/services/opencode-session-projection"
  )
  type AgentMessageHistoryEntry =
    import("../../packages/feature-terminal/src/model/agent-message-history").AgentMessageHistoryEntry
  type AgentState = import("../../packages/feature-terminal/src/model/agent-state").AgentState

  const profile = { id: "benchmark", name: "Benchmark", host: "benchmark" }
  const providers = ["codex", "claude", "opencode"] as const
  const resumeIds = {
    codex: "thread-benchmark",
    claude: "11111111-1111-4111-8111-111111111111",
    opencode: "ses_benchmark",
  }
  const recentProjects = Array.from({ length: 5_000 }, (_, index) => ({
    providerId: providers[index % providers.length] ?? "codex",
    source: index % 2 ? "local" : `ssh:profile-${index % 30}`,
    path: `/workspace/project-${index % 1_500}`,
    usedAt: 1_780_000_000_000 + index,
  }))
  const directoryPaths = Array.from({ length: 2_000 }, (_, index) => `/workspace/project-${index}`)
  const projectRoot = join(dirname(root), "terminal-agent-projects")
  mkdirSync(projectRoot, { recursive: true })
  for (let index = 0; index < 80; index += 1)
    mkdirSync(join(projectRoot, `project-${index}`, ".git"), { recursive: true })
  mkdirSync(join(projectRoot, "node_modules", "ignored", ".git"), { recursive: true })

  const claudeSessions = JSON.stringify(
    Array.from({ length: 1_000 }, (_, index) => ({
      kind: "background",
      id: `agent-${index}`,
      sessionId: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      cwd: `/srv/project-${index}`,
      name: `Task ${index}`,
      startedAt: 1_780_000_000_000 + index,
      state: index % 5 === 0 ? "blocked" : "working",
      status: index % 5 === 0 ? "waiting" : "busy",
      waitingFor: index % 5 === 0 ? "approval" : "",
    })),
  )
  const openCodeMessages = Array.from({ length: 500 }, (_, index) => [
    {
      info: {
        id: `user-${index}`,
        role: "user",
        time: { created: 1_780_000_000_000 + index * 10 },
        model: { providerID: "openai", modelID: "gpt-benchmark" },
      },
      parts: [{ id: `prompt-${index}`, type: "text", text: `Implement feature ${index}` }],
    },
    {
      info: {
        id: `assistant-${index}`,
        role: "assistant",
        parentID: `user-${index}`,
        providerID: "openai",
        modelID: "gpt-benchmark",
        time: {
          created: 1_780_000_000_001 + index * 10,
          completed: 1_780_000_000_005 + index * 10,
        },
      },
      parts: [
        {
          id: `tool-${index}`,
          type: "tool",
          tool: "bash",
          state: { status: "completed", output: "ok" },
        },
        { id: `response-${index}`, type: "text", text: `Completed feature ${index}` },
      ],
    },
  ]).flat()
  const resumeThreads = Array.from({ length: 100 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    title: `Task ${index}`,
    preview: `Prompt ${index}`,
    lastResponse: `Done ${index}`,
    cwd: `/workspace/project-${index}`,
    projectName: `project-${index}`,
    gitBranch: "main",
    updatedAt: 1_780_000_000_000 + index,
    state: "idle" as const,
  }))
  const openCodeEvents = [
    { type: "session.status", data: { sessionID: "ses_benchmark", status: { type: "busy" } } },
    {
      type: "session.tool.input.started",
      data: { sessionID: "ses_benchmark", id: "call-shell", name: "shell" },
    },
    { type: "session.tool.called", data: { sessionID: "ses_benchmark", id: "call-shell" } },
    { type: "session.idle", data: { sessionID: "ses_benchmark" } },
  ]
  const codexAdapter = agentProviderAdapter("codex")
  const firstResumeThread = resumeThreads[0]
  const firstOpenCodeEvent = openCodeEvents[0]
  if (!codexAdapter || !firstResumeThread || !firstOpenCodeEvent)
    throw new Error("Terminal agent benchmark fixtures are incomplete")

  return [
    defineBenchmark({
      id: "terminal.provider_commands",
      tool: "terminal",
      description: "Build 6,000 local and remote first-party agent launch descriptions",
      operationsPerSample: 6_000,
      run: () => {
        let result = codexAdapter.createCommand({ kind: "local" })
        for (let index = 0; index < 1_000; index += 1)
          for (const provider of providers) {
            const adapter = agentProviderAdapter(provider)
            if (!adapter) throw new Error(`Missing ${provider} benchmark adapter`)
            result = adapter.createCommand(
              { kind: "local" },
              `/workspace/project-${index}`,
              resumeIds[provider],
            )
            result = adapter.createCommand(
              { kind: "remote", profile },
              `/srv/project-${index}`,
              resumeIds[provider],
            )
          }
        return result
      },
      verify: (result) => {
        if (
          result.agentLaunch?.providerId !== "opencode" ||
          result.agentLaunch.remote?.profile.id !== "benchmark"
        )
          throw new Error("Provider command construction lost remote launch metadata")
      },
    }),
    defineBenchmark({
      id: "terminal.provider_resume",
      tool: "terminal",
      description: "Resolve 3,000 provider-specific local and remote resume commands",
      operationsPerSample: 3_000,
      run: () => {
        let result: ReturnType<typeof resolveAgentResumeCommand> | undefined
        for (let index = 0; index < 1_000; index += 1)
          for (const providerId of providers)
            result = resolveAgentResumeCommand(
              {
                ...(resumeThreads[index % resumeThreads.length] ?? firstResumeThread),
                id: resumeIds[providerId],
                providerId,
                remoteProfileId: profile.id,
                remoteProfileName: profile.name,
                remoteProfileHost: profile.host,
              },
              [profile],
            )
        return result
      },
      verify: (result) => {
        if (result?.command?.agentLaunch?.providerId !== "opencode" || result.error)
          throw new Error("Provider resume did not retain its original integration")
      },
    }),
    defineBenchmark({
      id: "terminal.project_recents",
      tool: "terminal",
      description: "Deduplicate and bound 5,000 provider-scoped recent projects",
      run: () => mergeRecentProjects(recentProjects),
      verify: (result) => {
        if (!result.length || result.length > 1_300)
          throw new Error("Recent agent projects were not bounded")
      },
    }),
    defineBenchmark({
      id: "terminal.project_autocomplete",
      tool: "terminal",
      description: "Filter 2,000 project directories for 100 path autocomplete updates",
      operationsPerSample: 100,
      run: () => {
        let suggestions: string[] = []
        for (let index = 0; index < 100; index += 1)
          suggestions = directorySuggestions(directoryPaths, `~/project-${index % 10}`, false)
        return suggestions
      },
      verify: (result) => {
        if (!result.length || result.some((path) => !path.includes("project-9")))
          throw new Error("Project autocomplete returned unrelated directories")
      },
    }),
    defineBenchmark({
      id: "terminal.project_discovery",
      tool: "terminal",
      description: "Discover 80 Git projects in a bounded disposable directory tree",
      run: () =>
        discoverAgentGitProjects({ kind: "local" }, [], new AbortController().signal, {
          roots: [projectRoot],
        }),
      verify: (result) => {
        if (
          result.paths.length !== 80 ||
          result.paths.some((path) => path.includes("node_modules"))
        )
          throw new Error("Agent project discovery crossed its bounded tree")
      },
    }),
    defineBenchmark({
      id: "terminal.claude_hooks",
      tool: "terminal",
      description: "Project 100 Claude prompt, tool, permission and completion hook turns",
      operationsPerSample: 100,
      run: () => {
        let latest: AgentMessageHistoryEntry | undefined
        let state: AgentState = "unknown"
        const observer = new ClaudeHookObserver(
          { cwd: "/workspace" },
          {
            onActivity: () => undefined,
            onState: (next) => {
              state = next
            },
            onTitle: () => undefined,
            onUserMessageHistory: (messages) => {
              latest = messages[0]
            },
            onError: () => undefined,
          },
        )
        for (let index = 0; index < 100; index += 1) {
          observer.receive({
            hook_event_name: "UserPromptSubmit",
            prompt_id: `prompt-${index}`,
            prompt: `Implement feature ${index}`,
          })
          observer.receive({
            hook_event_name: "PreToolUse",
            tool_use_id: `tool-${index}`,
            tool_name: "Edit",
            tool_input: { file_path: `src/feature-${index}.ts` },
          })
          observer.receive({ hook_event_name: "PermissionRequest" })
          observer.receive({
            hook_event_name: "Stop",
            last_assistant_message: `Completed feature ${index}`,
          })
        }
        return { latest, state }
      },
      verify: ({ latest, state }) => {
        if (latest?.status !== "completed" || latest.activities.length !== 2 || state !== "done")
          throw new Error("Claude hook projection lost the completed turn")
      },
    }),
    defineBenchmark({
      id: "terminal.claude_background",
      tool: "terminal",
      description: "Parse 1,000 official Claude background-session rows",
      run: () => parseClaudeBackgroundSessions(claudeSessions),
      verify: (result) => {
        if (result.length !== 1_000 || result[0]?.sessionId.length !== 36)
          throw new Error("Claude background session parsing lost valid rows")
      },
    }),
    defineBenchmark({
      id: "terminal.opencode_events",
      tool: "terminal",
      description: "Apply 10,000 OpenCode lifecycle and tool events",
      operationsPerSample: 10_000,
      run: () => {
        const observed = {
          state: "idle" as AgentState,
          activity: null,
          waitingOnApproval: false,
          toolActivities: new Map(),
          settled: true,
        }
        for (let index = 0; index < 10_000; index += 1) {
          const event = openCodeEvents[index % openCodeEvents.length] ?? firstOpenCodeEvent
          applyOpenCodeLiveEvent(observed, event, event.type)
        }
        return observed
      },
      verify: (result) => {
        if (result.state !== "idle" || result.activity !== null || result.toolActivities.size)
          throw new Error("OpenCode event projection did not settle")
      },
    }),
    defineBenchmark({
      id: "terminal.opencode_history",
      tool: "terminal",
      description: "Project 500 OpenCode message turns with public tool activity",
      run: () => openCodeMessageHistory(openCodeMessages, "done"),
      verify: (result) => {
        if (result.length !== 500 || result[499]?.finalResponse !== "Completed feature 499")
          throw new Error("OpenCode history projection lost a turn")
      },
    }),
    defineBenchmark({
      id: "terminal.opencode_projection",
      tool: "terminal",
      description: "Project 1,000 OpenCode root sessions into one Terminal pane",
      operationsPerSample: 1_000,
      run: () => {
        const projection = new OpenCodeSessionProjection("benchmark", agentProvider("opencode"))
        for (let index = 0; index < 1_000; index += 1)
          projection.upsert({
            session: {
              id: `ses-${index}`,
              title: `Task ${index}`,
              directory: `/workspace/project-${index}`,
              updatedAt: index,
            },
            state: index % 2 ? "working" : "idle",
            activity: index % 2 ? "coding" : null,
            messages: [],
            waitingOnApproval: false,
          })
        projection.activate("ses-999")
        return projection.snapshot()
      },
      verify: (result) => {
        if (result.sessions.length !== 1_000 || result.active?.id !== "ses-999")
          throw new Error("OpenCode session projection lost its active root session")
      },
    }),
    defineBenchmark({
      id: "terminal.provider_resume_merge",
      tool: "terminal",
      description: "Merge local and remote Claude/OpenCode resume rosters",
      beforeEach: () => {
        resetClaudeResumeThreadsForTests()
        resetOpenCodeResumeThreadsForTests()
      },
      run: () => {
        publishClaudeResumeThreads([
          ...resumeThreads,
          ...resumeThreads.map((thread) => ({ ...thread, remoteProfileId: profile.id })),
        ])
        publishOpenCodeResumeThreads(resumeThreads)
        publishOpenCodeResumeThreads(
          resumeThreads.map((thread) => ({ ...thread, remoteProfileId: profile.id })),
          profile.id,
        )
        return {
          claude: claudeResumeThreadsSnapshot(),
          openCode: openCodeResumeThreadsSnapshot(),
        }
      },
      verify: ({ claude, openCode }) => {
        if (claude.length !== 100 || openCode.length !== 200)
          throw new Error("Provider resume rosters were not merged and bounded")
      },
    }),
  ]
}
