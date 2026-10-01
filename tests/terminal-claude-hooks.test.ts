import "./setup"
import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { AgentMessageHistoryEntry } from "../packages/feature-terminal/src/model/agent-message-history"
import type { AgentActivity, AgentState } from "../packages/feature-terminal/src/model/agent-state"
import {
  claudeResumeThreadsSnapshot,
  resetClaudeResumeThreadsForTests,
} from "../packages/feature-terminal/src/model/claude-resume-threads"
import { resolveAgentResumeCommand } from "../packages/feature-terminal/src/services/agent-resume-command"
import {
  ensureRemoteClaudeBackgroundSession,
  parseClaudeBackgroundSessions,
} from "../packages/feature-terminal/src/services/claude-background"
import { preflightClaude } from "../packages/feature-terminal/src/services/claude-compatibility"
import { resolveClaudeExecutable } from "../packages/feature-terminal/src/services/claude-executable"
import { startClaudeHookServer } from "../packages/feature-terminal/src/services/claude-hook-server"
import {
  ClaudeHookObserver,
  claudeBackgroundSettings,
  claudeHookSettings,
} from "../packages/feature-terminal/src/services/claude-hooks"
import {
  claudeResumeStorePath,
  loadClaudeResumeThreads,
  refreshClaudeResumeThreads,
  rememberClaudeResumeThread,
} from "../packages/feature-terminal/src/services/claude-resume-store"
import {
  claudeArguments,
  claudeVersionAtLeast,
  parseClaudeVersion,
  remoteClaudeAgentsCommand,
  remoteClaudeAttachCommand,
  remoteClaudeBackgroundStartCommand,
  remoteClaudeTerminalCommand,
  remoteClaudeTunnelCommand,
  supportedClaudeBackgroundSessions,
  supportedClaudeVersion,
} from "../packages/feature-terminal/src/services/remote-claude-connection"

const originalResume = process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME
const SESSION_1 = "11111111-1111-4111-8111-111111111111"
const SESSION_2 = "22222222-2222-4222-8222-222222222222"
const SESSION_INTERRUPTED = "33333333-3333-4333-8333-333333333333"
const SESSION_HTTP = "44444444-4444-4444-8444-444444444444"

function versionCommand(output: string, exitCode = 0) {
  return [
    process.execPath,
    "-e",
    `process.stdout.write(${JSON.stringify(output)}); process.exit(${exitCode})`,
  ]
}

afterEach(() => {
  if (originalResume === undefined) delete process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME
  else process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = originalResume
  resetClaudeResumeThreadsForTests()
})

test("Claude hooks project prompts, tools, permission waits and completed responses", () => {
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "0"
  const states: AgentState[] = []
  const activities: AgentActivity[] = []
  const titles: string[] = []
  let messages: readonly AgentMessageHistoryEntry[] = []
  const hydrations: unknown[] = []
  const observer = new ClaudeHookObserver(
    { cwd: "/workspace" },
    {
      onState: (state) => states.push(state),
      onActivity: (activity) => activities.push(activity),
      onTitle: (title) => titles.push(title),
      onUserMessageHistory(next, replace) {
        messages = replace
          ? next
          : [...messages.filter((entry) => entry.id !== next[0]?.id), ...next]
      },
      onHydrated: (hydration) => hydrations.push(hydration),
      onError: () => undefined,
    },
  )
  observer.receive({ hook_event_name: "SessionStart", session_id: SESSION_1 })
  observer.receive({
    hook_event_name: "UserPromptSubmit",
    session_id: SESSION_1,
    prompt_id: "prompt-1",
    prompt: "Corrija a autenticação",
  })
  observer.receive({
    hook_event_name: "PreToolUse",
    session_id: SESSION_1,
    tool_use_id: "tool-1",
    tool_name: "Edit",
    tool_input: { file_path: "src/auth.ts" },
  })
  observer.receive({
    hook_event_name: "PermissionRequest",
    session_id: SESSION_1,
    tool_name: "Bash",
  })
  observer.receive({
    hook_event_name: "Stop",
    session_id: SESSION_1,
    last_assistant_message: "Autenticação corrigida.",
  })

  expect(titles).toEqual(["Corrija a autenticação"])
  expect(activities).toEqual(["thinking", "coding"])
  expect(states).toEqual(["idle", "working", "working", "blocked", "done"])
  expect(messages).toHaveLength(1)
  expect(messages[0]).toMatchObject({
    text: "Corrija a autenticação",
    status: "completed",
    finalResponse: "Autenticação corrigida.",
  })
  expect(messages[0]?.activities[0]).toMatchObject({
    id: "tool-1",
    kind: "change",
    label: "Edit",
    detail: "src/auth.ts",
  })
  expect(hydrations.at(-1)).toMatchObject({
    threadId: SESSION_1,
    state: "done",
    latestTurnStatus: "completed",
    waitingOnApproval: false,
  })
})

