import "./setup"
import { describe, expect, test } from "bun:test"
import { agentProvider } from "../packages/feature-terminal/src/model/agent-provider"
import {
  mergeOpenCodeResumeThreads,
  openCodeResumeThreadsSnapshot,
  resetOpenCodeResumeThreadsForTests,
  upsertOpenCodeResumeThread,
} from "../packages/feature-terminal/src/model/opencode-resume-threads"
import {
  openCodeLastResponse,
  openCodeMessageHistory,
  openCodeResumeThreads,
  parseOpenCodeFileDiffs,
  parseOpenCodeSession,
} from "../packages/feature-terminal/src/services/opencode-api"
import {
  openCodeEventActivity,
  openCodeEventSessionId,
  openCodeEventState,
} from "../packages/feature-terminal/src/services/opencode-events"
import {
  hydratedOpenCodeState,
  listOpenCodeSessions,
  openCodeSessionMessages,
} from "../packages/feature-terminal/src/services/opencode-hydration"
import { OpenCodeObserver } from "../packages/feature-terminal/src/services/opencode-observer"
import {
  compatibleRemoteOpenCode,
  detectOpenCodeServerProtocol,
  detectOpenCodeServerVersion,
  openCodeAuthorization,
  openCodeCliProtocol,
  openCodeServerEnvironment,
  openCodeTuiCommand,
  openCodeTuiConfigContent,
  openCodeVersion,
  readOpenCodeJsonResponse,
} from "../packages/feature-terminal/src/services/opencode-protocol"
import { OpenCodeSessionProjection } from "../packages/feature-terminal/src/services/opencode-session-projection"
import { createOpenCodeTuiControl } from "../packages/feature-terminal/src/services/opencode-tui-control"
import { preflightRemoteOpenCode } from "../packages/feature-terminal/src/services/remote-opencode-compatibility"
import {
  remoteOpenCodeServerCommand,
  remoteOpenCodeVersionCommand,
} from "../packages/feature-terminal/src/services/remote-opencode-connection"

const session = {
  id: "ses_one",
  title: "Implement OpenCode",
  directory: "/workspace/project",
  time: { created: 1_700_000_000_000, updated: 1_700_000_010_000 },
}

function versionCommand(output: string, exitCode = 0) {
  return [
    process.execPath,
    "-e",
    `process.stdout.write(${JSON.stringify(output)}); process.exit(${exitCode})`,
  ]
}

