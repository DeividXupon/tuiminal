import { expect, spyOn, test } from "bun:test"
import { tmpdir } from "node:os"
import { createShellRunnerCommand } from "../packages/feature-runner/src/services/shell-command"
import { startRunnerProcess } from "../packages/feature-runner/src/services/process"
import {
  bunRuntime,
  type BunRuntimeLike,
  type BunSubprocessLike,
} from "../packages/feature-runner/src/services/pty-runtime"

test("Runner PTY decodes split UTF-8 without delaying newline-free prompts", async () => {
  if (!bunRuntime) throw new Error("This test requires the configured Bun runtime")
  let receive: Parameters<BunRuntimeLike["spawn"]>[1]["terminal"]["data"] | undefined
  let complete!: (code: number) => void
  const terminal = { write: () => {}, close: () => {} }
  const subprocess: BunSubprocessLike = {
    pid: 0,
    terminal,
    exited: new Promise<number>((resolve) => {
      complete = resolve
    }),
    exitCode: null,
    signalCode: null,
    kill: () => {},
  }
  const runtime: BunRuntimeLike = bunRuntime
  const spawn = spyOn(runtime, "spawn").mockImplementation((_command, options) => {
    receive = options.terminal.data
    return subprocess
  })
  const output: string[] = []
  let exits = 0
  try {
    startRunnerProcess(
      tmpdir(),
      { ...createShellRunnerCommand("fixture"), interactive: true },
      {
        onLine: (line) => output.push(line),
        onExit: () => {
          exits += 1
        },
      },
    )
    const send = (bytes: Uint8Array) => {
      if (!receive) throw new Error("Missing PTY callback")
      receive(terminal, bytes)
    }
    const text = "Olá 中文 🧪? "
    const bytes = new TextEncoder().encode(text)
    for (const byte of bytes) send(Uint8Array.of(byte))
    expect(output.join("")).toBe(text)
    expect(exits).toBe(0)
    // Flush an incomplete final sequence once; output arriving after exit is stale.
    send(Uint8Array.of(0xe2))
    expect(output.join("")).toBe(text)
    complete(0)
    await subprocess.exited
    expect(exits).toBe(1)
    expect(output.join("")).toBe(`${text}�`)
    send(new TextEncoder().encode("LATE"))
    expect(output.join("")).toBe(`${text}�`)
  } finally {
    complete(0)
    await subprocess.exited
    spawn.mockRestore()
  }
})