test("Claude task titles prefer the published session title over prompts", () => {
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "0"
  const titles: string[] = []
  const observer = new ClaudeHookObserver(
    { cwd: "/workspace" },
    {
      onState: () => undefined,
      onActivity: () => undefined,
      onTitle: (title) => titles.push(title),
      onUserMessageHistory: () => undefined,
      onError: () => undefined,
    },
  )
  observer.observeTerminalTitle("✳ Claude Code")
  observer.receive({ hook_event_name: "UserPromptSubmit", session_id: SESSION_1, prompt: "Olá" })
  observer.receive({
    hook_event_name: "UserPromptSubmit",
    session_id: SESSION_1,
    prompt: "E agora?",
  })
  observer.observeTerminalTitle("⠂ Fix sidebar task titles")
  observer.observeTerminalTitle("◐ Fix sidebar task titles")
  observer.receive({ hook_event_name: "UserPromptSubmit", session_id: SESSION_1, prompt: "Mais" })
  observer.observeTerminalTitle("✳ Renamed session")
  observer.observeTerminalTitle("✳ Claude Code")
  observer.receive({ hook_event_name: "SessionStart", session_id: SESSION_2 })

  expect(titles).toEqual(["Olá", "Fix sidebar task titles", "Renamed session", "Olá", ""])
})

test("Claude tool hooks keep their activity after entering the working state", () => {
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "0"
  // Mirrors the launcher: entering "working" resets the visible activity to "thinking".
  let activity: AgentActivity | null = null
  const visible: Array<AgentActivity | null> = []
  const observer = new ClaudeHookObserver(
    { cwd: "/workspace" },
    {
      onState(state) {
        if (state === "working") activity = "thinking"
      },
      onActivity(next) {
        activity = next
      },
      onTitle: () => undefined,
      onUserMessageHistory: () => undefined,
      onError: () => undefined,
    },
  )
  observer.receive({ hook_event_name: "UserPromptSubmit", session_id: SESSION_1, prompt: "Go" })
  visible.push(activity)
  for (const [tool, id] of [
    ["Read", "tool-read"],
    ["Grep", "tool-grep"],
    ["Edit", "tool-edit"],
    ["Bash", "tool-bash"],
  ] as const) {
    observer.receive({
      hook_event_name: "PreToolUse",
      session_id: SESSION_1,
      tool_name: tool,
      tool_use_id: id,
    })
    visible.push(activity)
    observer.receive({
      hook_event_name: "PostToolUse",
      session_id: SESSION_1,
      tool_name: tool,
      tool_use_id: id,
    })
    visible.push(activity)
  }
  observer.receive({ hook_event_name: "MessageDisplay", session_id: SESSION_1, delta: "Feito" })
  visible.push(activity)
  observer.receive({ hook_event_name: "Stop", session_id: SESSION_1 })
  observer.receive({ hook_event_name: "MessageDisplay", session_id: SESSION_1, final: true })
  visible.push(activity)
  observer.receive({ hook_event_name: "UserPromptSubmit", session_id: SESSION_1, prompt: "Mais" })
  visible.push(activity)

  expect(visible).toEqual([
    "thinking",
    "reading",
    "reading",
    "searching",
    "searching",
    "coding",
    "coding",
    "running",
    "running",
    "writing",
    "writing",
    "thinking",
  ])
})

