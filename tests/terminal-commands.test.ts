import { describe, expect, test } from "bun:test"
import { createFreeTerminalCommand } from "../src/features/terminal/services/terminal"

describe.skipIf(process.platform === "win32")("custom Free Terminal shell semantics", () => {
  test.each([
    ["printf first && printf second", "firstsecond", 0],
    ["false || printf recovered", "recovered", 0],
    ["printf first; printf second", "firstsecond", 0],
    ["TUIMINAL_TEST_VALUE=hello; printf '%s' \"$TUIMINAL_TEST_VALUE\"", "hello", 0],
    ["for word in first second; do printf '%s' \"$word\"; done", "firstsecond", 0],
    ["printf piped | cat", "piped", 0],
    ["printf done; exit 7", "done", 7],
  ])("runs the complete shell expression: %s", (source, output, exitCode) => {
    const command = createFreeTerminalCommand(source)
    // Exercise the prepared expression in a non-login shell, without loading user startup files.
    const result = Bun.spawnSync(["/bin/sh", "-c", command.command.at(-1) ?? ""], {
      env: { PATH: "/usr/bin:/bin" },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.stdout.toString()).toBe(output)
    expect(result.stderr.toString()).toBe("")
    expect(result.exitCode).toBe(exitCode)
    expect(command.displayCommand).toBe(source)
  })
})
