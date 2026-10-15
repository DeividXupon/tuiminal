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
    agentIntegration: { providerId: "codex", transport: "app-server" },
    agentLaunch: {
      providerId: "codex",
      transport: "app-server",
      remote: {
        profile: { id: "fixture", name: "Fixture", host: "fixture" },
        workingDirectory: "/srv/project",
      },
    },
    agent: { key: "codex", label: "Codex", profile: "codex", state, activity: null },
  } as TerminalSession
}

function hydratedRemoteSession(
  state: AgentState,
  revision: number,
  latestTurnStatus: NonNullable<TerminalSession["remoteCodexHydration"]>["latestTurnStatus"],
  waitingOnApproval = false,
) {
  return {
    ...remoteSession(state),
    remoteCodexHydration: {
      revision,
      threadId: "thread-1",
      state,
      latestTurnStatus,
      waitingOnApproval,
    },
  }
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

test("coalesces one catch-up sync after a completed turn is hydrated", () => {
  const observations = new Map<string, RemoteProjectTurnObservation>()
  const completed = hydratedRemoteSession("done", 1, "completed")
  expect(observeCompletedRemoteProjectTurns([completed], observations)).toHaveLength(1)
  expect(observeCompletedRemoteProjectTurns([completed], observations)).toEqual([])
  expect(
    observeCompletedRemoteProjectTurns(
      [hydratedRemoteSession("done", 2, "completed")],
      observations,
    ),
  ).toHaveLength(1)
})

test("does not catch up failed, interrupted, active, or approval-pending hydration", () => {
  const observations = new Map<string, RemoteProjectTurnObservation>()
  const sessions = [
    hydratedRemoteSession("unknown", 1, "failed"),
    hydratedRemoteSession("unknown", 2, "interrupted"),
    hydratedRemoteSession("working", 3, "inProgress"),
    hydratedRemoteSession("working", 4, "completed"),
    hydratedRemoteSession("blocked", 5, "completed", true),
  ]
  for (const session of sessions)
    expect(observeCompletedRemoteProjectTurns([session], observations)).toEqual([])
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
