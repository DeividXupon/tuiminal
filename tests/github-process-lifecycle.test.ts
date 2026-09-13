import { afterEach, expect, spyOn, test } from "bun:test"
import * as processes from "node:child_process"
import { once } from "node:events"
import { runGhCommand } from "../src/features/git/services/github/transport"

const originalExecFile = processes.execFile
const children: processes.ChildProcess[] = []
let executionSpy: ReturnType<typeof spyOn<typeof processes, "execFile">> | undefined

function track() {
  executionSpy = spyOn(processes, "execFile").mockImplementation(((
    ...args: Parameters<typeof processes.execFile>
  ) => {
    const child = originalExecFile(...args)
    children.push(child)
    return child
  }) as typeof processes.execFile)
}

afterEach(async () => {
  executionSpy?.mockRestore()
  executionSpy = undefined
  for (const child of children.splice(0)) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue
    const closed = once(child, "close")
    child.kill("SIGKILL")
    await closed
  }
})

const stubborn = 'process.on("SIGTERM", () => {}); console.log("READY"); setInterval(() => {}, 100)'

test("pre-cancelled GitHub commands never spawn a process", async () => {
  track()
  const controller = new AbortController()
  controller.abort()
  await expect(
    runGhCommand(
      { args: ["-e", "console.log('unexpected')"] },
      { executable: process.execPath, signal: controller.signal },
    ),
  ).rejects.toMatchObject({ kind: "cancelled" })
  expect(children).toHaveLength(0)
})

test("GitHub timeout ends an owned helper that ignores SIGTERM", async () => {
  track()
  const result = runGhCommand(
    { args: ["-e", stubborn] },
    { executable: process.execPath, timeoutMs: 300 },
  ).catch((error: unknown) => error)
  const child = children[0]
  if (!child?.stdout) throw new Error("No owned gh fixture")
  await once(child.stdout, "data")
  const finished = await Promise.race([result, Bun.sleep(1500).then(() => "still-running")])
  expect(finished).toMatchObject({ kind: "timeout" })
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
})

test("GitHub cancellation settles only after the exact helper exits", async () => {
  track()
  const controller = new AbortController()
  const result = runGhCommand(
    { args: ["-e", stubborn] },
    { executable: process.execPath, signal: controller.signal, timeoutMs: 5000 },
  ).catch((error: unknown) => error)
  const child = children[0]
  if (!child?.stdout) throw new Error("No owned gh fixture")
  await once(child.stdout, "data")
  controller.abort()
  const finished = await Promise.race([result, Bun.sleep(1500).then(() => "still-running")])
  expect(finished).toMatchObject({ kind: "cancelled" })
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
})

test("excess output retains the output-limit classification", async () => {
  const result = runGhCommand(
    { args: ["-e", 'process.stdout.write("x".repeat(100_000))'] },
    { executable: process.execPath, maxOutputBytes: 64 },
  ).catch((error: unknown) => error)
  expect(await result).toMatchObject({ kind: "output-limit" })
})

test("a CLI that exits without reading stdin reports its command failure safely", async () => {
  const result = runGhCommand(
    {
      args: ["-e", 'console.error("fixture refused input"); process.exit(2)'],
      stdin: "x".repeat(512 * 1024),
    },
    { executable: process.execPath },
  ).catch((error: unknown) => error)
  expect(await result).toMatchObject({ kind: "command-failed", exitCode: 2 })
})

test("a successful exit cannot confirm a request whose input was not delivered", async () => {
  const result = runGhCommand(
    { args: ["-e", "process.exit(0)"], stdin: "private-input".repeat(512 * 1024) },
    { executable: process.execPath },
  ).catch((error: unknown) => error)
  expect(await result).toMatchObject({ kind: "input-failed" })
  expect(String(await result)).not.toContain("private-input")
})