describe("OpenCode public protocol projection", () => {
  test("maps the current v2 session envelope and location", () => {
    expect(
      parseOpenCodeSession({
        data: {
          id: "ses_v2",
          title: "Current OpenCode",
          location: { directory: "/workspace/v2" },
          time: { created: 1_700_000_000_000, updated: 1_700_000_020_000 },
        },
      }),
    ).toEqual({
      id: "ses_v2",
      title: "Current OpenCode",
      directory: "/workspace/v2",
      updatedAt: 1_700_000_020_000,
    })
  })

  test("projects session summaries into provider recents", () => {
    expect(openCodeResumeThreads([session], { id: "work", name: "Work" })).toEqual([
      {
        id: "ses_one",
        title: "Implement OpenCode",
        preview: "Implement OpenCode",
        lastResponse: "",
        cwd: "/workspace/project",
        projectName: "project",
        gitBranch: "",
        updatedAt: 1_700_000_010_000,
        state: "idle",
        remoteProfileId: "work",
        remoteProfileName: "Work",
      },
    ])
  })

  test("project refreshes keep known OpenCode agent chats from other projects", () => {
    resetOpenCodeResumeThreadsForTests()
    const thread = (id: string, cwd: string, updatedAt: number) => ({
      id,
      title: `Task ${id}`,
      preview: `Prompt ${id}`,
      lastResponse: "",
      cwd,
      projectName: cwd.split("/").at(-1) ?? cwd,
      gitBranch: "",
      updatedAt,
      state: "idle" as const,
    })
    try {
      upsertOpenCodeResumeThread(thread("ses_agent", "/workspace/agent-project", 2))
      mergeOpenCodeResumeThreads([thread("ses_current", "/workspace/current", 3)])

      expect(openCodeResumeThreadsSnapshot().map(({ id }) => id)).toEqual([
        "ses_current",
        "ses_agent",
      ])
      mergeOpenCodeResumeThreads([])
      expect(openCodeResumeThreadsSnapshot().map(({ id }) => id)).toContain("ses_agent")
    } finally {
      resetOpenCodeResumeThreadsForTests()
    }
  })

  test("maps user messages, final responses, tools and exact message diffs", () => {
    const messages = [
      {
        info: {
          id: "msg_user",
          sessionID: "ses_one",
          role: "user",
          time: { created: 1_700_000_000_000 },
          model: { providerID: "openai", modelID: "gpt-5" },
        },
        parts: [{ id: "part_user", type: "text", text: "Implement it" }],
      },
      {
        info: {
          id: "msg_assistant",
          sessionID: "ses_one",
          role: "assistant",
          parentID: "msg_user",
          providerID: "openai",
          modelID: "gpt-5",
          time: { created: 1_700_000_001_000, completed: 1_700_000_004_000 },
        },
        parts: [
          { id: "part_reasoning", type: "reasoning", text: "private reasoning" },
          {
            id: "part_tool",
            type: "tool",
            tool: "bash",
            state: {
              status: "completed",
              output: "tests passed",
              time: { start: 1_700_000_002_000, end: 1_700_000_003_000 },
            },
          },
          { id: "part_text", type: "text", text: "Implemented." },
        ],
      },
    ]
    const changes = parseOpenCodeFileDiffs(
      [{ file: "src/app.ts", before: "old", after: "new", status: "modified" }],
      "msg_user",
    )
    const history = openCodeMessageHistory(messages, "done", new Map([["msg_user", changes]]))
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: "opencode:msg_user",
      text: "Implement it",
      status: "completed",
      durationMs: 4_000,
      model: "openai/gpt-5",
      finalResponse: "Implemented.",
    })
    expect(history[0]?.reasoningSummaries).toEqual([])
    expect(history[0]?.activities.map((activity) => [activity.kind, activity.label])).toEqual([
      ["tool", "bash"],
    ])
    expect(history[0]?.activities[0]?.at).toBe(1_700_000_002_000)
    expect(history[0]?.changes[0]?.path).toBe("src/app.ts")
    expect(history[0]?.turnDiff).toContain("+++ b/src/app.ts")
    expect(openCodeLastResponse(messages)).toBe("Implemented.")

    const officialPatch = parseOpenCodeFileDiffs(
      [{ file: "src/app.ts", patch: "@@ -1 +1 @@\n-old\n+new", status: "modified" }],
      "msg_user",
    )
    expect(officialPatch[0]?.diff).toBe("@@ -1 +1 @@\n-old\n+new")
  })

  test("maps legacy and current event envelopes without reading screen text", () => {
    const part = {
      type: "message.part.updated",
      properties: {
        sessionID: "ses_one",
        part: { id: "part_text", sessionID: "ses_one", type: "text", text: "Hi" },
      },
    }
    expect(openCodeEventSessionId(part)).toBe("ses_one")
    expect(openCodeEventActivity(part)).toBe("writing")
    expect(openCodeEventState(part)).toBe("working")
    expect(
      openCodeEventState({
        payload: { type: "permission.asked", properties: { sessionID: "ses_one" } },
      }),
    ).toBe("blocked")
    expect(openCodeEventState({ type: "session.idle", data: { sessionID: "ses_one" } })).toBe(
      "idle",
    )
    expect(
      openCodeEventState({
        type: "session.execution.started",
        data: { sessionID: "ses_one" },
      }),
    ).toBe("working")
    expect(
      openCodeEventState({
        type: "session.execution.succeeded",
        data: { sessionID: "ses_one" },
      }),
    ).toBe("done")
    expect(
      openCodeEventActivity({
        type: "session.reasoning.delta",
        data: { sessionID: "ses_one" },
      }),
    ).toBe("thinking")
    expect(
      openCodeEventActivity({
        type: "session.tool.called",
        data: { sessionID: "ses_one" },
      }),
    ).toBe("tooling")
    expect(
      openCodeEventActivity({
        type: "session.tool.input.started",
        data: { sessionID: "ses_one", id: "call_shell", name: "shell" },
      }),
    ).toBe("running")
    expect(
      openCodeEventActivity({
        type: "session.tool.input.started",
        data: { sessionID: "ses_one", id: "call_edit", name: "edit" },
      }),
    ).toBe("coding")
    expect(
      openCodeEventActivity({
        type: "session.tool.input.started",
        data: { sessionID: "ses_one", id: "call_read", name: "read" },
      }),
    ).toBe("tooling")
    expect(
      openCodeEventActivity({
        type: "session.shell.started",
        data: { sessionID: "ses_one" },
      }),
    ).toBe("running")
    expect(
      openCodeEventSessionId({
        type: "form.created",
        data: { form: { id: "frm_one", sessionID: "ses_one" } },
      }),
    ).toBe("ses_one")
    expect(
      openCodeEventState({
        type: "form.created",
        data: { form: { id: "frm_one", sessionID: "ses_one" } },
      }),
    ).toBe("blocked")
  })

  test("keeps interleaved root sessions isolated and removes deleted sessions", () => {
    const snapshots = new Map<string, { title: string; state: string; activity: string | null }>()
    const active: string[] = []
    const removed: string[] = []
    const observer = new OpenCodeObserver(
      "http://127.0.0.1:1",
      "/workspace/project",
      undefined,
      {
        onActivity() {},
        onState() {},
        onTitle() {},
        onUserMessageHistory() {},
        onError() {},
        onSessionUpdated(value) {
          snapshots.set(value.session.id, {
            title: value.session.title,
            state: value.state,
            activity: value.activity,
          })
        },
        onActiveSessionChanged(sessionId) {
          active.push(sessionId)
        },
        onSessionRemoved(sessionId) {
          removed.push(sessionId)
          snapshots.delete(sessionId)
        },
      },
      "v2",
    )
    const created = (id: string, title: string, parentID?: string) => ({
      id: `evt_${id}`,
      type: "session.created",
      created: 1_700_000_000_000,
      location: { directory: "/workspace/project" },
      data: {
        sessionID: id,
        title,
        location: { directory: "/workspace/project" },
        ...(parentID ? { parentID } : {}),
      },
    })

    observer.observeEvent(created("ses_one", "First task"))
    observer.observeEvent(created("ses_child", "Subagent", "ses_one"))
    observer.observeEvent(created("ses_two", "Second task"))
    observer.observeEvent({
      directory: "/workspace/other",
      ...created("ses_other", "Other project"),
    })
    observer.observeEvent({
      type: "session.status",
      data: { sessionID: "ses_one", status: { type: "busy" } },
    })
    observer.observeEvent({
      type: "session.tool.input.started",
      data: { sessionID: "ses_one", id: "call_shell", name: "shell" },
    })
    observer.observeEvent({
      type: "session.tool.called",
      data: { sessionID: "ses_one", id: "call_shell" },
    })
    expect(snapshots.get("ses_one")?.activity).toBe("running")
    observer.observeEvent({
      type: "session.tool.input.started",
      data: { sessionID: "ses_one", id: "call_edit", name: "edit" },
    })
    observer.observeEvent({
      type: "session.tool.called",
      data: { sessionID: "ses_one", id: "call_edit" },
    })
    observer.observeEvent({
      type: "permission.asked",
      data: { sessionID: "ses_two" },
    })

    expect([...snapshots]).toEqual([
      ["ses_one", { title: "First task", state: "working", activity: "coding" }],
      ["ses_two", { title: "Second task", state: "blocked", activity: null }],
    ])
    observer.observeEvent({
      type: "session.execution.succeeded",
      data: { sessionID: "ses_one" },
    })
    observer.observeEvent({
      type: "session.status",
      data: { sessionID: "ses_one", status: { type: "idle" } },
    })
    expect(snapshots.get("ses_one")).toEqual({
      title: "First task",
      state: "idle",
      activity: null,
    })
    expect(active).toEqual(["ses_one", "ses_two"])
    observer.observeTerminalTitle("First task")
    expect(active).toEqual(["ses_one", "ses_two", "ses_one"])

    observer.observeEvent({
      type: "session.deleted",
      data: { sessionID: "ses_two" },
    })
    expect(removed).toEqual(["ses_two"])
    expect([...snapshots.keys()]).toEqual(["ses_one"])
    expect(active).toEqual(["ses_one", "ses_two", "ses_one"])
    observer.observeEvent(
      created("ses_long", "A very long OpenCode task title that the TUI truncates"),
    )
    const activationsBeforeTruncatedTitle = active.length
    observer.observeTerminalTitle("A very long OpenCode task title that …")
    expect(active).toHaveLength(activationsBeforeTruncatedTitle + 1)
    expect(active.at(-1)).toBe("ses_long")
    observer.stop()
  })

  test("keeps a newly visible session active when activation arrives before its snapshot", () => {
    const projection = new OpenCodeSessionProjection("terminal-one", agentProvider("opencode"))
    const hydration = (id: string, title: string) => ({
      session: { id, title, directory: "/workspace/project", updatedAt: 1 },
      state: "idle" as const,
      activity: null,
      messages: [],
      waitingOnApproval: false,
    })
    projection.upsert(hydration("ses_one", "First"))
    projection.activate("ses_two")
    projection.upsert(hydration("ses_two", "Second"))

    expect(projection.snapshot()).toMatchObject({
      active: { id: "ses_two", agent: { taskTitle: "Second" } },
      sessions: [{ id: "ses_one" }, { id: "ses_two" }],
    })
    projection.remove("ses_two")
    expect(projection.snapshot().active?.id).toBe("ses_one")
  })

  test("keeps live activity when optional v2 hydration requests are rejected", async () => {
    const snapshots: Array<{ state: string; activity: string | null }> = []
    const errors: string[] = []
    const requests: string[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        requests.push(new URL(request.url).pathname)
        return new Response(null, { status: 403 })
      },
    })
    const observer = new OpenCodeObserver(
      server.url.toString(),
      "/workspace/project",
      undefined,
      {
        onActivity() {},
        onState() {},
        onTitle() {},
        onUserMessageHistory() {},
        onError(message) {
          errors.push(message)
        },
        onSessionUpdated(value) {
          snapshots.push({ state: value.state, activity: value.activity })
        },
      },
      "v2",
    )
    try {
      observer.observeEvent({
        type: "session.created",
        created: 1_700_000_000_000,
        location: { directory: "/workspace/project" },
        data: {
          sessionID: "ses_one",
          title: "Live task",
          location: { directory: "/workspace/project" },
        },
      })
      observer.observeEvent({
        type: "session.tool.called",
        data: { sessionID: "ses_one" },
      })
      for (let attempt = 0; attempt < 50 && requests.length < 3; attempt++) await Bun.sleep(5)

      expect(requests.sort()).toEqual([
        "/api/session/active",
        "/api/session/ses_one",
        "/api/session/ses_one/message",
      ])
      expect(snapshots.at(-1)).toEqual({ state: "working", activity: "tooling" })
      expect(errors).toEqual([])
    } finally {
      observer.stop()
      server.stop(true)
    }
  })

  test("does not reopen a settled execution from a lagging active snapshot", async () => {
    const states: string[] = []
    let activeRequests = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname === "/api/session/active") {
          activeRequests += 1
          return Response.json({ data: { ses_one: { type: "running" } } })
        }
        return new Response(null, { status: 403 })
      },
    })
    const observer = new OpenCodeObserver(
      server.url.toString(),
      "/workspace/project",
      undefined,
      {
        onActivity() {},
        onState() {},
        onTitle() {},
        onUserMessageHistory() {},
        onError() {},
        onSessionUpdated(value) {
          states.push(value.state)
        },
      },
      "v2",
    )
    try {
      observer.observeEvent({
        type: "session.created",
        created: 1_700_000_000_000,
        location: { directory: "/workspace/project" },
        data: {
          sessionID: "ses_one",
          title: "Settled task",
          location: { directory: "/workspace/project" },
        },
      })
      observer.observeEvent({
        type: "session.tool.called",
        data: { sessionID: "ses_one" },
      })
      observer.observeEvent({
        type: "session.execution.succeeded",
        data: { sessionID: "ses_one" },
      })
      observer.observeEvent({
        type: "session.status",
        data: { sessionID: "ses_one", status: { type: "idle" } },
      })
      const beforeHydration = states.length
      for (
        let attempt = 0;
        attempt < 50 && (activeRequests === 0 || states.length === beforeHydration);
        attempt++
      )
        await Bun.sleep(5)

      expect(states).toContain("done")
      expect(states.at(-1)).toBe("idle")
    } finally {
      observer.stop()
      server.stop(true)
    }
  })

  test("keeps OpenCode v1 on the legacy single-session callback path", () => {
    const titles: string[] = []
    const projected: string[] = []
    const observer = new OpenCodeObserver(
      "http://127.0.0.1:1",
      "/workspace/project",
      undefined,
      {
        onActivity() {},
        onState() {},
        onTitle(title) {
          titles.push(title)
        },
        onUserMessageHistory() {},
        onError() {},
        onSessionUpdated(hydration) {
          projected.push(hydration.session.id)
        },
      },
      "v1",
    )

    observer.observeEvent({
      type: "session.created",
      properties: {
        info: {
          id: "ses_legacy",
          title: "Legacy task",
          directory: "/workspace/project",
          time: { created: 1_700_000_000_000 },
        },
      },
    })

    expect(titles.length).toBeGreaterThan(0)
    expect(new Set(titles)).toEqual(new Set(["Legacy task"]))
    expect(projected).toEqual([])
    observer.stop()
  })
})

