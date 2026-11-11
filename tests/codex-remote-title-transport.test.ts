import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { startCodexProxyRelay } from "../packages/feature-terminal/src/services/codex-app-server"
import { CodexProxyFrameDecoder } from "../packages/feature-terminal/src/services/codex-proxy-websocket"

function remoteProxyFixture() {
  let output!: ReadableStreamDefaultController<Uint8Array>
  const requests: Record<string, unknown>[] = []
  const pending = new Map<string, (request: Record<string, unknown>) => void>()
  const decoder = new CodexProxyFrameDecoder()
  const process = {
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller
      },
    }),
    stderr: new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
    stdin: {
      write(value: string | Uint8Array) {
        if (typeof value === "string") {
          const key = value.match(/^Sec-WebSocket-Key:\s*(.+)$/imu)?.[1]?.trim()
          if (!key) throw new Error("Missing WebSocket handshake")
          const accept = createHash("sha1")
            .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
            .digest("base64")
          output.enqueue(
            new TextEncoder().encode(
              `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
            ),
          )
          return value.length
        }
        for (const frame of decoder.push(value)) {
          const request = JSON.parse(new TextDecoder().decode(frame.payload))
          requests.push(request)
          const method = String(request.method)
          pending.get(method)?.(request)
          pending.delete(method)
        }
        return value.byteLength
      },
      end() {},
    },
  }
  const send = (message: unknown) => {
    const text = JSON.stringify(message)
    const body = new TextEncoder().encode(text)
    const header =
      body.length < 126
        ? Uint8Array.of(0x81, body.length)
        : Uint8Array.of(0x81, 126, body.length >>> 8, body.length & 255)
    const bytes = new Uint8Array(header.length + body.length)
    bytes.set(header)
    bytes.set(body, header.length)
    // SSH may split either the frame header or UTF-8 title across reads.
    for (let offset = 0; offset < bytes.length; offset += 3)
      output.enqueue(bytes.slice(offset, offset + 3))
    return text
  }
  const nextRequest = (method: string) => {
    const received = requests.find((request) => request.method === method)
    return received
      ? Promise.resolve(received)
      : new Promise<Record<string, unknown>>((resolve) => pending.set(method, resolve))
  }
  return { process, send, nextRequest, requests }
}

test("remote names reach both the official TUI connection and the sidebar unchanged", async () => {
  const proxy = remoteProxyFixture()
  const titles: string[] = []
  const errors: string[] = []
  const relay = await startCodexProxyRelay(
    proxy.process,
    {
      onTitle: (title) => titles.push(title),
      onError: (error) => errors.push(error),
      onActivity() {},
      onState() {},
      onUserMessage() {},
      onUserMessageHistory() {},
    },
    "fixture-server",
    "Fixture",
    AbortSignal.timeout(5000),
  )
  const client = new WebSocket(relay.url)
  const delivered: string[] = []
  const waiters: Array<(value: string) => void> = []
  client.addEventListener("message", (event) => {
    const value = String(event.data)
    delivered.push(value)
    waiters.shift()?.(value)
  })
  const nextMessage = () => new Promise<string>((resolve) => waiters.push(resolve))
  try {
    await new Promise<void>((resolve, reject) => {
      client.addEventListener("open", () => resolve(), { once: true })
      client.addEventListener("error", reject, { once: true })
    })
    const resume = { id: 1, method: "thread/resume", params: { threadId: "remote-thread" } }
    client.send(JSON.stringify(resume))
    expect(await proxy.nextRequest("thread/resume")).toEqual(resume)
    const resumed = nextMessage()
    const response = proxy.send({
      id: 1,
      result: {
        thread: { id: "remote-thread", name: "Corrigir autenticação 👩‍💻", turns: [] },
      },
    })
    expect(await resumed).toBe(response)
    expect(titles.at(-1)).toBe("Corrigir autenticação 👩‍💻")

    const history = await proxy.nextRequest("thread/turns/list")
    proxy.send({ id: history.id, result: { data: [], nextCursor: null } })
    const helper = {
      id: "helper-start",
      method: "thread/start",
      params: { ephemeral: true, threadSource: "thread_title" },
    }
    client.send(JSON.stringify(helper))
    expect(await proxy.nextRequest("thread/start")).toEqual(helper)
    const helperStarted = nextMessage()
    const helperResponse = proxy.send({
      id: "helper-start",
      result: { thread: { id: "helper", name: null, turns: [] } },
    })
    expect(await helperStarted).toBe(helperResponse)
    const helperTurn = {
      id: "helper-turn",
      method: "turn/start",
      params: {
        threadId: "helper",
        input: [{ type: "text", text: "Generate a concise, single-line task title" }],
      },
    }
    client.send(JSON.stringify(helperTurn))
    expect(await proxy.nextRequest("turn/start")).toEqual(helperTurn)
    const helperEnded = nextMessage()
    const helperCompletion = proxy.send({
      method: "turn/completed",
      params: { threadId: "helper", turn: { id: "helper-turn", status: "completed" } },
    })
    expect(await helperEnded).toBe(helperCompletion)
    expect(titles.at(-1)).toBe("Corrigir autenticação 👩‍💻")

    const renamed = nextMessage()
    const notification = proxy.send({
      method: "thread/name/updated",
      params: {
        threadId: "remote-thread",
        threadName: "Título remoto atualizado",
      },
    })
    expect(await renamed).toBe(notification)
    expect(titles.at(-1)).toBe("Título remoto atualizado")

    const recent = await proxy.nextRequest("thread/list")
    proxy.send({ id: recent.id, result: { data: [{ id: "remote-thread", name: "Older name" }] } })
    const barrier = nextMessage()
    const status = proxy.send({
      method: "thread/status/changed",
      params: {
        threadId: "remote-thread",
        status: { type: "idle" },
      },
    })
    expect(await barrier).toBe(status)
    expect(titles.at(-1)).toBe("Título remoto atualizado")
    expect(delivered).toEqual([response, helperResponse, helperCompletion, notification, status])
    expect(errors).toEqual([])
  } finally {
    relay.stop()
    client.close()
  }
})
