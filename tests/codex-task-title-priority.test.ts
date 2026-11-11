import { expect, test } from "bun:test"
import {
  type CodexAppServerEvents,
  createCodexRelay,
  inspectClientFrame,
  inspectUpstreamFrame,
} from "../packages/feature-terminal/src/services/codex-relay-observer"

function fixture(remote: boolean) {
  const relay = createCodexRelay(remote ? { id: "remote", name: "Remote" } : undefined)
  const titles: string[] = []
  const requests: Record<string, unknown>[] = []
  relay.sendUpstream = (value) => requests.push(JSON.parse(value))
  const events: CodexAppServerEvents = {
    onTitle: (title) => titles.push(title),
    onState() {},
    onActivity() {},
    onUserMessage() {},
    onUserMessageHistory() {},
    onError() {},
  }
  const client = (value: unknown) => inspectClientFrame(JSON.stringify(value), relay, events, 1)
  const server = (value: unknown) => inspectUpstreamFrame(JSON.stringify(value), relay, events, 1)
  const prompt = (text: string, threadId = "one") =>
    client({
      method: "turn/start",
      params: { threadId, input: [{ type: "text", text }] },
    })
  const resume = (name?: string) => {
    client({ id: 1, method: "thread/resume", params: { threadId: "one" } })
    server({ id: 1, result: { thread: { id: "one", name, turns: [] } } })
  }
  return { client, server, prompt, resume, titles, requests, relay }
}

for (const remote of [false, true]) {
  test(`Codex retains the generated title when the same thread resumes without a name (remote=${remote})`, () => {
    const f = fixture(remote)
    f.resume("Generated task")
    f.prompt("First prompt")
    f.resume()
    f.prompt("Latest prompt")
    expect(f.titles.at(-1)).toBe("Generated task")
    expect(f.titles).not.toContain("Latest prompt")
  })

  test(`Codex accepts a newer generated name from public metadata (remote=${remote})`, () => {
    const f = fixture(remote)
    f.resume("Initial prompt")
    f.client({ id: 2, method: "thread/read", params: { threadId: "one" } })
    f.server({ id: 2, result: { thread: { id: "one", name: "Generated task" } } })
    f.prompt("Latest prompt")
    expect(f.titles.at(-1)).toBe("Generated task")
  })

  test(`Codex takes the selected thread name from the TUI list and isolates agents (remote=${remote})`, () => {
    const first = fixture(remote)
    const second = fixture(remote)
    first.prompt("First prompt")
    second.prompt("Other agent prompt")
    first.client({ id: 2, method: "thread/list", params: {} })
    first.server({
      id: 2,
      result: {
        data: [
          { id: "unrelated", name: "Wrong task" },
          { id: "one", name: "Generated task" },
        ],
      },
    })
    first.prompt("Latest prompt")
    expect(first.titles.at(-1)).toBe("Generated task")
    expect(second.titles.at(-1)).toBe("Other agent prompt")
  })

  test(`Codex refreshes the active name directly on prompts and completion (remote=${remote})`, async () => {
    const f = fixture(remote)
    f.prompt("First prompt")
    await Promise.resolve()
    const firstRead = f.requests.find((request) => request.method === "thread/read")
    expect(firstRead).toMatchObject({ params: { threadId: "one", includeTurns: false } })
    expect(f.server({ id: firstRead?.id, result: { thread: { id: "one", name: null } } })).toBe(
      true,
    )
    f.server({
      method: "turn/completed",
      params: { threadId: "one", turn: { id: "turn", status: "completed" } },
    })
    const secondRead = f.requests.filter((request) => request.method === "thread/read").at(-1)
    expect(secondRead?.id).not.toBe(firstRead?.id)
    expect(
      f.server({ id: secondRead?.id, result: { thread: { id: "one", name: "Generated task" } } }),
    ).toBe(true)
    f.prompt("Latest prompt")
    expect(f.titles.at(-1)).toBe("Generated task")
  })

  test(`Codex ignores old metadata after another snapshot, rename or thread switch (remote=${remote})`, () => {
    const f = fixture(remote)
    f.resume()
    f.client({ id: 2, method: "thread/read", params: { threadId: "one" } })
    f.client({ id: 3, method: "thread/list", params: {} })
    f.server({ id: 3, result: { data: [{ id: "one", name: "Generated task" }] } })
    f.server({ id: 2, result: { thread: { id: "one", name: "Old prompt" } } })
    expect(f.titles.at(-1)).toBe("Generated task")
    f.client({ id: 4, method: "thread/read", params: { threadId: "one" } })
    f.server({
      method: "thread/name/updated",
      params: { threadId: "one", threadName: "Renamed task" },
    })
    f.server({ id: 4, result: { thread: { id: "one", name: "Old prompt" } } })
    expect(f.titles.at(-1)).toBe("Renamed task")
    f.resume()
    f.prompt("Latest prompt")
    expect(f.titles.at(-1)).toBe("Renamed task")
    f.client({ id: 5, method: "thread/list", params: {} })
    f.prompt("Other conversation", "two")
    f.server({ id: 5, result: { data: [{ id: "one", name: "Wrong task" }] } })
    expect(f.titles.at(-1)).toBe("Other conversation")
  })

  test(`Codex coalesces name reads, retries errors and skips retired relays (remote=${remote})`, async () => {
    const f = fixture(remote)
    f.resume("Generated task")
    f.prompt("Next prompt")
    f.prompt("One more prompt")
    await Promise.resolve()
    const reads = () => f.requests.filter((request) => request.method === "thread/read")
    expect(reads()).toHaveLength(1)
    expect(f.server({ id: reads()[0]?.id, error: { code: -1, message: "Unavailable" } })).toBe(true)
    expect(f.titles.at(-1)).toBe("Generated task")
    f.prompt("Retry")
    await Promise.resolve()
    expect(reads()).toHaveLength(2)
    f.server({ id: reads()[1]?.id, result: { thread: { id: "one", name: null } } })
    expect(f.titles.at(-1)).toBe("Generated task")
    f.prompt("Final prompt")
    f.relay.closing = true
    await Promise.resolve()
    expect(reads()).toHaveLength(2)
  })
}