test("OpenCode JSON reader accepts no-content and BOM-prefixed JSON", async () => {
  await expect(readOpenCodeJsonResponse(new Response(null, { status: 204 }))).resolves.toBeNull()
  await expect(
    readOpenCodeJsonResponse(
      new Response(`\uFEFF {"healthy":true}\n`, {
        headers: { "content-type": "application/json" },
      }),
    ),
  ).resolves.toEqual({ healthy: true })
})

test("OpenCode v2 can list root chats globally for Master Key resume", async () => {
  let requested: URL | undefined
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requested = new URL(request.url)
      return Response.json({
        data: [
          {
            id: "ses_other_project",
            title: "Other project chat",
            location: { directory: "/workspace/other" },
            time: { updated: 1_700_000_000_000 },
          },
        ],
        cursor: {},
      })
    },
  })
  try {
    await expect(
      listOpenCodeSessions(server.url.toString(), undefined, new AbortController().signal, "v2"),
    ).resolves.toMatchObject([
      {
        id: "ses_other_project",
        directory: "/workspace/other",
      },
    ])
    expect(requested?.pathname).toBe("/api/session")
    expect(requested?.searchParams.has("directory")).toBe(false)
    expect(requested?.searchParams.get("parentID")).toBe("null")
  } finally {
    server.stop(true)
  }
})

