import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { useAgentDetection } from "../../packages/feature-terminal/src/hooks/use-agent-detection"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"
import type { TerminalSession } from "../../packages/feature-terminal/src/model/sessions"
import { AgentMonitor } from "../../packages/feature-terminal/src/services/agent-monitor"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import { ClaudeHookObserver } from "../../packages/feature-terminal/src/services/claude-hooks"
import type { TermAgentsProcessHandle } from "../../packages/feature-terminal/src/services/terminal"

let tui: TestRendererSetup | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
let intervalSpy: ReturnType<typeof spyOn<typeof globalThis, "setInterval">> | undefined
let monitor: AgentMonitor | undefined
let suspendSpy: ReturnType<typeof spyOn<AgentMonitor, "suspendScreen">> | undefined
let scan: (() => void) | undefined
let update: (patch: Partial<TerminalSession>) => void

const snapshot: ProcessIdentity[] = [
  { pid: 101, parentPid: 1, executable: "claude", command: "claude" },
]

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  inspectionSpy?.mockRestore()
  intervalSpy?.mockRestore()
  suspendSpy?.mockRestore()
  monitor?.dispose()
  monitor = undefined
  scan = undefined
})

async function mount(pending = false) {
  let resolve: ((value: ProcessIdentity[]) => void) | undefined
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockImplementation(() =>
    pending
      ? new Promise((done) => {
          resolve = done
        })
      : Promise.resolve(snapshot),
  )
  const originalInterval = globalThis.setInterval
  intervalSpy = spyOn(globalThis, "setInterval").mockImplementation(((
    ...[callback, delay, ...args]: Parameters<typeof setInterval>
  ) => {
    if (delay === 250) scan = callback as () => void
    return originalInterval(callback, delay, ...args)
  }) as typeof setInterval)
  const session: TerminalSession = {
    id: "fixture",
    sectionId: "fixture",
    folderId: "terminal",
    row: 0,
    column: 0,
    kind: "shell",
    label: "Claude",
    shortLabel: "Claude",
    displayCommand: "claude",
    command: ["claude"],
    accent: "#ffffff",
    title: "Claude",
    status: "running",
    pid: 101,
    exitCode: null,
    startedAt: 0,
    agent: null,
    agentIntegration: { providerId: "claude", transport: "screen" },
  }
  monitor = new AgentMonitor(80, 24)
  monitor.write(new TextEncoder().encode("\x1b]2;✳ Fixture\x07"))
  const sessions = { current: [session] as [TerminalSession] }
  const outputs = { current: new Map([[session.id, monitor]]) }
  const seen = { current: new Set<string>() }
  const handles = { current: new Map<string, TermAgentsProcessHandle>() }
  let publish: ((value: TerminalSession) => void) | undefined
  const patch = (_id: string, value: Partial<TerminalSession>) => {
    const next = { ...sessions.current[0], ...value }
    sessions.current = [next]
    publish?.(next)
  }
  update = (value) => patch(session.id, value)
  function Fixture() {
    const [current, setCurrent] = useState(session)
    publish = setCurrent
    useAgentDetection(sessions, outputs, seen, patch, handles)
    return <text>{`${current.agent?.state}:${current.agent?.activity}`}</text>
  }
  tui = await testRender(<Fixture />, { width: 80, height: 24 })
  await act(async () => {})
  await tui.renderOnce()
  expect(scan).toBeDefined()
  return { sessions, resolve: () => resolve?.(snapshot) }
}

test("Claude hooks retire the existing screen observer before the next screen sample", async () => {
  const { sessions } = await mount()
  expect(sessions.current[0]?.agent?.state).toBe("idle")
  if (!monitor) throw new Error("Expected the fixture monitor")
  suspendSpy = spyOn(monitor, "suspendScreen")
  const observer = new ClaudeHookObserver(
    { cwd: process.cwd() },
    {
      onObserved: () => update({ agentIntegration: { providerId: "claude", transport: "hooks" } }),
      onState: (state) =>
        update({
          agent: {
            key: "claude-hooks:fixture",
            label: "Claude",
            profile: "claude",
            state,
            activity: null,
          },
        }),
      onActivity(activity) {
        const agent = sessions.current[0].agent
        if (!agent) throw new Error("Expected a hook state before activity")
        update({ agent: { ...agent, state: "working", activity } })
      },
      onTitle() {},
      onUserMessageHistory() {},
      onError() {},
    },
  )
  for (const [event, state, activity] of [
    [{ hook_event_name: "UserPromptSubmit", prompt: "Inspect the fixture" }, "working", "thinking"],
    [
      { hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "read-1" },
      "working",
      "reading",
    ],
    [{ hook_event_name: "PermissionRequest" }, "blocked", null],
    [{ hook_event_name: "Stop", last_assistant_message: "Done" }, "done", null],
  ] as const) {
    await act(async () => {
      observer.receive(event)
      scan?.()
    })
    await tui?.renderOnce()
    expect(sessions.current[0]?.agent).toMatchObject({ state, activity })
    expect(tui?.captureCharFrame()).toContain(`${state}:${activity}`)
  }
  expect(suspendSpy).toHaveBeenCalledTimes(1)
})

test("process inspection started before Claude hooks cannot reclaim structured activity", async () => {
  const { sessions, resolve } = await mount(true)
  await act(async () => {
    update({
      agentIntegration: { providerId: "claude", transport: "hooks" },
      agent: {
        key: "claude-hooks:fixture",
        label: "Claude",
        profile: "claude",
        state: "working",
        activity: "coding",
      },
    })
    resolve()
  })
  await tui?.renderOnce()
  expect(sessions.current[0]?.agent).toMatchObject({ state: "working", activity: "coding" })
})
