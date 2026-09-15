import { expect, test } from "bun:test"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import { prepareHttpRequest } from "../packages/feature-http/src/services/request-builder"
import { executePreparedHttpRequest } from "../packages/feature-http/src/services/fetch-transport"

test("truncating a continuous response closes its native transport without aborting the caller", async () => {
  let stopped = false
  let scheduled: ReturnType<typeof setImmediate> | undefined
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" })
    const send = () => {
      if (stopped) return
      if (response.write(Buffer.alloc(16_384, "x"))) scheduled = setImmediate(send)
      else
        response.once("drain", () => {
          scheduled = setImmediate(send)
        })
    }
    request.socket.once("close", () => {
      stopped = true
      clearImmediate(scheduled)
    })
    send()
  })
  try {
    server.listen(0, "127.0.0.1")
    await new Promise<void>((resolve) => server.once("listening", resolve))
    const caller = new AbortController()
    const request = prepareHttpRequest(
      createScratchRequest("stream", `http://127.0.0.1:${(server.address() as AddressInfo).port}`),
      "stream",
      0,
    )
    const response = await executePreparedHttpRequest(request, caller.signal, 32_768)
    expect(response.status).toBe(200)
    expect(response.truncated).toBe(true)
    expect(response.body.byteLength).toBe(32_768)
    expect(caller.signal.aborted).toBe(false)
    const deadline = performance.now() + 2_000
    while (!stopped && performance.now() < deadline) await Bun.sleep(10)
    expect(stopped).toBe(true)
  } finally {
    stopped = true
    clearImmediate(scheduled)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
