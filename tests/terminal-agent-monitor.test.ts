import { expect, spyOn, test } from "bun:test"
import * as opentui from "@opentui/core"
import { AgentMonitor } from "../packages/feature-terminal/src/services/agent-monitor"

test("ordinary terminal output does not create the shadow screen until agent inspection", () => {
  const resolve = spyOn(opentui, "resolveRenderLib")
  const monitor = new AgentMonitor(80, 24)
  try {
    monitor.write(new TextEncoder().encode("shell output\r\n"))
    expect(monitor.revision).toBe(1)
    expect(resolve).not.toHaveBeenCalled()

    expect(monitor.screen()).toContain("shell output")
    const initializationCalls = resolve.mock.calls.length
    expect(initializationCalls).toBeGreaterThan(0)
    expect(monitor.screen()).toContain("shell output")
    expect(resolve).toHaveBeenCalledTimes(initializationCalls)
  } finally {
    monitor.dispose()
    resolve.mockRestore()
  }
})

test("batched shadow writes preserve split OSC titles and terminal updates", () => {
  const monitor = new AgentMonitor(20, 5)
  const encoder = new TextEncoder()
  try {
    monitor.write(encoder.encode("first\r\nsecond\u001b]0;Título "))
    monitor.write(encoder.encode("日本語\u0007\rreplacement"))
    expect(monitor.title).toBe("Título 日本語")
    expect(monitor.titleRevision).toBe(1)
    expect(monitor.revision).toBe(2)
    expect(monitor.screen()).toContain("replacement")
  } finally {
    monitor.dispose()
  }
})
