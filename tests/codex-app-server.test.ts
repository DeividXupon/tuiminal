import { expect, test } from "bun:test"
import {
  codexAppServerUserMessage,
  codexAppServerUserMessageHistory,
  codexResumeLastResponse,
  codexResumeThreads,
  startCodexAppServerRelay,
} from "../packages/feature-terminal/src/services/codex-app-server"

type MockSocket = { send: (data: string) => unknown }

function replyToResumeListRequest(
  socket: MockSocket,
  message: Record<string, unknown>,
  requests?: Record<string, unknown>[],
) {
  if (
    typeof message.id !== "string" ||
    !message.id.startsWith("tuiminal-resume-list:") ||
    message.method !== "thread/list"
  )
    return false
  requests?.push(message)
  socket.send(JSON.stringify({ id: message.id, result: { data: [], nextCursor: null } }))
  return true
}

function replyToInternalHistoryRequest(
  socket: MockSocket,
  message: Record<string, unknown>,
  requests: Record<string, unknown>[],
) {
  if (
    typeof message.id !== "string" ||
    !message.id.startsWith("tuiminal-history:") ||
    message.method !== "thread/turns/list"
  )
    return false
  requests.push(message)
  const params = message.params as Record<string, unknown>
  const oldestPage = params.cursor === "older-1"
  socket.send(
    JSON.stringify({
      id: message.id,
      result: {
        data: [
          {
            id: oldestPage ? "turn-fetched-oldest" : "turn-fetched-page",
            startedAt: oldestPage ? 1_400_000_000 : 1_500_000_000,
            items: [
              {
                type: "userMessage",
                id: oldestPage ? "message-fetched-oldest" : "message-fetched-page",
                clientId: null,
                content: [
                  {
                    type: "text",
                    text: oldestPage ? "Fetched oldest task" : "Fetched page task",
                  },
                ],
              },
            ],
          },
        ],
        nextCursor: oldestPage ? null : "older-1",
      },
    }),
  )
  return true
}

function sendInitializedEvents(socket: MockSocket) {
  socket.send(
    JSON.stringify({
      method: "thread/name/updated",
      params: { threadId: "thread-1", threadName: "Fix login" },
    }),
  )
  socket.send(JSON.stringify({ method: "turn/started", params: { threadId: "thread-1" } }))
  socket.send(
    JSON.stringify({
      method: "item/started",
      params: { threadId: "thread-1", item: { type: "commandExecution" } },
    }),
  )
  socket.send(
    JSON.stringify({
      id: 42,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread-1" },
    }),
  )
}

test("extracts only public user text from supported Codex requests", () => {
  expect(
    codexAppServerUserMessage({
      method: "turn/start",
      params: {
        input: [
          { type: "text", text: "Fix login" },
          { type: "localImage", path: "/tmp/reference.png" },
          { type: "text", text: "Keep the current layout" },
        ],
      },
    }),
  ).toBe("Fix login\nKeep the current layout")
  expect(codexAppServerUserMessage({ method: "turn/interrupt", params: {} })).toBeNull()
})

test("parses the local Codex /resume thread summaries", () => {
  expect(
    codexResumeThreads({
      result: {
        data: [
          {
            id: "thread-older",
            name: null,
            preview: "Older task",
            cwd: "/workspace/older",
            updatedAt: 10,
            recencyAt: 11,
            status: { type: "notLoaded" },
          },
          {
            id: "thread-newer",
            name: "Review auth",
            preview: "Fix login\nwithout changing layout",
            cwd: "/workspace/app",
            updatedAt: 20,
            recencyAt: 22,
            status: { type: "active", activeFlags: ["waitingOnApproval"] },
          },
        ],
      },
    }),
  ).toEqual([
    {
      id: "thread-newer",
      title: "Review auth",
      preview: "Fix login without changing layout",
      lastResponse: "",
      cwd: "/workspace/app",
      updatedAt: 22,
      state: "blocked",
    },
    {
      id: "thread-older",
      title: "Older task",
      preview: "Older task",
      lastResponse: "",
      cwd: "/workspace/older",
      updatedAt: 11,
      state: "idle",
    },
  ])
})

