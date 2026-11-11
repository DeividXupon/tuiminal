import { expect, test } from "bun:test"
import { AgentSessionSounds } from "../packages/feature-terminal/src/model/agent-session-sounds"
import type { TerminalSession } from "../packages/feature-terminal/src/model/sessions"
import { CodexActivityObserver } from "../packages/feature-terminal/src/services/codex-activity-observer"
import { createAgentSoundObserver } from "../packages/feature-terminal/src/services/agent-sound-observer"
import * as sounds from "../packages/feature-terminal/src/services/agent-sounds"
import { spyOn } from "bun:test"

const session: TerminalSession = {
  id: "fixture",
  sectionId: "section",
  folderId: "folder",
  row: 0,
  column: 0,
  kind: "shell",
  label: "Fixture",
  shortLabel: "Fixture",
  displayCommand: "fixture",
  command: [],
  accent: "#fff",
  title: "Fixture",
  status: "running",
  pid: null,
  exitCode: null,
  startedAt: 1,
  agent: {
    key: "fixture:codex",
    label: "Codex",
    profile: "codex",
    state: "working",
    activity: null,
  },
}

test("screen agents sound once regardless of visibility, and ordinary shells stay silent", () => {
  const observer = new AgentSessionSounds()
  expect(observer.observe([session])).toEqual([])
  const blocked = { ...session, agent: { ...session.agent!, state: "blocked" as const } }
  expect(observer.observe([blocked])).toEqual(["question"])
  expect(observer.observe([{ ...blocked, title: "New metadata" }])).toEqual([])
  expect(observer.observe([session])).toEqual([])
  expect(observer.observe([{ ...session, agent: { ...session.agent!, state: "idle" } }])).toEqual([
    "completed",
  ])
  expect(observer.observe([{ ...session, status: "exited", exitCode: 1, agent: null }])).toEqual([
    "error",
  ])
  expect(observer.observe([{ ...session, status: "exited", exitCode: 1, agent: null }])).toEqual([])
  observer.observe([{ ...session, agent: null }])
  expect(observer.observe([{ ...session, status: "exited", exitCode: 1, agent: null }])).toEqual([])
})

test("integrated snapshots do not duplicate direct lifecycle audio, and restored state is silent", () => {
  const observer = new AgentSessionSounds()
  const integrated = {
    ...session,
    agentIntegration: { providerId: "codex", transport: "app-server" },
  } as const
  observer.observe([integrated])
  expect(
    observer.observe([{ ...integrated, agent: { ...session.agent!, state: "done" } }]),
  ).toEqual([])
  observer.observe([])
  expect(observer.observe([{ ...session, agent: { ...session.agent!, state: "done" } }])).toEqual(
    [],
  )
})

test("Codex failures are scoped to the live turn and stale callbacks cannot play sounds", () => {
  const played = spyOn(sounds, "playTerminalAgentSound").mockImplementation(() => undefined)
  try {
    let current = true
    const audio = createAgentSoundObserver(() => current)
    const observer = new CodexActivityObserver()
    const events = {
      onState: audio.observe,
      onActivity: () => undefined,
      onTaskFailed: audio.onTaskFailed,
    }
    const send = (method: string, turn: { id: string; status?: string }) =>
      observer.observeServer({ method, params: { threadId: "thread", turn } }, events)
    send("turn/started", { id: "one" })
    observer.observeServer(
      {
        id: 1,
        method: "item/tool/requestUserInput",
        params: { threadId: "thread", turnId: "one" },
      },
      events,
    )
    expect(played.mock.calls.map(([event]) => event)).toEqual(["question"])
    send("turn/completed", { id: "one", status: "failed" })
    send("turn/completed", { id: "one", status: "failed" })
    expect(played.mock.calls.map(([event]) => event)).toEqual(["question", "error"])
    send("turn/started", { id: "two" })
    send("turn/completed", { id: "two", status: "interrupted" })
    expect(played.mock.calls).toHaveLength(2)
    send("turn/started", { id: "three" })
    send("turn/completed", { id: "three", status: "completed" })
    expect(played.mock.calls.at(-1)?.[0]).toBe("completed")
    current = false
    send("turn/started", { id: "stale" })
    send("turn/completed", { id: "stale", status: "failed" })
    expect(played.mock.calls).toHaveLength(3)
  } finally {
    played.mockRestore()
  }
})

test("owned playback handles missing binaries and cancellation without a real audio device", async () => {
  expect(
    await sounds.runAgentSoundCommand(
      ["/tuiminal-fixture-missing-player"],
      "fixture.wav",
      new AbortController().signal,
    ),
  ).toBe(false)
  const controller = new AbortController()
  const pending = sounds.runAgentSoundCommand(
    [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    "fixture.wav",
    controller.signal,
  )
  controller.abort()
  expect(await pending).toBe(false)
})
