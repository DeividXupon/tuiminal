import { expect, test } from "bun:test"
import { resolveCodexExecutable } from "../packages/feature-terminal/src/services/codex-executable"

test("Codex executable resolution prefers PATH", () => {
  expect(
    resolveCodexExecutable({
      home: "/home/user",
      which: () => "/opt/codex/bin/codex",
      executable: () => true,
    }),
  ).toBe("/opt/codex/bin/codex")
})

test("Codex executable resolution finds a standalone install outside PATH", () => {
  const checked: string[] = []
  expect(
    resolveCodexExecutable({
      home: "/home/user",
      platform: "linux",
      which: () => null,
      executable(path) {
        checked.push(path)
        return path === "/home/user/.codex/packages/standalone/current/bin/codex"
      },
    }),
  ).toBe("/home/user/.codex/packages/standalone/current/bin/codex")
  expect(checked).toEqual([
    "/home/user/.local/bin/codex",
    "/home/user/.codex/packages/standalone/current/bin/codex",
  ])
})

test("Codex executable resolution retains the command fallback", () => {
  expect(
    resolveCodexExecutable({
      home: "/home/user",
      which: () => null,
      executable: () => false,
    }),
  ).toBe("codex")
})
