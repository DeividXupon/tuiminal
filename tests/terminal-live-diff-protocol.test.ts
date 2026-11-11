import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as processes from "node:child_process"
import { EventEmitter, getEventListeners } from "node:events"
import { PassThrough } from "node:stream"
import { RemoteLiveDiffProtocol } from "../packages/feature-terminal/src/services/remote-live-diff-protocol"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function fixture() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
    kill: mock(() => true),
  })
  const commands: string[] = []
  child.stdin.on("data", (chunk) => commands.push(String(chunk)))
  const spawn = spyOn(processes, "spawn").mockReturnValue(
    child as unknown as processes.ChildProcessWithoutNullStreams,
  )
  cleanups.push(() => spawn.mockRestore())
  const timers = spyOn(globalThis, "setTimeout")
  cleanups.push(() => timers.mockRestore())
  const protocol = new RemoteLiveDiffProtocol(["fixture-helper"])
  cleanups.push(() => protocol.close())
  const reply = (id: number) => child.stdout.write(`TUIMINAL_LIVE_DIFF|${id}|0||\n`)
  return { protocol, child, commands, timers, reply }
}

test("remote reads get their own deadline after earlier reads finish", async () => {
  const { protocol, commands, timers, reply } = fixture()
  const signal = new AbortController().signal
  const first = protocol.request("status", ["/first"], signal)
  const second = protocol.request("status", ["/second"], signal)
  expect(commands).toHaveLength(1)
  expect(timers).toHaveBeenCalledTimes(1)
  expect(timers.mock.calls[0]?.[1]).toBeGreaterThan(10_000)
  reply(1)
  await first
  expect(commands).toHaveLength(2)
  expect(timers).toHaveBeenCalledTimes(2)
  reply(2)
  await expect(second).resolves.toMatchObject({ status: 0 })
})

test("cancelling an active preview drains its reply without disconnecting the snapshot", async () => {
  const { protocol, child, commands, reply } = fixture()
  const preview = new AbortController()
  const cancelled = new Error("Selection changed")
  const patch = protocol.request("patch", [], preview.signal, "discard").catch((error) => error)
  const snapshot = protocol.request("status", [], new AbortController().signal)
  preview.abort(cancelled)
  expect(await patch).toBe(cancelled)
  expect(protocol.closed).toBe(false)
  expect(child.kill).not.toHaveBeenCalled()
  expect(getEventListeners(preview.signal, "abort")).toHaveLength(0)
  expect(commands).toHaveLength(1)
  reply(1)
  expect(commands).toHaveLength(2)
  reply(2)
  await expect(snapshot).resolves.toMatchObject({ status: 0 })
})

test("cancelling a queued preview skips its read and keeps the next selection", async () => {
  const { protocol, commands, reply } = fixture()
  const preview = new AbortController()
  const signal = new AbortController().signal
  const snapshot = protocol.request("status", [], signal)
  const old = protocol.request("patch", [], preview.signal, "discard").catch((error) => error)
  const current = protocol.request("patch", [], signal, "discard")
  preview.abort()
  expect(await old).toBeInstanceOf(Error)
  reply(1)
  await snapshot
  expect(commands).toEqual(["1|status\n", "3|patch\n"])
  reply(3)
  await expect(current).resolves.toMatchObject({ status: 0 })
})

test("a cancelled preview still has a bounded deadline while draining", async () => {
  const { protocol, child, timers } = fixture()
  const preview = new AbortController()
  const patch = protocol.request("patch", [], preview.signal, "discard").catch((error) => error)
  const snapshot = protocol.request("status", [], new AbortController().signal).catch((e) => e)
  preview.abort()
  await patch
  const timeout = timers.mock.calls[0]?.[0] as () => void
  timeout()
  expect((await snapshot).message).toContain("Tempo limite")
  expect(protocol.closed).toBe(true)
  expect(child.kill).toHaveBeenCalledTimes(1)
})

test("closing the panel aborts the active and queued reads", async () => {
  const { protocol, child } = fixture()
  const controller = new AbortController()
  const reads = ["status", "worktrees"].map((operation) =>
    protocol.request(operation, [], controller.signal).catch((error) => error),
  )
  controller.abort()
  for (const result of await Promise.all(reads)) expect(result).toBe(controller.signal.reason)
  expect(protocol.closed).toBe(true)
  expect(child.kill).toHaveBeenCalledTimes(1)
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
})