test("OpenCode v2 message pagination sends order only on the first page", async () => {
  const requests: URL[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      requests.push(url)
      if (!url.searchParams.has("cursor"))
        return Response.json({
          data: [{ id: "msg_one", type: "user", text: "Implement it" }],
          cursor: { next: "next-page" },
        })
      return Response.json({ data: [], cursor: {} })
    },
  })
  try {
    await expect(
      openCodeSessionMessages(
        server.url.toString(),
        "/workspace/project",
        "ses_one",
        new AbortController().signal,
        "v2",
      ),
    ).resolves.toEqual([{ id: "msg_one", type: "user", text: "Implement it" }])
    expect(requests.map((url) => url.pathname)).toEqual([
      "/api/session/ses_one/message",
      "/api/session/ses_one/message",
    ])
    expect(requests[0]?.searchParams.get("order")).toBe("asc")
    expect(requests[1]?.searchParams.get("cursor")).toBe("next-page")
    expect(requests[1]?.searchParams.has("order")).toBe(false)
  } finally {
    server.stop(true)
  }
})

test("OpenCode v2 active snapshot upgrades an initially idle session to working", () => {
  expect(hydratedOpenCodeState("idle", "working", false, undefined)).toBe("working")
  expect(hydratedOpenCodeState("done", "idle", false, undefined)).toBe("done")
})

