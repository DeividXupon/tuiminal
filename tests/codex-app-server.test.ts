import { afterEach, expect, spyOn, test } from "bun:test"
import { startCodexAppServer } from "../packages/feature-terminal/src/services/codex-app-server"

const encoder = new TextEncoder()
const decoder = new TextDecoder()
let spawnSpy: ReturnType<typeof spyOn<typeof Bun, "spawn">> | undefined

afterEach(() => spawnSpy?.mockRestore())

async function settleUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt += 1) await Bun.sleep(1)
  expect(predicate()).toBe(true)
}

test("completes the app-server handshake before starting a Codex turn", async () => {
  const messages: Record<string, unknown>[] = []
  let stdout!: ReadableStreamDefaultController<Uint8Array>
  let exit!: (code: number) => void
  const exited = new Promise<number>((resolve) => {
    exit = resolve
  })
  spawnSpy = spyOn(Bun, "spawn").mockImplementation(
    () =>
      ({
        pid: 123,
        stdin: {
          write(data: Uint8Array) {
            messages.push(JSON.parse(decoder.decode(data).trim()))
            return data.byteLength
          },
        },
        stdout: new ReadableStream<Uint8Array>({
          start(controller) {
            stdout = controller
          },
        }),
        stderr: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          },
        }),
        exited,
        kill() {
          exit(0)
        },
      }) as never,
  )

  const handle = startCodexAppServer("Corrija o login", "/workspace", {
    onActivity() {},
    onState() {},
    onOutput() {},
    onError(message) {
      throw new Error(message)
    },
    onExit() {},
  })
  await settleUntil(() => messages.length === 1)
  expect(messages[0]).toMatchObject({ method: "initialize", id: 1 })

  stdout.enqueue(encoder.encode('{"id":1,"result":{"userAgent":"codex"}}\n'))
  await settleUntil(() => messages.length === 3)
  expect(messages[1]).toEqual({ method: "initialized", params: {} })
  expect(messages[2]).toEqual({
    method: "thread/start",
    id: 2,
    params: { cwd: "/workspace", approvalPolicy: "onRequest" },
  })

  stdout.enqueue(encoder.encode('{"id":2,"result":{"thread":{"id":"thread-1"}}}\n'))
  await settleUntil(() => messages.length === 4)
  expect(messages[3]).toEqual({
    method: "turn/start",
    id: 3,
    params: {
      threadId: "thread-1",
      input: [{ type: "text", text: "Corrija o login" }],
    },
  })

  stdout.close()
  await handle.stop()
})
