import { expect, test } from "bun:test"
import type { AgentActivity, AgentState } from "../packages/feature-terminal/src/model/agent-state"
import {
  type CodexAppServerEvents,
  createCodexRelay,
  inspectClientFrame,
  inspectUpstreamFrame,
} from "../packages/feature-terminal/src/services/codex-relay-observer"
import { codexResumeThreads } from "../packages/feature-terminal/src/services/codex-resume-protocol"

function fixture(remote: boolean) {
  const relay = createCodexRelay(remote ? { id: "fixture", name: "Fixture" } : undefined)
  let state: AgentState = "idle"
  let activity: AgentActivity | null = null
  const events: CodexAppServerEvents = {
    onState(value) {
      state = value
      activity = value === "working" ? "thinking" : null
    },
    onActivity(value) {
      state = "working"
      activity = value
    },
    onHydrated(thread) {
      state = thread.state
    },
    onTitle() {},
    onUserMessage() {},
    onUserMessageHistory() {},
    onError() {},
  }
  const server = (message: unknown) =>
    inspectUpstreamFrame(JSON.stringify(message), relay, events, 1)
  const client = (message: unknown) => inspectClientFrame(JSON.stringify(message), relay, events, 1)
  const event = (method: string, params: Record<string, unknown> = {}, id?: string | number) =>
    server({
      method,
      params: { threadId: "selected", ...params },
      ...(id === undefined ? {} : { id }),
    })
  const select = (status: unknown = { type: "idle" }, turns: unknown[] = []) => {
    client({ id: 1, method: "thread/resume", params: { threadId: "selected" } })
    server({ id: 1, result: { thread: { id: "selected", status, turns } } })
  }
  select()
  return { server, client, event, select, status: () => ({ state, activity }) }
}

for (const remote of [false, true]) {
  const origin = remote ? "remote" : "local"

  test(`${origin} Codex waits for user input until every pending request resolves`, () => {
    const f = fixture(remote)
    f.event("turn/started", { turn: { id: "turn-1", status: "inProgress" } })
    f.event("item/tool/requestUserInput", { turnId: "turn-1", isBlocking: true }, 7)
    expect(f.status().state).toBe("blocked")
    f.event("item/agentMessage/delta", { turnId: "turn-1", delta: "Choose an option" })
    f.event("thread/status/changed", { status: { type: "active", activeFlags: [] } })
    expect(f.status().state).toBe("blocked")
    f.event("mcpServer/elicitation/request", { turnId: "turn-1" }, "7")
    f.client({ id: 7, result: { answers: {} } })
    expect(f.status().state).toBe("blocked")
    f.event("serverRequest/resolved", { requestId: "7" })
    expect(f.status().state).toBe("working")
    f.event("item/started", { turnId: "turn-1", item: { type: "commandExecution" } })
    expect(f.status()).toEqual({ state: "working", activity: "running" })
    f.event("thread/status/changed", { status: { type: "active", activeFlags: [] } })
    expect(f.status().activity).toBe("running")
  })

  test(`${origin} Codex keeps completed turns settled despite late activity and unrelated threads`, () => {
    const f = fixture(remote)
    f.event("turn/started", { turn: { id: "turn-1", status: "inProgress" } })
    f.event("turn/completed", { turn: { id: "turn-1", status: "completed" } })
    f.event("thread/status/changed", { status: { type: "idle" } })
    f.event("thread/status/changed", { status: { type: "notLoaded" } })
    f.event("thread/status/changed", { status: { type: "active", activeFlags: [] } })
    f.event("turn/plan/updated", { turnId: "turn-1", plan: [] })
    f.event("item/agentMessage/delta", { turnId: "turn-1", delta: "Final response" })
    f.event("item/started", {
      threadId: "child",
      turnId: "child-turn",
      item: { type: "reasoning" },
    })
    f.event("turn/started", { threadId: "child", turn: { id: "child-turn", status: "inProgress" } })
    expect(f.status().state).toBe("done")
    f.event("turn/started", { turn: { id: "turn-2", status: "inProgress" } })
    f.event("item/started", { turnId: "turn-2", item: { type: "fileChange" } })
    f.event("turn/completed", { turn: { id: "turn-1", status: "completed" } })
    expect(f.status()).toEqual({ state: "working", activity: "coding" })
  })

  test(`${origin} Codex observes explicit idle without claiming successful completion`, () => {
    const f = fixture(remote)
    f.event("turn/started", { turn: { id: "turn-1", status: "inProgress" } })
    f.event("thread/status/changed", { status: { type: "idle" } })
    expect(f.status().state).toBe("idle")
    f.event("turn/completed", { turn: { id: "turn-1", status: "failed" } })
    f.event("thread/status/changed", { status: { type: "idle" } })
    f.event("item/started", { turnId: "turn-1", item: { type: "reasoning" } })
    expect(f.status().state).toBe("unknown")
  })

  test(`${origin} Codex recognizes waiting flags during resume and live updates`, () => {
    const f = fixture(remote)
    const status = { type: "active", activeFlags: ["waitingOnUserInput"] }
    f.select(status, [{ id: "turn-1", status: "inProgress" }])
    expect(f.status().state).toBe("blocked")
    f.event("item/started", { turnId: "turn-1", item: { type: "reasoning" } })
    expect(f.status().state).toBe("blocked")
    f.event("thread/status/changed", { status: { type: "active", activeFlags: [] } })
    expect(f.status().state).toBe("working")
    f.event("thread/status/changed", { status })
    expect(f.status().state).toBe("blocked")
    expect(codexResumeThreads({ result: { data: [{ id: "selected", status }] } })[0]?.state).toBe(
      "blocked",
    )
  })

  test(`${origin} Codex keeps optional questions nonblocking and clears blockers on completion`, () => {
    const f = fixture(remote)
    f.event("turn/started", { turn: { id: "turn-1", status: "inProgress" } })
    f.event("item/tool/requestUserInput", { turnId: "turn-1", isBlocking: false }, 1)
    expect(f.status().state).toBe("working")
    f.event("item/commandExecution/requestApproval", { turnId: "turn-1" }, 2)
    expect(f.status().state).toBe("blocked")
    f.event("turn/completed", { turn: { id: "turn-1", status: "completed" } })
    f.client({ id: 2, result: { decision: "accept" } })
    f.event("serverRequest/resolved", { requestId: 2 })
    expect(f.status().state).toBe("done")
  })
}
