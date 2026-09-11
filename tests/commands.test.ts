import { describe, expect, test } from "bun:test"
import {
  createFreeTerminalCommand,
  createShellTerminalCommand,
  startFreeTerminalProcess,
  stopAllFreeTerminalProcesses,
} from "../src/features/terminal/services/terminal"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import {
  createShellRunnerCommand,
  startRunnerProcess,
} from "../src/features/runner/services/runner"

describe("terminal and runner commands", () => {
  test("creates the login shell terminal command", () => {
    const shell = process.env.SHELL || "/bin/zsh"

    expect(createShellTerminalCommand()).toMatchObject({
      kind: "shell",
      label: "Terminal",
      displayCommand: `${shell} -l`,
      command: [shell, "-l"],
    })
  })

  test("normalizes a custom terminal command", () => {
    const shell = process.env.SHELL || "/bin/zsh"

    expect(createFreeTerminalCommand("  /usr/local/bin/codex --help  ")).toMatchObject({
      kind: "custom",
      label: "codex",
      shortLabel: "COD",
      displayCommand: "/usr/local/bin/codex --help",
      command: [shell, "-lc", "/usr/local/bin/codex --help"],
    })
  })

  test("creates manual runner commands through the platform shell", () => {
    const command = createShellRunnerCommand("php artisan serve")

    expect(command.id).toBe("custom:php artisan serve")
    expect(command.displayCommand).toBe("php artisan serve")
    expect(command.program).toBe(
      process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh"),
    )
    expect(command.args.at(-1)).toBe("php artisan serve")
  })

  test("sends input to a running command", async () => {
    if (process.platform === "win32") return
    const lines: string[] = []
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("runner process timed out")), 5_000)
      const handle = startRunnerProcess(
        tmpdir(),
        createShellRunnerCommand("read answer; echo received:$answer"),
        {
          onLine: (line) => lines.push(line),
          onExit: ({ code }) => {
            clearTimeout(timeout)
            try {
              expect(code).toBe(0)
              resolve()
            } catch (error) {
              reject(error)
            }
          },
        },
      )
      handle.write("hello\n")
    })
    expect(lines).toContain("received:hello")
  })

  test("forces a process group to stop when SIGTERM is ignored", async () => {
    if (process.platform === "win32") return
    const lines: string[] = []
    const result = await new Promise<{ signal: NodeJS.Signals | null; stopped: boolean }>(
      (resolve, reject) => {
        let handle: ReturnType<typeof startRunnerProcess> | undefined
        const timeout = setTimeout(() => {
          void handle?.stop().catch(() => undefined)
          reject(new Error("runner ignored both graceful and forced stop"))
        }, 5_000)
        handle = startRunnerProcess(
          tmpdir(),
          createShellRunnerCommand("trap '' TERM; echo ready; while :; do sleep 1; done"),
          {
            onLine: (line) => {
              lines.push(line)
              if (line === "ready") void handle?.stop().catch(reject)
            },
            onExit: (exit) => {
              clearTimeout(timeout)
              resolve(exit)
            },
          },
        )
      },
    )

    expect(lines).toContain("ready")
    expect(result.stopped).toBe(true)
    expect(result.signal).toBe("SIGKILL")
  })

  test("waits for an owned terminal tree to exit and preserves an unrelated process", async () => {
    if (process.platform === "win32") return
    const unrelated = spawn("/bin/sh", ["-c", "while :; do sleep 1; done"], {
      detached: true,
      stdio: "ignore",
    })
    let target: ReturnType<typeof startFreeTerminalProcess> | undefined
    try {
      let output = ""
      let firstStop: Promise<void> | undefined
      const exit = new Promise<{ signal: string | null; stopped: boolean }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          void target?.stop().catch(() => undefined)
          reject(new Error("terminal tree did not exit"))
        }, 6_000)
        target = startFreeTerminalProcess(
          [
            "/bin/sh",
            "-c",
            "trap '' INT TERM HUP; sh -c 'trap \"\" INT TERM HUP; while :; do sleep 1; done' & echo ready:$!; while :; do sleep 1; done",
          ],
          {
            cwd: tmpdir(),
            onData(data) {
              output += new TextDecoder().decode(data)
              if (!firstStop && output.includes("ready:")) {
                firstStop = target?.stop()
                expect(target?.stop()).toBe(firstStop)
              }
            },
            onExit(result) {
              clearTimeout(timeout)
              resolve(result)
            },
          },
        )
      })

      const result = await exit
      await firstStop
      expect(result.stopped).toBe(true)
      expect(result.signal).toBe("SIGKILL")
      expect(unrelated.exitCode).toBeNull()
      expect(unrelated.pid && process.kill(unrelated.pid, 0)).toBe(true)
    } finally {
      await stopAllFreeTerminalProcesses().catch(() => undefined)
      if (unrelated.pid) {
        try {
          process.kill(-unrelated.pid, "SIGKILL")
        } catch {
          unrelated.kill("SIGKILL")
        }
      }
    }
  })
})
