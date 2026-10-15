import { expect, test } from "bun:test"
import {
  type AgentMessageHistoryEntry,
  EMPTY_AGENT_MESSAGE_TURN_DETAIL,
} from "../packages/feature-terminal/src/model/agent-message-history"
import { agentProvider } from "../packages/feature-terminal/src/model/agent-provider"
import {
  type CodexAppServerEvents,
  createCodexRelay,
  inspectClientFrame,
  inspectUpstreamFrame,
} from "../packages/feature-terminal/src/services/codex-relay-observer"
import { OpenCodeObserver } from "../packages/feature-terminal/src/services/opencode-observer"
import { OpenCodeSessionProjection } from "../packages/feature-terminal/src/services/opencode-session-projection"

function codexFixture() {
  const relay = createCodexRelay()
  const titles: string[] = []
  const requests: Record<string, unknown>[] = []
  relay.sendUpstream = (frame) => requests.push(JSON.parse(frame))
  const events: CodexAppServerEvents = {
    onActivity() {},
    onState() {},
    onTitle: (title) => titles.push(title),
    onUserMessage() {},
    onUserMessageHistory() {},
    onError() {},
  }
  const client = (frame: unknown) => inspectClientFrame(JSON.stringify(frame), relay, events, 1)
  const server = (frame: unknown) => inspectUpstreamFrame(JSON.stringify(frame), relay, events, 1)
  return { client, server, titles, requests }
}

test.each(["turn/start", "turn/steer", "thread/queue/add"])(
  "Codex %s supplies a prompt title until the thread is named",
  (method) => {
    const { client, server, titles } = codexFixture()
    client({ id: 1, method: "thread/start", params: {} })
    server({ id: 1, result: { thread: { id: "thread-one", name: null } } })
    client({
      id: 2,
      method,
      params: {
        threadId: "thread-one",
        input: [{ type: "text", text: "  Fix\n\u001b[31mlogin\u001b[0m\u202e " }],
      },
    })
    expect(titles.at(-1)).toBe("Fix login")
    client({
      id: 3,
      method,
      params: { threadId: "thread-one", input: [{ type: "text", text: "Add tests" }] },
    })
    expect(titles.at(-1)).toBe("Fix login")
    server({
      method: "thread/name/updated",
      params: { threadId: "thread-one", threadName: "Authentication fix" },
    })
    client({
      id: 4,
      method,
      params: { threadId: "thread-one", input: [{ type: "text", text: "Run tests" }] },
    })
    expect(titles.at(-1)).toBe("Authentication fix")
    server({
      method: "thread/name/updated",
      params: { threadId: "other-thread", threadName: "Unrelated task" },
    })
    expect(titles.at(-1)).toBe("Authentication fix")

    client({ id: 5, method: "thread/start", params: {} })
    server({ id: 5, result: { thread: { id: "thread-two" } } })
    expect(titles.at(-1)).toBe("")
    server({ id: 2, error: { code: -1, message: "Previous turn failed" } })
    expect(titles.at(-1)).toBe("")
    client({
      id: 6,
      method,
      params: { threadId: "thread-two", input: [{ type: "text", text: "Second task" }] },
    })
    expect(titles.at(-1)).toBe("Second task")
  },
)

function turn(text: string, startedAt: number) {
  return {
    id: `turn-${startedAt}`,
    startedAt,
    items: [{ type: "userMessage", id: `message-${startedAt}`, content: [{ type: "text", text }] }],
  }
}

test("Codex resumes use the earliest available prompt and reject stale history pages", () => {
  const { client, server, titles, requests } = codexFixture()
  client({ id: 1, method: "thread/resume", params: { threadId: "thread-one" } })
  server({
    id: 1,
    result: { thread: { id: "thread-one", turns: [turn("Recent prompt", 200)] } },
  })
  expect(titles.at(-1)).toBe("Recent prompt")
  server({
    id: requests.at(-1)?.id,
    result: { data: [turn("First prompt", 100)], nextCursor: "older" },
  })
  expect(titles.at(-1)).toBe("First prompt")
  const stalePage = requests.at(-1)?.id

  client({ id: 2, method: "thread/resume", params: { threadId: "thread-two" } })
  server({
    id: 2,
    result: {
      thread: { id: "thread-two", name: "Saved title", turns: [turn("Another prompt", 300)] },
    },
  })
  server({ id: stalePage, result: { data: [turn("Wrong conversation", 50)] } })
  expect(titles.at(-1)).toBe("Saved title")
})