test("OpenCode TUI control reports only changed visible-session titles", () => {
  const titles: string[] = []
  const control = createOpenCodeTuiControl({ onTitle: (title) => titles.push(title) })
  const encoder = new TextEncoder()

  control.observeData(encoder.encode("\x1b]0;First task\x07"))
  control.observeData(encoder.encode("\x1b]0;First task\x07"))
  control.observeData(encoder.encode("\x1b]2;Second task\x1b\\"))

  expect(titles).toEqual(["First task", "Second task"])
})

test("OpenCode protocol detection ignores the web fallback and recognizes v2 health", async () => {
  const paths: string[] = []
  const authorizations: Array<string | null> = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    paths.push(url.pathname)
    authorizations.push(new Headers(init?.headers).get("authorization"))
    if (url.pathname === "/api/info")
      return new Response(JSON.stringify({ ok: true, pid: 1234, version: "2.0.20" }), {
        headers: { "content-type": "application/json" },
      })
    return new Response("<!doctype html>", { headers: { "content-type": "text/html" } })
  }) as typeof fetch

  await expect(
    detectOpenCodeServerProtocol(
      "http://127.0.0.1:4096",
      new AbortController().signal,
      fetcher,
      openCodeAuthorization({ username: "opencode", password: "temporary" }),
    ),
  ).resolves.toBe("v2")
  expect(paths.sort()).toEqual(["/api/health", "/api/info", "/global/health"])
  expect(new Set(authorizations)).toEqual(new Set(["Basic b3BlbmNvZGU6dGVtcG9yYXJ5"]))
})

