import { expect, test } from "bun:test"
import {
  type CodexAppServerEvents,
  createCodexRelay,
  inspectClientFrame,
  inspectUpstreamFrame,
} from "../packages/feature-terminal/src/services/codex-relay-observer"

function fixture(remote: boolean) {
  const relay = createCodexRelay(remote ? { id: "work", name: "Work" } : undefined)
  const titles: string[] = []
  const states: string[] = []
  const messages: string[] = []
  const hydrated: string[] = []
  const requests: unknown[] = []
  relay.sendUpstream = (frame) => requests.push(JSON.parse(frame))
  const events: CodexAppServerEvents = {
    onTitle: (value) => titles.push(value),
    onState: (value) => states.push(value),
    onActivity: (value) => states.push(value),
    onHydrated: (value) => hydrated.push(value.threadId),
    onUserMessage: (value) => messages.push(value.text),
    onUserMessageHistory: (values) => messages.push(...values.map((value) => value.text)),
    onError() {},
  }
  const client = (value: unknown) => inspectClientFrame(JSON.stringify(value), relay, events, 1)
  const server = (value: unknown) => inspectUpstreamFrame(JSON.stringify(value), relay, events, 1)
  const event = (method: string, threadId: string, params = {}) =>
    server({ method, params: { threadId, ...params } })
  const start = (
    id: string | number,
    threadId: string,
    params = {},
    name: string | null = null,
  ) => {
    client({ id, method: "thread/start", params })
    expect(server({ id, result: { thread: { id: threadId, name, turns: [] } } })).toBe(false)
  }
  return { client, server, event, start, titles, states, messages, hydrated, requests }
}

for (const remote of [false, true]) {
  test(`Codex title-generation threads cannot replace the visible task or its activity (remote=${remote})`, async () => {
    const f = fixture(remote)
    f.start(1, "main", {}, "Binary trees")
    f.event("turn/started", "main", { turn: { id: "main-1", status: "inProgress" } })
    f.start("title-start", "helper", { ephemeral: true, threadSource: "thread_title" })
    f.client({
      id: "helper-turn",
      method: "turn/start",
      params: {
        threadId: "helper",
        input: [{ type: "text", text: "Generate a concise, single-line task title" }],
      },
    })
    expect(
      f.server({ id: "helper-turn", result: { turn: { id: "helper-1", status: "inProgress" } } }),
    ).toBe(false)
    expect(
      f.event("turn/started", "helper", { turn: { id: "helper-1", status: "inProgress" } }),
    ).toBe(false)
    expect(
      f.event("item/agentMessage/delta", "helper", { turnId: "helper-1", delta: "title" }),
    ).toBe(false)
    expect(
      f.event("turn/completed", "helper", { turn: { id: "helper-1", status: "completed" } }),
    ).toBe(false)
    expect(f.titles.at(-1)).toBe("Binary trees")
    expect(f.states.at(-1)).toBe("working")
    expect(f.hydrated).toEqual(["main"])
    expect(f.messages).toEqual([])
    expect(f.requests).toEqual([])
    await Promise.resolve()
    expect(f.requests).toEqual([])
    f.event("thread/name/updated", "main", { threadName: "Explain binary trees" })
    f.event("item/started", "main", { turnId: "main-1", item: { type: "commandExecution" } })
    expect(f.titles.at(-1)).toBe("Explain binary trees")
    expect(f.states.at(-1)).toBe("running")
    f.event("turn/completed", "main", { turn: { id: "main-1", status: "completed" } })
    f.event("turn/started", "main", { turn: { id: "main-2", status: "inProgress" } })
    expect(f.states.at(-1)).toBe("working")
    expect(f.titles).not.toContain("Generate a concise, single-line task title")
  })

  test(`Codex keeps title helpers isolated before selection, after unsubscribe and across relays (remote=${remote})`, () => {
    const f = fixture(remote)
    f.start(1, "helper", { ephemeral: true, threadSource: "thread_title" })
    f.event("thread/name/updated", "helper", { threadName: "Hidden" })
    expect(f.titles).toEqual([])
    expect(f.hydrated).toEqual([])
    f.client({ id: 2, method: "thread/unsubscribe", params: { threadId: "helper" } })
    expect(f.server({ id: 2, result: { status: "unsubscribed" } })).toBe(false)
    f.event("turn/completed", "helper", { turn: { id: "late", status: "completed" } })
    expect(f.states).toEqual([])
    f.start("1", "visible", { ephemeral: true, threadSource: "user" }, "User task")
    expect(f.titles.at(-1)).toBe("User task")
    const other = fixture(remote)
    other.start(1, "helper", {}, "Independent task")
    expect(other.titles.at(-1)).toBe("Independent task")
  })
}
