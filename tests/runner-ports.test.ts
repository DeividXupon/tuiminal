import { afterEach, expect, spyOn, test } from "bun:test"
import * as processes from "node:child_process"
import { once } from "node:events"
import {
  captureProcessOutput,
  parseListeningPorts,
} from "../packages/feature-runner/src/services/ports"

const originalSpawn = processes.spawn
const children: processes.ChildProcess[] = []
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "spawn">> | undefined

function trackChildren() {
  spawnSpy = spyOn(processes, "spawn").mockImplementation(((
    ...args: Parameters<typeof processes.spawn>
  ) => {
    const child = originalSpawn(...args)
    children.push(child)
    return child
  }) as typeof processes.spawn)
}

afterEach(async () => {
  spawnSpy?.mockRestore()
  spawnSpy = undefined
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) continue
    const closed = once(child, "close")
    child.kill("SIGKILL")
    await closed
  }
})

test("port probe bounds captured output even for a noisy helper", async () => {
  trackChildren()
  const output = await captureProcessOutput(process.execPath, [
    "-e",
    'process.stdout.write("x".repeat(1_000_000))',
  ])
  expect(output.length).toBeGreaterThan(0)
  expect(output.length).toBeLessThanOrEqual(128 * 1024)
})

test("timed-out probes finish only after the owned helper exits", async () => {
  trackChildren()
  await captureProcessOutput(
    process.execPath,
    ["-e", 'process.on("SIGTERM", () => {}); console.log("READY"); setInterval(() => {}, 100)'],
    250,
  )
  const child = children[0]
  expect(child).toBeDefined()
  expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true)
})

test("a cancelled probe does not launch another helper", async () => {
  trackChildren()
  const controller = new AbortController()
  controller.abort()
  expect(
    await captureProcessOutput(
      process.execPath,
      ["-e", "console.log('unexpected')"],
      250,
      controller.signal,
    ),
  ).toBe("")
  expect(children).toHaveLength(0)
})

test("cancelling a running probe discards partial output and waits for its exit", async () => {
  trackChildren()
  const controller = new AbortController()
  const removeListener = spyOn(controller.signal, "removeEventListener")
  try {
    const output = captureProcessOutput(
      process.execPath,
      ["-e", 'console.log("partial"); setInterval(() => {}, 100)'],
      2500,
      controller.signal,
    )
    const child = children[0]
    if (!child?.stdout) throw new Error("Missing owned probe")
    await once(child.stdout, "data")
    controller.abort()
    expect(await output).toBe("")
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    expect(removeListener.mock.calls.some(([event]) => event === "abort")).toBe(true)
  } finally {
    removeListener.mockRestore()
  }
})

test("successful probes preserve the complete output and release cancellation listeners", async () => {
  const controller = new AbortController()
  const removeListener = spyOn(controller.signal, "removeEventListener")
  try {
    expect(
      await captureProcessOutput(
        process.execPath,
        ["-e", 'process.stdout.write("p42\\ncserver\\nn*:3000\\n")'],
        2500,
        controller.signal,
      ),
    ).toBe("p42\ncserver\nn*:3000\n")
    expect(removeListener.mock.calls.some(([event]) => event === "abort")).toBe(true)
  } finally {
    removeListener.mockRestore()
  }
})

test("a missing port helper produces no discovered output", async () => {
  expect(await captureProcessOutput(`${process.execPath}-missing-port-probe`, [])).toBe("")
})

test("port parser keeps PID and IPv6 addresses while rejecting invalid ports", () => {
  expect(parseListeningPorts("p42\ncserver\nn[::1]:3000\nn*:70000\nn*:0\n", 12)).toEqual([
    { groupId: 12, pid: 42, processName: "server", host: "[::1]", port: 3000 },
  ])
})

test("port parser ignores a partial final address from capped output", () => {
  expect(parseListeningPorts("p42\ncserver\nn*:3000\nn*:400", 12).map(({ port }) => port)).toEqual([
    3000,
  ])
})
