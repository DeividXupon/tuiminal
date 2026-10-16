import { afterEach, expect, spyOn, test } from "bun:test"
import * as processes from "node:child_process"
import { getEventListeners } from "node:events"
import { RemoteLiveDiffProtocol } from "../packages/feature-terminal/src/services/remote-live-diff-protocol"

const spawnProcess = processes.spawn
const children: Array<{ child: processes.ChildProcess; closed: Promise<void> }> = []
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "spawn">> | undefined

function trackHelpers() {
  spawnSpy = spyOn(processes, "spawn").mockImplementation(((
    ...args: Parameters<typeof processes.spawn>
  ) => {
    const child = spawnProcess(...args)
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()))
    children.push({ child, closed })
    return child
  }) as typeof processes.spawn)
}

afterEach(async () => {
  spawnSpy?.mockRestore()
  for (const { child, closed } of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await closed
  }
})

for (const cancellation of ["abort", "close"] as const) {
  test(`helper ${cancellation} consumes a late EPIPE without interrupting the workspace`, async () => {
    trackHelpers()
    const protocol = new RemoteLiveDiffProtocol([process.execPath, "-e", "process.exit(0)"])
    const controller = new AbortController()
    const cancelled = new Error("Fixture cancelled")
    const result = protocol.request("context", [], controller.signal).catch((error) => error)
    try {
      if (cancellation === "abort") controller.abort(cancelled)
      else protocol.close()
      // Let the owned child close its pipe before Bun constructs/destroys the
      // writable on the next tick, reproducing the tab-switch cancellation race.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
      const error = await result
      if (cancellation === "abort") expect(error).toBe(cancelled)
      else expect(error.message).toContain("fechado")
      await Promise.all(children.map(({ closed }) => closed))
      expect(protocol.closed).toBe(true)
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
      await expect(protocol.request("context", [], new AbortController().signal)).rejects.toThrow(
        "desconectado",
      )
    } finally {
      protocol.close()
    }
  })
}

test.skipIf(process.platform === "win32")(
  "a synchronous helper write failure retires the helper and rejects every pending read",
  async () => {
    trackHelpers()
    const protocol = new RemoteLiveDiffProtocol([
      "sh",
      "-c",
      'IFS= read -r request; exec 0<&-; printf "TUIMINAL_LIVE_DIFF|1|0||\\n"; exec sleep 30',
    ])
    const first = new AbortController()
    const second = new AbortController()
    try {
      await protocol.request("context", [], first.signal)
      const pending = protocol.request("context", [], first.signal).catch((error) => error)
      const failed = protocol
        .request("patch", ["x".repeat(100_000)], second.signal)
        .catch((error) => error)
      expect(await failed).toMatchObject({ code: "EPIPE" })
      expect(await pending).toMatchObject({ code: "EPIPE" })
      expect(protocol.closed).toBe(true)
      expect(getEventListeners(first.signal, "abort")).toHaveLength(0)
      expect(getEventListeners(second.signal, "abort")).toHaveLength(0)
      await Promise.all(children.map(({ closed }) => closed))
    } finally {
      protocol.close()
    }
  },
)
