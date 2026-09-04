import { describe, expect, test } from "bun:test"
import {
  createFreeTerminalCommand,
  createShellTerminalCommand,
} from "../src/features/terminal/services/terminal"
import { tmpdir } from "node:os"
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
      command: [shell, "-lc", "exec /usr/local/bin/codex --help"],
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
})