test("extracts the latest public agent response for the /resume picker", () => {
  expect(
    codexResumeLastResponse({
      result: {
        data: [
          {
            id: "turn-newest",
            items: [
              { type: "agentMessage", phase: "commentary", text: "Working on it" },
              { type: "agentMessage", phase: "final_answer", text: "Login fixed\nwith tests" },
              { type: "reasoning", content: ["Private reasoning"] },
            ],
          },
          {
            id: "turn-older",
            items: [{ type: "agentMessage", text: "Older response" }],
          },
        ],
      },
    }),
  ).toBe("Login fixed with tests")
})

test("extracts previous user messages from public thread history", () => {
  const [message] = codexAppServerUserMessageHistory({
    thread: {
      turns: [
        {
          id: "turn-1",
          startedAt: 1_700_000_000,
          status: "completed",
          items: [
            {
              type: "userMessage",
              id: "message-1",
              clientId: "client-1",
              content: [
                { type: "text", text: "Previous question" },
                { type: "localImage", path: "/tmp/reference.png" },
                { type: "localAudio", path: "/tmp/note.wav" },
                { type: "skill", name: "review", path: "/tmp/review/SKILL.md" },
              ],
            },
            {
              type: "agentMessage",
              id: "message-2",
              phase: "final_answer",
              text: "Public answer",
            },
            {
              type: "reasoning",
              id: "message-3",
              summary: ["Public reasoning summary"],
              content: ["Private reasoning"],
            },
            { type: "plan", id: "message-4", text: "Update the panel" },
            {
              type: "fileChange",
              id: "message-5",
              status: "completed",
              changes: [
                {
                  path: "src/panel.tsx",
                  kind: "update",
                  diff: "--- a/src/panel.tsx\n+++ b/src/panel.tsx\n-old\n+new",
                },
              ],
            },
          ],
        },
      ],
    },
  })
  expect(message).toMatchObject({
    id: "client:client-1",
    turnId: "turn-1",
    text: "Previous question",
    sentAt: 1_700_000_000_000,
    durationMs: null,
    status: "completed",
    hasImage: true,
    hasAudio: true,
    hasSkill: true,
    model: null,
    effort: null,
    serviceTier: null,
    finalResponse: "Public answer",
    commentary: [],
    reasoningSummaries: ["Public reasoning summary"],
    plans: ["Update the panel"],
    turnDiff: "--- a/src/panel.tsx\n+++ b/src/panel.tsx\n-old\n+new",
  })
  expect(message?.changes).toEqual([
    {
      id: "message-5:0",
      path: "src/panel.tsx",
      kind: "update",
      diff: "--- a/src/panel.tsx\n+++ b/src/panel.tsx\n-old\n+new",
    },
  ])
  expect(JSON.stringify(message)).not.toContain("Private reasoning")
})