test("Claude session ids that are not UUIDs are never resumed or turned into flags", () => {
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "0"
  const hydrations: Array<{ threadId: string }> = []
  const observer = new ClaudeHookObserver(
    { cwd: "/workspace", resumeThreadId: "--dangerously-skip-permissions" },
    {
      onState: () => undefined,
      onActivity: () => undefined,
      onTitle: () => undefined,
      onUserMessageHistory: () => undefined,
      onHydrated: (hydration) => hydrations.push(hydration),
      onError: () => undefined,
    },
  )
  observer.receive({
    hook_event_name: "SessionStart",
    session_id: "--dangerously-skip-permissions",
  })
  expect(hydrations).toEqual([])
  observer.receive({ hook_event_name: "SessionStart", session_id: SESSION_1 })
  expect(hydrations.map((hydration) => hydration.threadId)).toEqual([SESSION_1])

  expect(claudeArguments("{}", SESSION_1)).toEqual(["--settings", "{}", "--resume", SESSION_1])
  expect(() => claudeArguments("{}", "--dangerously-skip-permissions")).toThrow(
    "A sessão do Claude Code selecionada é inválida.",
  )
  expect(() =>
    remoteClaudeTerminalCommand(
      { id: "work", name: "Work", host: "work-alias" },
      "/srv/project",
      "{}",
      "--dangerously-skip-permissions",
    ),
  ).toThrow("A sessão do Claude Code selecionada é inválida.")
})

test("Claude hook settings observe without returning approval decisions", () => {
  const settings = JSON.parse(claudeHookSettings("http://127.0.0.1:1234/secret"))
  expect(settings.hooks.PermissionRequest[0].hooks[0]).toEqual({
    type: "http",
    url: "http://127.0.0.1:1234/secret",
    timeout: 2,
  })
  expect(JSON.stringify(settings)).not.toContain("decision")
  expect(settings.hooks.StopFailure).toBeUndefined()
  expect(settings.hooks.MessageDisplay).toBeUndefined()
  const local = JSON.parse(
    claudeHookSettings("http://127.0.0.1:1234/secret", { messageDisplay: true }),
  )
  expect(local.hooks.MessageDisplay[0].hooks[0]).toEqual({
    type: "http",
    url: "http://127.0.0.1:1234/secret",
    timeout: 1,
  })
  expect(claudeVersionAtLeast("2.1.152 (Claude Code)", [2, 1, 152])).toBe(true)
  expect(claudeVersionAtLeast("2.1.151 (Claude Code)", [2, 1, 152])).toBe(false)
  const background = JSON.parse(
    claudeHookSettings("http://127.0.0.1:1234/secret", { backgroundInPlace: true }),
  )
  expect(background.worktree).toEqual({ bgIsolation: "none" })
})

test("SessionEnd interrupts an unfinished turn without publishing successful hydration", () => {
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "0"
  const states: AgentState[] = []
  const hydrations: Array<{ state: AgentState; latestTurnStatus: string | null }> = []
  let message: AgentMessageHistoryEntry | undefined
  const observer = new ClaudeHookObserver(
    { cwd: "/workspace" },
    {
      onState: (state) => states.push(state),
      onActivity: () => undefined,
      onTitle: () => undefined,
      onUserMessageHistory: (messages) => {
        message = messages[0]
      },
      onHydrated: (hydration) => hydrations.push(hydration),
      onError: () => undefined,
    },
  )
  observer.receive({ hook_event_name: "SessionStart", session_id: SESSION_INTERRUPTED })
  observer.receive({
    hook_event_name: "UserPromptSubmit",
    session_id: SESSION_INTERRUPTED,
    prompt: "Continue",
  })
  observer.receive({ hook_event_name: "SessionEnd", session_id: SESSION_INTERRUPTED })

  expect(states).toEqual(["idle", "working", "unknown"])
  expect(message?.status).toBe("interrupted")
  expect(hydrations.some((hydration) => hydration.latestTurnStatus === "completed")).toBe(false)
})

