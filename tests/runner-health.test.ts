import { afterEach, describe, expect, test } from "bun:test"
import { getEventListeners } from "node:events"
import {
  isRunnerPortOpen,
  sleep,
  waitForRunnerHealthCheck,
} from "../packages/feature-runner/src/services/health"

const servers: Bun.Server<undefined>[] = []
const pendingResponses: Array<(response: Response) => void> = []
afterEach(async () => {
  for (const resolve of pendingResponses.splice(0)) resolve(new Response("fixture stopped"))
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
})

function pendingResponse() {
  const { promise, resolve } = Promise.withResolvers<Response>()
  pendingResponses.push(resolve)
  return promise
}

function localServer(fetch: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })
  servers.push(server)
  return { port: server.port!, url: server.url.toString() }
}

describe("Runner health checks", () => {
  test("cancels an HTTP probe while it waits for response headers", async () => {
    const received = Promise.withResolvers<void>()
    const { url } = localServer(() => {
      received.resolve()
      return pendingResponse()
    })
    const controller = new AbortController()
    const checking = waitForRunnerHealthCheck(
      { type: "http", url, timeoutMs: 5_000 },
      controller.signal,
    )
    await received.promise

    const started = performance.now()
    controller.abort()

    expect(await checking).toBe(false)
    expect(performance.now() - started).toBeLessThan(500)
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  })

  test("does not report a late success after cancellation", async () => {
    const controller = new AbortController()
    const { url } = localServer(() => {
      controller.abort()
      return new Response("healthy")
    })

    expect(
      await waitForRunnerHealthCheck({ type: "http", url, timeoutMs: 5_000 }, controller.signal),
    ).toBe(false)
  })

  test("keeps the second HTTP attempt inside the total deadline", async () => {
    let requests = 0
    const { url } = localServer(() => {
      requests += 1
      return requests === 1 ? new Response("not ready", { status: 503 }) : pendingResponse()
    })
    const started = performance.now()

    expect(await waitForRunnerHealthCheck({ type: "http", url, timeoutMs: 500 })).toBe(false)

    expect(requests).toBe(2)
    expect(performance.now() - started).toBeLessThan(800)
  })

  for (const status of [200, 503]) {
    test(`closes an unread streaming HTTP ${status} body`, async () => {
      const closed = Promise.withResolvers<void>()
      const { url } = localServer((request) => {
        request.signal.addEventListener("abort", () => closed.resolve(), { once: true })
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("stream remains open"))
            },
            cancel() {
              closed.resolve()
            },
          }),
          { status },
        )
      })

      expect(await waitForRunnerHealthCheck({ type: "http", url, timeoutMs: 100 })).toBe(
        status === 200,
      )
      expect(
        await Promise.race([closed.promise.then(() => true), sleep(300).then(() => false)]),
      ).toBe(true)
    })
  }

  test("removes abort listeners when retry sleeps finish normally", async () => {
    const controller = new AbortController()
    await sleep(1, controller.signal)
    await sleep(1, controller.signal)
    await sleep(1, controller.signal)

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
    controller.abort()
  })

  test("does not start an already cancelled port probe", async () => {
    const { port } = localServer(() => new Response())
    const controller = new AbortController()
    controller.abort()

    expect(await isRunnerPortOpen("127.0.0.1", port, controller.signal)).toBe(false)
  })

  test("cancels a pending port connection and removes its abort listener", async () => {
    const { port } = localServer(() => new Response())
    const controller = new AbortController()
    const checking = isRunnerPortOpen("127.0.0.1", port, controller.signal)
    controller.abort()

    expect(await checking).toBe(false)
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  })

  test("does not send an HTTP probe after cancellation or an exhausted deadline", async () => {
    let requests = 0
    const { url } = localServer(() => {
      requests += 1
      return new Response("healthy")
    })
    const controller = new AbortController()
    controller.abort()

    expect(await waitForRunnerHealthCheck({ type: "http", url, timeoutMs: 0 })).toBe(false)
    expect(
      await waitForRunnerHealthCheck({ type: "http", url, timeoutMs: 1_000 }, controller.signal),
    ).toBe(false)
    expect(requests).toBe(0)
  })

  test("recognizes a listening local port and releases its abort listener", async () => {
    const { port } = localServer(() => new Response())
    const controller = new AbortController()

    expect(
      await waitForRunnerHealthCheck(
        { type: "port", host: "127.0.0.1", port, timeoutMs: 1_000 },
        controller.signal,
      ),
    ).toBe(true)
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  })
})