test("Codex TUI frames and approvals pass through while public activity is observed", async () => {
  const requests: Record<string, unknown>[] = []
  const internalHistoryRequests: Record<string, unknown>[] = []
  const internalResumeRequests: Record<string, unknown>[] = []
  const responses: Record<string, unknown>[] = []
  const states: string[] = []
  const activities: string[] = []
  const titles: string[] = []
  const userMessages: string[] = []
  const userMessageIds: string[] = []
  const userMessageConfigurations: Array<Record<string, unknown>> = []
  const historicalMessages: string[][] = []
  const historicalMessageIds: string[][] = []
  const historicalMessageDetails: Array<Record<string, unknown>> = []
  const historicalReplacements: boolean[] = []
  const errors: string[] = []
  let upstreamClosed = false
  const appServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return
      return new Response("upgrade required", { status: 426 })
    },
    websocket: {
      message(socket, data) {
        const message = JSON.parse(String(data)) as Record<string, unknown>
        if (replyToResumeListRequest(socket, message, internalResumeRequests)) return
        if (replyToInternalHistoryRequest(socket, message, internalHistoryRequests)) return
        requests.push(message)
        if (message.method === "initialize") {
          socket.send(JSON.stringify({ id: message.id, result: { userAgent: "codex" } }))
        } else if (message.method === "initialized") {
          sendInitializedEvents(socket)
        } else if (message.method === "thread/resume") {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                thread: {
                  id: "thread-1",
                  turns: [
                    {
                      id: "turn-old",
                      startedAt: 1_700_000_000,
                      items: [
                        {
                          type: "userMessage",
                          id: "message-old",
                          clientId: null,
                          content: [{ type: "text", text: "Earlier task" }],
                        },
                      ],
                    },
                  ],
                },
                model: "gpt-6-sol",
                reasoningEffort: "medium",
                serviceTier: "fast",
                initialTurnsPage: null,
              },
            }),
          )
        } else if (message.method === "thread/turns/list") {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                data: [
                  {
                    id: "turn-oldest",
                    startedAt: 1_600_000_000,
                    items: [
                      {
                        type: "userMessage",
                        id: "message-oldest",
                        clientId: null,
                        content: [{ type: "text", text: "Oldest task" }],
                      },
                    ],
                  },
                ],
              },
            }),
          )
        } else if (message.method === "turn/start") {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                turn: {
                  id: "turn-current",
                  startedAt: 1_800_000_000,
                  status: "inProgress",
                  items: [],
                },
              },
            }),
          )
          socket.send(
            JSON.stringify({
              method: "item/completed",
              params: {
                threadId: "thread-1",
                turnId: "turn-current",
                completedAtMs: 1_800_001_000_000,
                item: {
                  id: "answer-current",
                  type: "agentMessage",
                  phase: "final_answer",
                  text: "Login fixed",
                },
              },
            }),
          )
          socket.send(
            JSON.stringify({
              method: "item/completed",
              params: {
                threadId: "thread-1",
                turnId: "turn-current",
                completedAtMs: 1_800_001_000_000,
                item: {
                  id: "reasoning-current",
                  type: "reasoning",
                  summary: ["Checked the public login flow"],
                  content: ["Private live reasoning"],
                },
              },
            }),
          )
          socket.send(
            JSON.stringify({
              method: "turn/diff/updated",
              params: {
                threadId: "thread-1",
                turnId: "turn-current",
                diff: "--- a/src/login.ts\n+++ b/src/login.ts\n-old\n+new",
              },
            }),
          )
        } else if (message.id === 42) {
          socket.send(
            JSON.stringify({
              method: "turn/completed",
              params: {
                threadId: "thread-1",
                turn: {
                  id: "turn-current",
                  startedAt: 1_800_000_000,
                  completedAt: 1_800_001_080,
                  status: "completed",
                  items: [],
                },
              },
            }),
          )
        }
      },
      close() {
        upstreamClosed = true
      },
    },
  })
  const relay = startCodexAppServerRelay(
    `ws://127.0.0.1:${appServer.port}`,
    {
      onActivity: (activity) => activities.push(activity),
      onState: (state) => states.push(state),
      onTitle: (title) => titles.push(title),
      onUserMessage: (message) => {
        userMessages.push(message.text)
        userMessageIds.push(message.id)
        userMessageConfigurations.push({
          status: message.status,
          hasImage: message.hasImage,
          hasAudio: message.hasAudio,
          hasSkill: message.hasSkill,
          model: message.model,
          effort: message.effort,
          serviceTier: message.serviceTier,
        })
      },
      onUserMessageHistory: (messages, replace) => {
        historicalMessages.push(messages.map((message) => message.text))
        historicalMessageIds.push(messages.map((message) => message.id))
        historicalMessageDetails.push(...messages)
        historicalReplacements.push(replace)
      },
      onError: (message) => errors.push(message),
    },
    "/workspace/project",
  )
  const client = new WebSocket(relay.url)
  client.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as Record<string, unknown>
    responses.push(message)
    if (message.id === 42) client.send(JSON.stringify({ id: 42, result: { decision: "accept" } }))
  })
  try {
    await new Promise<void>((resolve) =>
      client.addEventListener("open", () => resolve(), { once: true }),
    )
    client.send(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "codex" } },
      }),
    )
    client.send(JSON.stringify({ method: "initialized", params: {} }))
    client.send(
      JSON.stringify({
        id: 2,
        method: "thread/resume",
        params: { threadId: "thread-1" },
      }),
    )
    client.send(
      JSON.stringify({
        id: 3,
        method: "thread/turns/list",
        params: { threadId: "thread-1", itemsView: "full" },
      }),
    )
    client.send(
      JSON.stringify({
        id: 4,
        method: "turn/start",
        params: {
          threadId: "thread-1",
          input: [
            { type: "text", text: "Fix login" },
            { type: "localImage", path: "/tmp/reference.png" },
            { type: "localAudio", path: "/tmp/note.wav" },
            { type: "skill", name: "review", path: "/tmp/review/SKILL.md" },
          ],
          model: "gpt-6-sol",
          effort: "medium",
          serviceTierForTurn: "fast",
        },
      }),
    )
    for (
      let i = 0;
      i < 80 &&
      (states.at(-1) !== "done" ||
        internalResumeRequests.length === 0 ||
        internalHistoryRequests.length !== 2 ||
        !historicalMessageDetails.some(
          (message) =>
            message.id === "request:number:4" &&
            message.finalResponse === "Login fixed" &&
            message.status === "completed" &&
            message.durationMs === 1_080_000 &&
            typeof message.turnDiff === "string" &&
            message.turnDiff.includes("+new") &&
            Array.isArray(message.reasoningSummaries) &&
            message.reasoningSummaries.includes("Checked the public login flow"),
        ));
      i += 1
    )
      await Bun.sleep(5)
    expect(requests.map((message) => message.method)).toEqual([
      "initialize",
      "initialized",
      "thread/resume",
      "thread/turns/list",
      "turn/start",
      undefined,
    ])
    expect(requests[5]).toEqual({ id: 42, result: { decision: "accept" } })
    expect(responses.some((message) => message.id === 1)).toBe(true)
    expect(responses.some((message) => message.id === 42)).toBe(true)
    expect(
      responses.some(
        (message) => typeof message.id === "string" && message.id.startsWith("tuiminal-history:"),
      ),
    ).toBe(false)
    expect(
      responses.some(
        (message) =>
          typeof message.id === "string" && message.id.startsWith("tuiminal-resume-list:"),
      ),
    ).toBe(false)
    expect(internalResumeRequests[0]).toMatchObject({
      method: "thread/list",
      params: {
        cursor: null,
        limit: 6,
        sortKey: "recency_at",
        sortDirection: "desc",
        cwd: "/workspace/project",
      },
    })
    expect(
      internalHistoryRequests.map((message) => ({
        method: message.method,
        params: message.params,
      })),
    ).toEqual([
      {
        method: "thread/turns/list",
        params: {
          threadId: "thread-1",
          cursor: null,
          limit: 100,
          sortDirection: "desc",
          itemsView: "full",
        },
      },
      {
        method: "thread/turns/list",
        params: {
          threadId: "thread-1",
          cursor: "older-1",
          limit: 100,
          sortDirection: "desc",
          itemsView: "full",
        },
      },
    ])
    expect(titles).toEqual(["Fix login"])
    expect(userMessages).toEqual(["Fix login"])
    expect(userMessageIds).toEqual(["request:number:4"])
    expect(userMessageConfigurations).toEqual([
      {
        status: "inProgress",
        hasImage: true,
        hasAudio: true,
        hasSkill: true,
        model: "gpt-6-sol",
        effort: "medium",
        serviceTier: "fast",
      },
    ])
    expect(historicalMessages.flat()).toEqual(
      expect.arrayContaining([
        "Earlier task",
        "Oldest task",
        "Fetched page task",
        "Fetched oldest task",
        "Fix login",
      ]),
    )
    expect(historicalMessageIds.flat()).toContain("request:number:4")
    const currentMessage = historicalMessageDetails
      .filter((message) => message.id === "request:number:4")
      .at(-1)
    expect(currentMessage).toMatchObject({
      status: "completed",
      hasImage: true,
      hasAudio: true,
      hasSkill: true,
      model: "gpt-6-sol",
      effort: "medium",
      serviceTier: "fast",
      durationMs: 1_080_000,
      finalResponse: "Login fixed",
      reasoningSummaries: ["Checked the public login flow"],
      turnDiff: "--- a/src/login.ts\n+++ b/src/login.ts\n-old\n+new",
    })
    expect(JSON.stringify(currentMessage)).not.toContain("Private live reasoning")
    expect(
      historicalMessageDetails.find((message) => message.text === "Earlier task"),
    ).toMatchObject({
      model: "gpt-6-sol",
      effort: "medium",
      serviceTier: "fast",
    })
    expect(historicalReplacements.filter(Boolean)).toHaveLength(1)
    expect(activities).toContain("running")
    expect(states).toContain("blocked")
    expect(states.at(-1)).toBe("done")
    expect(errors).toEqual([])
  } finally {
    client.close()
    relay.stop()
    for (let i = 0; i < 20 && !upstreamClosed; i += 1) await Bun.sleep(5)
    appServer.stop(true)
  }
  expect(upstreamClosed).toBe(true)
})