test("OpenCode version detection reads authenticated v2 server information", async () => {
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Basic dGVzdDpzZWNyZXQ=")
    return new Response(JSON.stringify({ version: "2.0.20" }), {
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  await expect(
    detectOpenCodeServerVersion(
      "http://127.0.0.1:4096",
      new AbortController().signal,
      fetcher,
      openCodeAuthorization({ username: "test", password: "secret" }),
    ),
  ).resolves.toBe("2.0.20")
  expect(openCodeVersion("opencode v2.0.20-beta.1")).toBe("2.0.20-beta.1")
  expect(openCodeVersion("unknown")).toBeNull()
})

test("OpenCode protocol detection preserves the legacy JSON health contract", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === "/global/health")
      return new Response(JSON.stringify({ healthy: true, version: "1.18.29" }), {
        headers: { "content-type": "application/json" },
      })
    return new Response("<!doctype html>", { headers: { "content-type": "text/html" } })
  }) as typeof fetch

  await expect(
    detectOpenCodeServerProtocol("http://127.0.0.1:4096", new AbortController().signal, fetcher),
  ).resolves.toBe("v1")
})

test("OpenCode TUI command follows the negotiated server generation", () => {
  expect(openCodeCliProtocol("opencode v2.0.20")).toBe("v2")
  expect(openCodeCliProtocol("1.18.29")).toBe("v1")
  expect(openCodeCliProtocol("unknown")).toBeNull()
  expect(
    openCodeTuiCommand(
      "opencode",
      "http://127.0.0.1:4096",
      "/workspace/project",
      "ses_current",
      "v2",
    ),
  ).toEqual([
    "opencode",
    "--server",
    "http://127.0.0.1:4096",
    "--session",
    "ses_current",
    "/workspace/project",
  ])
  expect(
    openCodeTuiCommand("opencode", "http://127.0.0.1:4096", undefined, undefined, "v2"),
  ).toEqual(["opencode", "--server", "http://127.0.0.1:4096"])
  expect(
    openCodeTuiCommand("opencode", "http://127.0.0.1:4096", "/workspace/project", undefined, "v1"),
  ).toEqual(["opencode", "attach", "http://127.0.0.1:4096", "--dir", "/workspace/project"])
})

test("owned OpenCode v2 TUIs hide session tabs without replacing valid inline settings", () => {
  expect(
    JSON.parse(
      openCodeTuiConfigContent(
        JSON.stringify({
          theme: "tuiminal",
          tabs: { mode: "auto", maxWidth: 24 },
          terminal: { title: false, copy: "manual" },
        }),
      ),
    ),
  ).toEqual({
    theme: "tuiminal",
    tabs: { mode: "off", maxWidth: 24 },
    terminal: { title: true, copy: "manual" },
  })
  expect(JSON.parse(openCodeTuiConfigContent("invalid"))).toEqual({
    tabs: { mode: "off" },
    terminal: { title: true },
  })
})

