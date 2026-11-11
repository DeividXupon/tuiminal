import { expect, test } from "bun:test"
import { startCodexAppServerRelay } from "../packages/feature-terminal/src/services/codex-app-server"

test("the local Codex relay uses the first prompt until the public thread is named", async () => {
  const titles: string[] = []
  const states: string[] = []
  const errors: string[] = []
  const received = Promise.withResolvers<void>()
  const renamed = Promise.withResolvers<void>()
  let upstream: { send(value: string): unknown } | undefined
  const appServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (!server.upgrade(request)) return new Response(null, { status: 426 })
      return undefined
    },
    websocket: {
      open(socket) {
        upstream = socket
      },
      message(socket, data) {
        const message = JSON.parse(String(data))
        socket.send(
          JSON.stringify({
            id: message.id,
            result: { turn: { id: "turn", status: "inProgress" } },
          }),
        )
      },
    },
  })
  const relay = startCodexAppServerRelay(`ws://127.0.0.1:${appServer.port}`, {
    onTitle: (title) => {
      titles.push(title)
      if (title === "Named task") renamed.resolve()
    },
    onState: (state) => states.push(state),
    onActivity() {},
    onUserMessage() {},
    onUserMessageHistory() {},
    onError: (error) => errors.push(error),
  })
  const client = new WebSocket(relay.url)
  client.addEventListener("message", () => received.resolve())
  try {
    await new Promise<void>((resolve) =>
      client.addEventListener("open", () => resolve(), { once: true }),
    )
    client.send(
      JSON.stringify({
        id: 1,
        method: "turn/start",
        params: {
          threadId: "thread",
          input: [{ type: "text", text: "First prompt" }],
        },
      }),
    )
    await received.promise
    expect(titles.at(-1)).toBe("First prompt")
    upstream?.send(
      JSON.stringify({
        method: "thread/name/updated",
        params: { threadId: "thread", threadName: "Named task" },
      }),
    )
    await renamed.promise
    expect(titles).toEqual(["First prompt", "Named task"])
    expect(states).toEqual(["working"])
    expect(errors).toEqual([])
  } finally {
    relay.stop()
    client.close()
    appServer.stop(true)
  }
})
