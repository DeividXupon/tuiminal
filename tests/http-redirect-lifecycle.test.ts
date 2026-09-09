import { afterEach, expect, test } from "bun:test"
import { createScratchRequest } from "../src/features/http/model/workspace"
import { prepareHttpRequest } from "../src/features/http/services/request-builder"
import { executePreparedHttpRequest } from "../src/features/http/services/fetch-transport"
import { HttpRedirectApprovalQueue } from "../src/features/http/services/redirect-approvals"
import { runHttpCollectionCase } from "../src/features/http/services/collection-runner"
import type { HttpRedirectApproval } from "../src/features/http/model/redirect-policy"

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
})

function endpoints() {
  const paths: string[] = []
  const destination = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      paths.push(new URL(request.url).pathname)
      return Response.json({ ok: true })
    },
  })
  servers.push(destination)
  const source = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      paths.push(new URL(request.url).pathname)
      return new URL(request.url).pathname === "/dependency"
        ? Response.json({ id: 42 })
        : new Response(null, {
            status: 307,
            headers: { location: `http://127.0.0.1:${destination.port}/target` },
          })
    },
  })
  servers.push(source)
  return { paths, source: `http://127.0.0.1:${source.port}` }
}

for (const end of ["timeout", "cancelled"] as const) {
  test(`${end} while waiting discards the prompt and cannot send after late approval`, async () => {
    const { source, paths } = endpoints()
    const request = createScratchRequest(end, `${source}/write`)
    request.method = "POST"
    request.body = { kind: "text", text: "fixture", form: [] }
    request.options.timeoutMs = end === "timeout" ? 300 : 10_000
    const queue = new HttpRedirectApprovalQueue()
    const controller = new AbortController()
    const entered = Promise.withResolvers<number>()
    const pending = executePreparedHttpRequest(
      prepareHttpRequest(request, end, 0),
      controller.signal,
      undefined,
      undefined,
      false,
      (approval, signal) => {
        const result = queue.request(approval, signal)
        const id = queue.snapshot()?.id
        if (id === undefined) throw new Error("Expected a live prompt")
        entered.resolve(id)
        return result
      },
    ).catch((error: unknown) => error)
    try {
      const id = await entered.promise
      expect(paths).toEqual(["/write"])
      if (end === "cancelled") controller.abort()
      expect(await pending).toHaveProperty("kind", end)
      expect(queue.snapshot()).toBeNull()
      queue.decide(id, true)
      await Bun.sleep(10)
      expect(paths).toEqual(["/write"])
    } finally {
      controller.abort()
      queue.dispose()
    }
  })
}

test("collection consent resumes in place without replaying a dependency or original POST", async () => {
  const { source, paths } = endpoints()
  const dependency = createScratchRequest("dependency", `${source}/dependency`)
  dependency.name = "dependency"
  dependency.method = "POST"
  const request = createScratchRequest("write", `${source}/write`)
  request.name = "write"
  request.method = "POST"
  request.body = { kind: "text", text: "fixture", form: [] }
  request.chain = { dependsOn: dependency.name, extract: [] }
  const entered = Promise.withResolvers<HttpRedirectApproval>()
  const answer = Promise.withResolvers<boolean>()
  const pending = runHttpCollectionCase({
    name: "collection",
    items: [request, dependency].map((request) => ({ filePath: "fixture.http", request })),
    selector: request.name,
    variables: new Map(),
    environmentName: "isolated-fixture",
    root: process.cwd(),
    authorizeRedirect: (approval) => {
      entered.resolve(approval)
      return answer.promise
    },
  })
  try {
    const approval = await entered.promise
    expect(approval.environmentName).toBe("isolated-fixture")
    expect(Object.isFrozen(approval)).toBe(true)
    expect(paths).toEqual(["/dependency", "/write"])
    answer.resolve(true)
    const result = await pending
    expect(result.items.map((item) => item.response?.status)).toEqual([200, 200])
    expect(paths).toEqual(["/dependency", "/write", "/target"])
  } finally {
    answer.resolve(false)
    await pending
  }
})