test("Claude hook server accepts only its bounded loopback endpoint", async () => {
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "0"
  const states: AgentState[] = []
  const observer = new ClaudeHookObserver(
    { cwd: "/workspace" },
    {
      onState: (state) => states.push(state),
      onActivity: () => undefined,
      onTitle: () => undefined,
      onUserMessageHistory: () => undefined,
      onError: () => undefined,
    },
  )
  const server = startClaudeHookServer(observer)
  try {
    expect(new URL(server.url).hostname).toBe("127.0.0.1")
    expect(await fetch(`http://127.0.0.1:${server.port}/wrong`, { method: "POST" })).toMatchObject({
      status: 404,
    })
    const response = await fetch(server.url, {
      method: "POST",
      body: JSON.stringify({ hook_event_name: "SessionStart", session_id: SESSION_HTTP }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(states).toEqual(["idle"])
    const oversized = await fetch(server.url, {
      method: "POST",
      body: JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: "ignored",
        padding: "x".repeat(300 * 1024),
      }),
    })
    expect(oversized.status).toBe(200)
    expect(states).toEqual(["idle"])
  } finally {
    server.stop()
  }
})

test("Claude versions and remote commands preserve argv and loopback tunnel boundaries", () => {
  expect(parseClaudeVersion("2.1.286 (Claude Code)")).toEqual([2, 1, 286])
  expect(supportedClaudeVersion("2.1.63")).toBe(true)
  expect(supportedClaudeVersion("2.1.62")).toBe(false)
  expect(supportedClaudeBackgroundSessions("2.1.285")).toBe(true)
  expect(supportedClaudeBackgroundSessions("2.1.284")).toBe(false)
  const profile = { id: "work", name: "Work", host: "work-alias" }
  const command = remoteClaudeTerminalCommand(
    profile,
    "/srv/project with quote's",
    '{"hooks":{}}',
    SESSION_1,
  )
  expect(command.slice(0, 2)).toEqual(["ssh", "-tt"])
  expect(command).toContain("work-alias")
  expect(command).toContain("RemoteCommand=none")
  expect(command).toContain("ClearAllForwardings=yes")
  expect(command.at(-1)).toContain("--resume")
  expect(command.at(-1)).toContain(SESSION_1)
  expect(command.at(-1)).toContain("project with quote")
  expect(command.at(-1)).not.toContain(".claude")
  const created = remoteClaudeBackgroundStartCommand(
    profile,
    "/srv/project",
    '{"hooks":{}}',
    SESSION_2,
    false,
  )
  expect(created.at(-1)).toContain("--session-id")
  expect(created.at(-1)).toContain(SESSION_2)
  expect(created.at(-1)).toContain("--bg")
  expect(created.slice(0, 2)).toEqual(["ssh", "-T"])
  const resumed = remoteClaudeBackgroundStartCommand(
    profile,
    "/srv/project",
    '{"hooks":{}}',
    SESSION_1,
    true,
  )
  expect(resumed.at(-1)).toContain("--resume")
  expect(resumed.at(-1)).toContain(SESSION_1)
  expect(resumed.at(-1)).toContain("--bg")
  const attached = remoteClaudeAttachCommand(profile, "/srv/project", "7c5dcf5d")
  expect(attached.at(-1)).toContain("attach")
  expect(attached.at(-1)).toContain("7c5dcf5d")
  const agents = remoteClaudeAgentsCommand(profile, "/srv/project with spaces")
  expect(agents.at(-1)).toContain("agents --json --all --cwd")
  expect(agents.at(-1)).toContain("/srv/project with spaces")
  expect(remoteClaudeTunnelCommand(profile, 42123)).toContain("127.0.0.1:0:127.0.0.1:42123")
  expect(remoteClaudeTunnelCommand(profile, 42123)).toContain("ClearAllForwardings=no")
  expect(remoteClaudeTunnelCommand(profile, 42123)).toContain("SessionType=none")
  expect(remoteClaudeTunnelCommand(profile, 42123)).not.toContain("SessionType=default")
  expect(remoteClaudeTunnelCommand(profile, 42123)).toContain("none")
  expect(claudeBackgroundSettings()).toBe('{"worktree":{"bgIsolation":"none"}}')
  expect(claudeBackgroundSettings()).not.toContain("hooks")
})

test("Claude's official background JSON is projected without reading internal files", () => {
  expect(
    parseClaudeBackgroundSessions(
      JSON.stringify([
        {
          id: "7c5dcf5d",
          sessionId: SESSION_1,
          cwd: "/srv/project",
          kind: "background",
          startedAt: 1_700_000_000_000,
          state: "blocked",
          status: "waiting",
          waitingFor: "permission prompt",
          name: "Fix auth",
        },
        {
          cwd: "/srv/interactive",
          kind: "interactive",
          startedAt: 1_700_000_000_001,
        },
      ]),
    ),
  ).toEqual([
    {
      id: "7c5dcf5d",
      sessionId: SESSION_1,
      cwd: "/srv/project",
      name: "Fix auth",
      startedAt: 1_700_000_000_000,
      state: "blocked",
      status: "waiting",
      waitingFor: "permission prompt",
    },
  ])
})

test("Claude background dispatch resolves the official short id through fake remote calls", async () => {
  const remote = {
    profile: { id: "work", name: "Work", host: "work-alias" },
    workingDirectory: "/srv/project",
  }
  let reads = 0
  const commands: (readonly string[])[] = []
  const launch = await ensureRemoteClaudeBackgroundSession(
    remote,
    SESSION_1,
    '{"hooks":{}}',
    false,
    new AbortController().signal,
    {
      async readSessions() {
        reads += 1
        return reads === 1
          ? []
          : [
              {
                id: "7c5dcf5d",
                sessionId: SESSION_1,
                cwd: "/srv/project",
                name: "Fix auth",
                startedAt: 1_700_000_000_000,
                state: "working",
                status: "busy",
                waitingFor: "",
              },
            ]
      },
      async runCommand(command) {
        commands.push(command)
        return { exitCode: 0, stdout: "backgrounded · 7c5dcf5d\n", stderr: "" }
      },
    },
  )

  expect(launch).toEqual({ sessionId: SESSION_1, shortId: "7c5dcf5d" })
  expect(commands).toHaveLength(1)
  expect(commands[0]?.at(-1)).toContain("--session-id")
  expect(commands[0]?.at(-1)).toContain(SESSION_1)
  expect(commands[0]?.at(-1)).toContain("--bg")
})

test("Claude background dispatch reports when the remote CLI rejects agent view", async () => {
  await expect(
    ensureRemoteClaudeBackgroundSession(
      {
        profile: { id: "work", name: "Work", host: "work-alias" },
        workingDirectory: "/srv/project",
      },
      SESSION_1,
      "{}",
      false,
      new AbortController().signal,
      {
        async readSessions() {
          return []
        },
        async runCommand() {
          return { exitCode: 2, stdout: "", stderr: "unknown option --bg" }
        },
      },
    ),
  ).rejects.toThrow("Não foi possível iniciar a sessão remota do Claude Code.")
})

test("Claude preflight reports missing and unsupported CLIs for the update guide", async () => {
  await expect(
    preflightClaude({ cwd: "/workspace" }, new AbortController().signal, {
      command: versionCommand("", 127),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({
    report: {
      providerId: "claude",
      reason: "localClaudeMissing",
      localVersion: null,
    },
  })
  await expect(
    preflightClaude({ cwd: "/workspace" }, new AbortController().signal, {
      command: versionCommand("2.1.62 (Claude Code)"),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({
    report: {
      providerId: "claude",
      reason: "claudeVersionUnsupported",
      localVersion: "2.1.62",
    },
  })
  await expect(
    preflightClaude(
      {
        cwd: "/srv/project",
        remote: {
          profile: { id: "work", name: "Work", host: "work-alias" },
          workingDirectory: "/srv/project",
        },
      },
      new AbortController().signal,
      { command: versionCommand("2.1.284 (Claude Code)"), timeoutMs: 1_000 },
    ),
  ).resolves.toMatchObject({
    providerId: "claude",
    compatible: true,
    reason: null,
    remoteVersion: "2.1.284",
  })
})

test("Claude executable discovery never probes files under ~/.claude", () => {
  const checked: string[] = []
  expect(
    resolveClaudeExecutable({
      home: "/home/tester",
      which: () => null,
      executable(path) {
        checked.push(path)
        return false
      },
    }),
  ).toBe("claude")
  expect(checked.some((path) => path.includes("/.claude/"))).toBe(false)
})

test("Claude-injected prompts never replace the user's preview or fallback title", () => {
  const workspaceState = process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "1"
  try {
    const titles: string[] = []
    const observer = new ClaudeHookObserver(
      { cwd: "/workspace" },
      {
        onState: () => undefined,
        onActivity: () => undefined,
        onTitle: (title) => titles.push(title),
        onUserMessageHistory: () => undefined,
        onError: () => undefined,
      },
    )
    observer.receive({
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION_1,
      prompt:
        "<task-notification>\n<task-id>a</task-id>\n<summary>Done</summary>\n</task-notification>",
    })
    observer.receive({
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION_1,
      prompt: "Sync now",
    })
    observer.receive({
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION_1,
      prompt: `<task-notification>${"x".repeat(5_000)}</task-notification>`,
    })
    observer.receive({
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION_1,
      prompt: '<channel source="ci">Build failed</channel>',
    })

    expect(titles).toEqual(["Sync now"])
    expect(claudeResumeThreadsSnapshot()[0]).toMatchObject({ id: SESSION_1, preview: "Sync now" })
  } finally {
    if (workspaceState === undefined) delete process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
    else process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = workspaceState
  }
})

test("Claude resume metadata is bounded, private and reloadable", () => {
  const root = mkdtempSync("/tmp/opencode/tuiminal-claude-")
  const environment = {
    ...process.env,
    XDG_DATA_HOME: root,
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  try {
    rememberClaudeResumeThread(
      {
        id: SESSION_1,
        title: "Fix auth",
        preview: "Fix auth now",
        lastResponse: "Done",
        cwd: "/srv/project",
        projectName: "project",
        gitBranch: "",
        updatedAt: 123,
        state: "idle",
        remoteProfileId: "work",
        remoteProfileName: "Work",
        remoteProfileHost: "work-alias",
      },
      environment,
    )
    expect(claudeResumeThreadsSnapshot()[0]).toMatchObject({
      preview: "Fix auth now",
      lastResponse: "Done",
    })
    expect(loadClaudeResumeThreads(environment)[0]).toMatchObject({
      id: SESSION_1,
      remoteProfileId: "work",
      remoteProfileHost: "work-alias",
      preview: "",
      lastResponse: "",
    })
    const stored = loadClaudeResumeThreads(environment)[0]
    if (!stored) throw new Error("Claude resume metadata was not stored")
    const resumed = resolveAgentResumeCommand({ ...stored, providerId: "claude" }, [
      { id: "work", name: "Renamed", host: "work-alias" },
    ])
    expect(resumed.command?.agentLaunch?.remote).toEqual({
      profile: { id: "work", name: "Work", host: "work-alias" },
      workingDirectory: "/srv/project",
    })
    expect(
      resolveAgentResumeCommand({ ...stored, providerId: "claude" }, [
        { id: "work", name: "Work", host: "different-alias" },
      ]).error,
    ).toBe("O perfil remoto desta sessão não está mais configurado.")
    rememberClaudeResumeThread(
      {
        id: SESSION_2,
        title: "Second session",
        preview: "Second private prompt",
        lastResponse: "Second private response",
        cwd: "/workspace/two",
        projectName: "two",
        gitBranch: "",
        updatedAt: 124,
        state: "idle",
      },
      environment,
    )
    refreshClaudeResumeThreads(environment)
    expect(claudeResumeThreadsSnapshot().find((thread) => thread.id === SESSION_1)).toMatchObject({
      preview: "Fix auth now",
      lastResponse: "Done",
    })
    const longPrompt = `Refactor ${"the authentication flow ".repeat(8)}carefully`
    rememberClaudeResumeThread(
      {
        id: SESSION_INTERRUPTED,
        title: longPrompt,
        preview: longPrompt,
        lastResponse: "",
        cwd: "/workspace/three",
        projectName: "three",
        gitBranch: "",
        updatedAt: 125,
        state: "idle",
      },
      environment,
    )
    rememberClaudeResumeThread(
      {
        id: "--dangerously-skip-permissions",
        title: "Injected",
        preview: "",
        lastResponse: "",
        cwd: "/workspace",
        projectName: "workspace",
        gitBranch: "",
        updatedAt: 126,
        state: "idle",
      },
      environment,
    )
    const storedTitle = loadClaudeResumeThreads(environment).find(
      (thread) => thread.id === SESSION_INTERRUPTED,
    )?.title
    expect(Array.from(storedTitle ?? "")).toHaveLength(60)
    expect(storedTitle?.endsWith("…")).toBe(true)
    expect(loadClaudeResumeThreads(environment).map((thread) => thread.id)).not.toContain(
      "--dangerously-skip-permissions",
    )
    const persisted = readFileSync(claudeResumeStorePath(environment), "utf8")
    expect(JSON.parse(persisted)).toMatchObject({ version: 1 })
    expect(persisted).not.toContain("Fix auth now")
    expect(persisted).not.toContain("Done")
    expect(persisted).not.toContain("Second private")
    expect(persisted).not.toContain(longPrompt)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
