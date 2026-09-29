import "./setup"
import { expect, test } from "bun:test"
import {
  observeCompletedRemoteProjectTurns,
  type RemoteProjectTurnObservation,
  shouldReportRemoteProjectAutoSyncFailure,
} from "../packages/feature-terminal/src/hooks/use-remote-project-auto-sync"
import type { AgentState } from "../packages/feature-terminal/src/model/agent-state"
import type { TerminalSession } from "../packages/feature-terminal/src/model/sessions"

function remoteSession(state: AgentState, startedAt = 1): TerminalSession {
  return {
    id: "remote",
    startedAt,
    agentIntegration: "codex-app-server",
    codex: {
      appServer: true,
      remote: {
        profile: { id: "fixture", name: "Fixture", host: "fixture" },
        workingDirectory: "/srv/project",
      },
    },
    agent: { key: "codex", label: "Codex", profile: "codex", state, activity: null },
  } as TerminalSession
}

test("requests automatic sync once after a successful remote turn", () => {
  const observations = new Map<string, RemoteProjectTurnObservation>()
  expect(observeCompletedRemoteProjectTurns([remoteSession("done")], observations)).toEqual([])
  expect(observeCompletedRemoteProjectTurns([remoteSession("working")], observations)).toEqual([])
  expect(observeCompletedRemoteProjectTurns([remoteSession("blocked")], observations)).toEqual([])
  expect(observeCompletedRemoteProjectTurns([remoteSession("done")], observations)).toHaveLength(1)
  expect(observeCompletedRemoteProjectTurns([remoteSession("done")], observations)).toEqual([])
})

test("does not request automatic sync after a failed or restarted turn", () => {
  const observations = new Map<string, RemoteProjectTurnObservation>()
  observeCompletedRemoteProjectTurns([remoteSession("working")], observations)
  observeCompletedRemoteProjectTurns([remoteSession("unknown")], observations)
  expect(observeCompletedRemoteProjectTurns([remoteSession("done")], observations)).toEqual([])
  observeCompletedRemoteProjectTurns([remoteSession("working")], observations)
  expect(observeCompletedRemoteProjectTurns([remoteSession("done", 2)], observations)).toEqual([])
})

test("reports automatic sync failures only for a live matching session", () => {
  const session = remoteSession("done")
  const reportable = {
    active: true,
    enabled: true,
    sessions: [session],
    session,
  }
  expect(shouldReportRemoteProjectAutoSyncFailure(reportable)).toBe(true)
  expect(shouldReportRemoteProjectAutoSyncFailure({ ...reportable, active: false })).toBe(false)
  expect(shouldReportRemoteProjectAutoSyncFailure({ ...reportable, enabled: false })).toBe(false)
  expect(
    shouldReportRemoteProjectAutoSyncFailure({
      ...reportable,
      sessions: [remoteSession("done", 2)],
    }),
  ).toBe(false)
})
