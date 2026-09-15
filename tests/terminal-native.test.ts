import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createFreeTerminalCommand,
  createShellTerminalCommand,
  startFreeTerminalProcess,
} from "../packages/feature-terminal/src/services/terminal"

for (const custom of [false, true]) {
  test(`native Free Terminal ${custom ? "custom command" : "default shell"} delivers input and retires its child`, async () => {
    const root = await mkdtemp(join(tmpdir(), "tuiminal-terminal-native-"))
    const oldShell = process.env.SHELL
    const oldHome = process.env.HOME
    delete process.env.SHELL
    process.env.HOME = root
    let handle: ReturnType<typeof startFreeTerminalProcess> | undefined
    let output = ""
    const decoder = new TextDecoder()
    const exited = Promise.withResolvers<{ code: number | null }>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const script = "echo TUIMINAL_NATIVE_TERMINAL_OK"
    try {
      const command = custom ? createFreeTerminalCommand(script) : createShellTerminalCommand()
      handle = startFreeTerminalProcess(command.command, {
        cwd: root,
        onData: (data) => {
          output += decoder.decode(data, { stream: true })
        },
        onExit: (result) => exited.resolve(result),
      })
      if (!custom) {
        const enter = process.platform === "win32" ? "\r" : "\n"
        handle.write(`${script}${enter}exit${enter}`)
      }
      const result = await Promise.race([
        exited.promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Native terminal timed out: ${output}`)), 5000)
        }),
      ])
      expect(result.code).toBe(0)
      expect(Bun.stripANSI(output)).toMatch(/(?:^|\r?\n)TUIMINAL_NATIVE_TERMINAL_OK\s*(?:\r?\n|$)/)
      await handle.stop()
      expect(() => process.kill(handle!.pid, 0)).toThrow()
    } finally {
      clearTimeout(timer)
      try {
        await handle?.stop()
      } finally {
        if (oldShell === undefined) delete process.env.SHELL
        else process.env.SHELL = oldShell
        if (oldHome === undefined) delete process.env.HOME
        else process.env.HOME = oldHome
        await rm(root, { recursive: true, force: true })
      }
    }
  }, 10000)
}
