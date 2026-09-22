import { getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import { type RefObject, useEffect } from "react"
import { identifyAgent } from "../model/agent-detection"
import { detectAgentScreen, detectAgentTitle } from "../model/agent-screen"
import {
  type AgentIdentity,
  type AgentObservation,
  type AgentSignal,
  observeAgent,
  sameAgentStatus,
} from "../model/agent-state"
import { AgentTaskTitle } from "../model/agent-task-title"
import { terminalProcessPresentation } from "../model/process-title"
import type { TerminalSession } from "../model/sessions"
import type { AgentMonitor } from "../services/agent-monitor"
import { readTerminalProcesses } from "../services/agent-processes"
import type { FreeTerminalProcessHandle } from "../services/terminal"

type TrackedAgent = {
  identity: AgentIdentity
  output: AgentMonitor
  observation: AgentObservation | undefined
  workingTitleRevision: number | null
  taskTitle: AgentTaskTitle
  signal: AgentSignal | undefined
  outputRevision: number
  titleRevision: number
}

type RunningCandidate = {
  session: TerminalSession
  output: AgentMonitor | undefined
  titleRevision: number | undefined
  handle: FreeTerminalProcessHandle | undefined
}

type DetectionState = {
  sessions: RefObject<TerminalSession[]>
  outputs: RefObject<Map<string, AgentMonitor>>
  seen: RefObject<ReadonlySet<string>>
  handles: RefObject<Map<string, FreeTerminalProcessHandle>>
  update: (id: string, patch: Partial<TerminalSession>) => void
  tracked: Map<string, TrackedAgent>
  unclaimedTitles: WeakMap<AgentMonitor, number>
}

function scanTrackedScreen(id: string, entry: TrackedAgent, state: DetectionState) {
  const session = state.sessions.current.find((candidate) => candidate.id === id)
  if (session?.status !== "running" || state.outputs.current.get(id) !== entry.output) {
    state.tracked.delete(id)
    return
  }
  try {
    const { title, titleRevision, revision } = entry.output
    if (
      !entry.signal ||
      entry.outputRevision !== revision ||
      entry.titleRevision !== titleRevision
    ) {
      const titleFinished =
        entry.workingTitleRevision !== null && titleRevision > entry.workingTitleRevision
      entry.signal = detectAgentScreen(
        entry.identity.profile,
        entry.output.screen(),
        title,
        titleFinished,
      )
      const titleSignal = detectAgentTitle(entry.identity.profile, title)
      if (titleSignal.state === "working") entry.workingTitleRevision = titleRevision
      entry.outputRevision = revision
      entry.titleRevision = titleRevision
    }
    entry.observation = observeAgent(
      entry.observation,
      entry.identity,
      entry.signal,
      state.seen.current.has(id),
      Date.now(),
    )
    entry.observation.status.taskTitle = entry.taskTitle.observe(title, titleRevision)
    if (!sameAgentStatus(session.agent, entry.observation.status)) {
      state.update(id, { agent: entry.observation.status })
    }
  } catch {
    // A pane can disappear during teardown. It must not stop other observations.
  }
}

function scanAgentScreens(state: DetectionState) {
  for (const [id, entry] of state.tracked) scanTrackedScreen(id, entry, state)
}

function runningCandidates(state: DetectionState): RunningCandidate[] {
  return state.sessions.current
    .filter(
      (session) =>
        session.status === "running" &&
        session.pid &&
        session.agentIntegration !== "codex-app-server",
    )
    .map((session) => ({
      session,
      output: state.outputs.current.get(session.id),
      titleRevision: state.outputs.current.get(session.id)?.titleRevision,
      handle: state.handles.current.get(session.id),
    }))
}

function currentCandidate(
  candidate: RunningCandidate,
  root: PromiseSettledResult<number | null>,
  state: DetectionState,
) {
  const current = state.sessions.current.find((session) => session.id === candidate.session.id)
  if (root.status !== "fulfilled") return null
  if (state.handles.current.get(candidate.session.id) !== candidate.handle) return null
  if (current?.pid !== candidate.session.pid || current.status !== "running") return null
  return { current, rootPid: root.value }
}

function updateProcessPresentation(
  candidate: RunningCandidate,
  current: TerminalSession,
  rootPid: number | null,
  processes: Awaited<ReturnType<typeof readTerminalProcesses>>,
  configured: readonly string[],
  update: DetectionState["update"],
) {
  const presentation = rootPid
    ? terminalProcessPresentation(rootPid, processes, configured)
    : { title: null, busy: false }
  const patch: Partial<TerminalSession> = {}
  if (current.busy !== presentation.busy) patch.busy = presentation.busy
  if (current.titleMode !== "manual" && presentation.title && presentation.title !== current.title)
    patch.title = presentation.title
  if (Object.keys(patch).length) update(candidate.session.id, patch)
}

function updateTrackedIdentity(
  candidate: RunningCandidate,
  current: TerminalSession,
  rootPid: number | null,
  processes: Awaited<ReturnType<typeof readTerminalProcesses>>,
  configured: readonly string[],
  state: DetectionState,
) {
  const { output } = candidate
  if (!output || state.outputs.current.get(candidate.session.id) !== output) return
  const identity = rootPid ? identifyAgent(rootPid, processes, configured) : null
  const previous = state.tracked.get(candidate.session.id)
  if (!identity) {
    state.tracked.delete(candidate.session.id)
    if (previous?.output === output) output.suspendScreen()
    if (current.agent) {
      output.clearTitle()
      state.update(candidate.session.id, { agent: null })
    }
    state.unclaimedTitles.set(
      output,
      current.agent ? output.titleRevision : (candidate.titleRevision ?? output.titleRevision),
    )
    return
  }
  if (previous?.identity.key === identity.key && previous.output === output) return
  if (previous?.output === output) output.clearTitle()
  state.tracked.set(candidate.session.id, {
    identity,
    output,
    observation: undefined,
    workingTitleRevision: null,
    taskTitle: new AgentTaskTitle(identity, state.unclaimedTitles.get(output) ?? -1),
    signal: undefined,
    outputRevision: -1,
    titleRevision: -1,
  })
  state.unclaimedTitles.delete(output)
}

function updateRunningCandidates(
  running: RunningCandidate[],
  roots: PromiseSettledResult<number | null>[],
  processes: Awaited<ReturnType<typeof readTerminalProcesses>>,
  state: DetectionState,
) {
  const configured = getUiSettings().terminalAgentCommands
  for (const [index, candidate] of running.entries()) {
    const root = roots[index]
    if (!root) continue
    const inspected = currentCandidate(candidate, root, state)
    if (!inspected) continue
    updateProcessPresentation(
      candidate,
      inspected.current,
      inspected.rootPid,
      processes,
      configured,
      state.update,
    )
    updateTrackedIdentity(
      candidate,
      inspected.current,
      inspected.rootPid,
      processes,
      configured,
      state,
    )
  }
}

export function useAgentDetection(
  sessions: RefObject<TerminalSession[]>,
  outputs: RefObject<Map<string, AgentMonitor>>,
  seen: RefObject<ReadonlySet<string>>,
  update: (id: string, patch: Partial<TerminalSession>) => void,
  handles: RefObject<Map<string, FreeTerminalProcessHandle>>,
) {
  useEffect(() => {
    const controller = new AbortController()
    const tracked = new Map<string, TrackedAgent>()
    const unclaimedTitles = new WeakMap<AgentMonitor, number>()
    const state: DetectionState = {
      sessions,
      outputs,
      seen,
      handles,
      update,
      tracked,
      unclaimedTitles,
    }
    let processTimer: ReturnType<typeof setTimeout> | undefined
    const scanScreens = () => scanAgentScreens(state)
    const pollProcesses = async () => {
      try {
        const running = runningCandidates(state)
        if (!running.length) return
        const [processes, roots] = await Promise.all([
          readTerminalProcesses(controller.signal),
          Promise.allSettled(
            running.map(({ session, handle }) =>
              handle?.readAgentPid
                ? handle.readAgentPid(controller.signal)
                : Promise.resolve(session.pid),
            ),
          ),
        ])
        if (controller.signal.aborted) return
        updateRunningCandidates(running, roots, processes, state)
        scanScreens()
      } catch {
        // Unavailable process inspection retains the last identity; screen observation continues.
      } finally {
        if (!controller.signal.aborted) processTimer = setTimeout(() => void pollProcesses(), 2000)
      }
    }
    const screenTimer = setInterval(scanScreens, 250)
    void pollProcesses()
    return () => {
      controller.abort()
      clearTimeout(processTimer)
      clearInterval(screenTimer)
      tracked.clear()
    }
  }, [sessions, outputs, seen, update, handles])
}
