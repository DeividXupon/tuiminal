import "./setup"
import { describe, expect, test } from "bun:test"
import {
  openCodeEventActivity,
  openCodeEventSessionId,
  openCodeEventState,
  openCodeLastResponse,
  openCodeMessageHistory,
  openCodeResumeThreads,
  parseOpenCodeFileDiffs,
  parseOpenCodeSession,
} from "../packages/feature-terminal/src/services/opencode-api"
import {
  detectOpenCodeServerProtocol,
  openCodeCliProtocol,
  openCodeTuiCommand,
  readOpenCodeJsonResponse,
} from "../packages/feature-terminal/src/services/opencode-protocol"
import { openCodeServerEnvironment } from "../packages/feature-terminal/src/services/opencode-server"
import { remoteOpenCodeServerCommand } from "../packages/feature-terminal/src/services/remote-opencode-connection"

const session = {
  id: "ses_one",
  title: "Implement OpenCode",
  directory: "/workspace/project",
  time: { created: 1_700_000_000_000, updated: 1_700_000_010_000 },
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

test("OpenCode protocol detection ignores the web fallback and recognizes v2 health", async () => {
  const paths: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    paths.push(url.pathname)
    if (url.pathname === "/api/health")
      return new Response(JSON.stringify({ ok: true, pid: 1234, version: "2.0.20" }), {
        headers: { "content-type": "application/json" },
      })
    return new Response("<!doctype html>", { headers: { "content-type": "text/html" } })
  }) as typeof fetch

  await expect(
    detectOpenCodeServerProtocol("http://127.0.0.1:4096", new AbortController().signal, fetcher),
  ).resolves.toBe("v2")
  expect(paths.sort()).toEqual(["/api/health", "/global/health"])
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
    openCodeTuiCommand("opencode", "http://127.0.0.1:4096", "/workspace/project", undefined, "v1"),
  ).toEqual(["opencode", "attach", "http://127.0.0.1:4096", "--dir", "/workspace/project"])
})

test("owned OpenCode servers remove inherited authentication", () => {
  expect(
    openCodeServerEnvironment({
      PATH: "/usr/bin:/bin",
      OPENCODE_SERVER_PASSWORD: "configured-elsewhere",
      OPTIONAL: undefined,
    }),
  ).toEqual({ PATH: "/usr/bin:/bin" })
})

test("remote OpenCode server remains loopback-only behind an owned SSH tunnel", () => {
  const command = remoteOpenCodeServerCommand(
    { id: "work", name: "Work", host: "work-alias" },
    "/srv/project with spaces",
    45123,
  )
  expect(command).toContain("ExitOnForwardFailure=yes")
  expect(command).toContain("127.0.0.1:45123:127.0.0.1:45123")
  expect(command).toContain("work-alias")
  expect(command.at(-1)).toContain("cd '/srv/project with spaces'")
  expect(command.at(-1)).toContain("unset OPENCODE_SERVER_PASSWORD")
  expect(command.at(-1)).toContain("serve --hostname 127.0.0.1 --port 45123")
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