test("Codex ignores empty prompt titles and bounds whole graphemes", () => {
  const { client, titles } = codexFixture()
  for (const text of ["\n\u202e", "👩‍💻".repeat(170)]) {
    client({
      method: "turn/start",
      params: { threadId: "thread-one", input: [{ type: "text", text }] },
    })
  }
  expect(titles).toEqual(["👩‍💻".repeat(160)])
})

test("Codex messages cannot inherit another thread's title when selection was not observed", () => {
  const { client, server, titles } = codexFixture()
  server({
    method: "thread/name/updated",
    params: { threadId: "thread-one", threadName: "Previous task" },
  })
  client({
    method: "turn/start",
    params: { threadId: "thread-two", input: [{ type: "text", text: "Next task" }] },
  })
  expect(titles).toEqual(["Previous task", "Next task"])
})

function prompt(text: string, sentAt: number): AgentMessageHistoryEntry {
  return {
    id: `message-${sentAt}`,
    turnId: null,
    text,
    sentAt,
    durationMs: null,
    status: "inProgress",
    hasImage: false,
    hasAudio: false,
    hasSkill: false,
    model: null,
    effort: null,
    serviceTier: null,
    ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
  }
}

test("OpenCode sidebar titles prefer generated names and isolate prompt fallbacks by session", () => {
  const projection = new OpenCodeSessionProjection("terminal", agentProvider("opencode"))
  const session = (id: string, title: string, messages: AgentMessageHistoryEntry[]) => ({
    session: { id, title, directory: "/workspace", updatedAt: 1 },
    messages,
    state: "working" as const,
    activity: "thinking" as const,
    waitingOnApproval: false,
  })
  const messages = [prompt("More tests", 200), prompt("\n\u202e", 1), prompt("Fix\nlogin", 100)]
  projection.upsert(session("one", "OpenCode", messages))
  expect(projection.snapshot().active?.agent.taskTitle).toBe("Fix login")
  projection.upsert(session("one", "Generated title", messages))
  expect(projection.snapshot().active?.agent.taskTitle).toBe("Generated title")

  projection.activate("two")
  projection.upsert(session("two", "", []))
  expect(projection.snapshot().active?.agent.taskTitle).toBeUndefined()
  projection.upsert(session("two", "", [prompt("Another task", 300)]))
  expect(projection.snapshot().active?.agent.taskTitle).toBe("Another task")
  projection.activate("one")
  expect(projection.snapshot().active?.agent.taskTitle).toBe("Generated title")
})

test.each(["v1", "v2"] as const)(
  "OpenCode %s publishes a prompt title from public message hydration",
  async (protocol) => {
    const titles: string[] = []
    const hydrated = Promise.withResolvers<void>()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname.endsWith("/message"))
          return Response.json([
            {
              info: { id: "message-one", role: "user", time: { created: 100 } },
              parts: [{ type: "text", text: "Fix login" }],
            },
          ])
        return new Response(null, { status: 404 })
      },
    })
    const observer = new OpenCodeObserver(
      server.url.toString(),
      "/workspace",
      undefined,
      {
        onActivity() {},
        onState() {},
        onTitle: (title) => titles.push(title),
        onUserMessageHistory() {},
        onHydrated: () => hydrated.resolve(),
        onError: (error) => hydrated.reject(new Error(error)),
      },
      protocol,
    )
    try {
      observer.observeEvent({
        type: "session.created",
        properties: { info: { id: "session-one", title: "OpenCode", directory: "/workspace" } },
      })
      await hydrated.promise
      expect(titles.at(-1)).toBe("Fix login")
      observer.observeEvent({
        type: "session.updated",
        properties: {
          info: { id: "session-one", title: "Generated title", directory: "/workspace" },
        },
      })
      expect(titles.at(-1)).toBe("Generated title")
    } finally {
      observer.stop()
      server.stop(true)
    }
  },
)
