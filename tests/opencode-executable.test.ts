import { expect, test } from "bun:test"
import { resolveOpenCodeExecutable } from "../packages/feature-terminal/src/services/opencode-executable"

test("OpenCode executable resolution prefers PATH", () => {
  expect(
    resolveOpenCodeExecutable({
      home: "/home/user",
      which: () => "/opt/opencode/bin/opencode",
      executable: () => true,
    }),
  ).toBe("/opt/opencode/bin/opencode")
})

test("OpenCode executable resolution finds the standalone install outside PATH", () => {
  const checked: string[] = []
  expect(
    resolveOpenCodeExecutable({
      home: "/home/user",
      platform: "linux",
      which: () => null,
      executable(path) {
        checked.push(path)
        return path === "/home/user/.opencode/bin/opencode"
      },
    }),
  ).toBe("/home/user/.opencode/bin/opencode")
  expect(checked).toEqual(["/home/user/.opencode/bin/opencode"])
})

test("OpenCode executable resolution retains the command fallback", () => {
  expect(
    resolveOpenCodeExecutable({
      home: "/home/user",
      which: () => null,
      executable: () => false,
    }),
  ).toBe("opencode")
})