test("owned OpenCode servers replace inherited authentication with ephemeral credentials", () => {
  expect(
    openCodeServerEnvironment(
      {
        PATH: "/usr/bin:/bin",
        OPENCODE_PASSWORD: "configured-currently",
        OPENCODE_SERVER_USERNAME: "configured-user",
        OPENCODE_SERVER_PASSWORD: "configured-elsewhere",
        OPTIONAL: undefined,
      },
      { username: "opencode", password: "temporary" },
    ),
  ).toEqual({
    PATH: "/usr/bin:/bin",
    OPENCODE_PASSWORD: "temporary",
    OPENCODE_SERVER_USERNAME: "opencode",
    OPENCODE_SERVER_PASSWORD: "temporary",
  })
})

test("remote OpenCode v2 requires the same detected client and server version", () => {
  expect(
    compatibleRemoteOpenCode(
      { protocol: "v2", version: "2.0.20" },
      { protocol: "v2", version: "2.0.20" },
    ),
  ).toBe(true)
  expect(
    compatibleRemoteOpenCode(
      { protocol: "v2", version: "2.0.21" },
      { protocol: "v2", version: "2.0.20" },
    ),
  ).toBe(false)
  expect(
    compatibleRemoteOpenCode(
      { protocol: "v2", version: null },
      { protocol: "v2", version: "2.0.20" },
    ),
  ).toBe(false)
  expect(
    compatibleRemoteOpenCode(
      { protocol: "v1", version: "1.18.29" },
      { protocol: "v2", version: "2.0.20" },
    ),
  ).toBe(false)
})

test("remote OpenCode server remains loopback-only behind an owned SSH tunnel", () => {
  const command = remoteOpenCodeServerCommand(
    { id: "work", name: "Work", host: "work-alias" },
    "/srv/project with spaces",
    45123,
    45124,
  )
  expect(command).toContain("ExitOnForwardFailure=yes")
  expect(command).toContain("127.0.0.1:45123:127.0.0.1:45124")
  expect(command).toContain("work-alias")
  expect(command.at(-1)).toContain("cd '/srv/project with spaces'")
  expect(command.at(-1)).toContain("IFS= read -r OPENCODE_PASSWORD")
  expect(command.at(-1)).toContain("OPENCODE_SERVER_PASSWORD=$OPENCODE_PASSWORD")
  expect(command.at(-1)).toContain("serve --hostname 127.0.0.1 --port 45124")
  expect(command.at(-1)).toContain('while kill -0 "$ssh_parent_pid"')
  expect(command.at(-1)).toContain('kill "$opencode_pid"')
})

test("remote OpenCode compatibility preflight requires the exact v2 version", async () => {
  const profile = { id: "work", name: "Work", host: "work-alias" }
  await expect(
    preflightRemoteOpenCode(profile, new AbortController().signal, {
      localVersionCommand: versionCommand("opencode v2.0.20"),
      remoteVersionCommand: versionCommand("opencode v2.0.20"),
      timeoutMs: 1_000,
    }),
  ).resolves.toMatchObject({
    providerId: "opencode",
    compatible: true,
    localVersion: "2.0.20",
    remoteVersion: "2.0.20",
  })

  await expect(
    preflightRemoteOpenCode(profile, new AbortController().signal, {
      localVersionCommand: versionCommand("opencode v2.0.19"),
      remoteVersionCommand: versionCommand("opencode v2.0.20"),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({
    report: {
      providerId: "opencode",
      compatible: false,
      reason: "versionMismatch",
      localVersion: "2.0.19",
      remoteVersion: "2.0.20",
    },
  })
})

test("remote OpenCode version preflight uses the configured SSH alias", () => {
  const command = remoteOpenCodeVersionCommand({ id: "work", name: "Work", host: "work-alias" })
  expect(command).toContain("work-alias")
  expect(command.at(-1)).toContain('exec "$opencode_command" --version')
})

test("remote OpenCode treats the selected directory as shell data", () => {
  const command = remoteOpenCodeServerCommand(
    { id: "work", name: "Work", host: "work-alias" },
    "/srv/project'; touch /tmp/not-run; echo '",
    45123,
  )
  expect(command.at(-1)).toContain(
    `cd '/srv/project'"'"'; touch /tmp/not-run; echo '"'"'' || exit 72`,
  )
})
