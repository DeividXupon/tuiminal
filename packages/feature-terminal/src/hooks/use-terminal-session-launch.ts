import { basename } from "node:path"
import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { type RefObject, useCallback, useRef } from "react"
import type { AgentMessageHistoryEntry } from "../model/agent-message-history"
import { agentProvider } from "../model/agent-provider"
import type { AgentActivity, AgentState } from "../model/agent-state"
import { cleanAgentTaskTitle } from "../model/agent-task-title"
import {
  type AgentSessionIntegration,
  type TermAgentsCommand,
  integratedAgentLaunch,
  type TerminalSession,
} from "../model/sessions"
import { terminalExitMessage } from "../rendering/presentation"
import { AgentMonitor } from "../services/agent-monitor"
import { startIntegratedAgentTerminal } from "../services/integrated-agent-terminal"
import { OpenCodeSessionProjection } from "../services/opencode-session-projection"
import { RemoteCodexCompatibilityError } from "../services/remote-codex-handshake"
import {
  TERM_AGENTS_WORKING_DIRECTORY,
  type TermAgentsExit,
  type TermAgentsProcessHandle,
} from "../services/terminal"
import { startWorkspaceTerminal } from "../services/terminal-backend"
import type { TerminalLaunch, TerminalLaunches } from "../services/terminal-launches"
import { stopTerminalBeforeRestart, TerminalRetirementError } from "../services/terminal-lifecycle"
import { notifyTerminalExit, useTerminalNotifications } from "./use-terminal-notifications"

type TerminalSize = { columns: number; rows: number }
type Notify = Parameters<typeof notifyTerminalExit>[0]

type LaunchContext = {
  dimensions: RefObject<{ width: number; height: number }>
  terminals: RefObject<Map<string, EmbeddedTerminalRenderable>>
  handles: RefObject<Map<string, TermAgentsProcessHandle>>
  commands: RefObject<Map<string, TermAgentsCommand>>
  sizes: RefObject<Map<string, TerminalSize>>
  launches: RefObject<TerminalLaunches>
  outputs: RefObject<Map<string, AgentMonitor>>
  activeSession: RefObject<string | null>
  updateSession: (id: string, update: Partial<TerminalSession>) => void
  updateAgentMessages: (
    id: string,
    messages: readonly AgentMessageHistoryEntry[],
    replace: boolean,
  ) => void
  clearAgentMessages: (id: string) => void
  closeFinishedShell: (id: string) => void
  focusTerminal: (id: string) => void
  setNotice: (message: string) => void
  notify: Notify
}

type ActiveLaunch = { handle: TermAgentsProcessHandle | null; ended: boolean }

function currentLaunch(
  id: string,
  terminal: EmbeddedTerminalRenderable,
  launch: TerminalLaunch,
  context: LaunchContext,
) {
  return launch.isCurrent() && context.terminals.current.get(id) === terminal
}

function terminalSize(id: string, context: LaunchContext) {
  const size = context.sizes.current.get(id)
  return {
    columns: size?.columns ?? Math.max(40, context.dimensions.current.width - 28),
    rows: size?.rows ?? Math.max(10, context.dimensions.current.height - 1),
  }
}

function beginAgentOutput(id: string, size: TerminalSize, context: LaunchContext) {
  context.outputs.current.get(id)?.dispose()
  const output = new AgentMonitor(size.columns, size.rows)
  context.outputs.current.set(id, output)
  const command = context.commands.current.get(id)
  context.updateSession(id, {
    ...(command && integratedAgentLaunch(command) ? {} : { agent: null }),
    busy: false,
    status: "starting",
    startError: "",
    remoteCodexCompatibility: undefined,
    remoteCodexHydration: undefined,
    remoteAgentHydration: undefined,
    pid: null,
    exitCode: null,
    startedAt: Date.now(),
  })
  return output
}

function finishTerminalExit(
  id: string,
  command: TermAgentsCommand,
  result: TermAgentsExit,
  launch: TerminalLaunch,
  active: ActiveLaunch,
  output: AgentMonitor,
  context: LaunchContext,
) {
  active.ended = true
  if (
    context.handles.current.get(id) === active.handle &&
    !(active.handle?.retainCloseAfterExit && active.handle.close)
  )
    context.handles.current.delete(id)
  if (!launch.isCurrent()) return
  output.dispose()
  context.outputs.current.delete(id)
  if (command.kind === "shell" && !result.stopped) {
    if (!command.tmux) notifyTerminalExit(context.notify, command.label, result)
    context.closeFinishedShell(id)
    return
  }
  const message = terminalExitMessage(command, result)
  context.terminals.current.get(id)?.write(message.text)
  context.updateSession(id, {
    agent: null,
    busy: false,
    status: message.failed ? "failed" : "exited",
    pid: null,
    exitCode: result.code,
  })
  if (!command.tmux) notifyTerminalExit(context.notify, command.label, result)
}

async function acceptStartedTerminal(
  id: string,
  command: TermAgentsCommand,
  handle: TermAgentsProcessHandle,
  active: ActiveLaunch,
  isCurrent: () => boolean,
  context: LaunchContext,
) {
  if (!isCurrent()) {
    await (handle.cancelLaunch?.() ?? handle.close?.() ?? handle.stop())
    return
  }
  if (active.ended) {
    if (handle.retainCloseAfterExit && handle.close) context.handles.current.set(id, handle)
    return
  }
  context.handles.current.set(id, handle)
  const latestSize = context.sizes.current.get(id)
  if (latestSize) handle.resize(latestSize.columns, latestSize.rows)
  const tmux = handle.tmux ?? command.tmux
  context.updateSession(id, {
    busy: false,
    status: "running",
    pid: handle.pid,
    backend: handle.backend ?? "native",
    ...(tmux ? { tmux } : {}),
  })
  if (!command.autoMirror) {
    context.setNotice(
      command.tmux
        ? "Espelho conectado."
        : `${command.label} iniciado em ${basename(TERM_AGENTS_WORKING_DIRECTORY)}.`,
    )
  }
  if (!command.autoMirror && context.activeSession.current === id) context.focusTerminal(id)
}

function failTerminalStart(
  id: string,
  error: unknown,
  launch: TerminalLaunch,
  isCurrent: () => boolean,
  terminal: EmbeddedTerminalRenderable,
  output: AgentMonitor,
  context: LaunchContext,
) {
  if (error instanceof TerminalRetirementError) context.handles.current.set(id, error.handle)
  output.dispose()
  if (context.outputs.current.get(id) === output) context.outputs.current.delete(id)
  if (!isCurrent() || launch.signal.aborted) return
  const message = error instanceof Error ? error.message : "Não foi possível iniciar a sessão."
  terminal.write(`\u001b[38;2;255;107;107m× ${translateUi(message)}\u001b[0m\r\n`)
  context.updateSession(id, {
    status: "failed",
    pid: null,
    exitCode: 1,
    startError: message,
    ...(error instanceof RemoteCodexCompatibilityError
      ? { remoteCodexCompatibility: error.report }
      : {}),
  })
  context.setNotice(`${translateUi("Erro")}: ${translateUi(message)}`)
}

async function launchTerminal(
  id: string,
  clear: boolean,
  launch: TerminalLaunch,
  context: LaunchContext,
) {
  const command = context.commands.current.get(id)
  const terminal = context.terminals.current.get(id)
  if (!command || !terminal) return
  const integration = integratedAgentLaunch(command)
  const isCurrent = () => currentLaunch(id, terminal, launch, context)
  const stopped = await stopTerminalBeforeRestart({
    handle: context.handles.current.get(id),
    close: clear,
    write: (data) => isCurrent() && terminal.write(data),
    onError: (message) => isCurrent() && context.setNotice(message),
  })
  if (!stopped || !isCurrent()) return
  context.handles.current.delete(id)
  if (clear) terminal.write("\u001bc")
  const size = terminalSize(id, context)
  const output = beginAgentOutput(id, size, context)
  if (integration && clear) context.clearAgentMessages(id)
  const active: ActiveLaunch = { handle: null, ended: false }
  let agentState: AgentState = "idle"
  let agentActivity: AgentActivity = "thinking"
  let agentTitle = cleanAgentTaskTitle(integration?.resumeTitle ?? "")
  let hydrationRevision = 0
  let agentTransport: AgentSessionIntegration["transport"] =
    integration?.providerId === "claude" && !integration.remote
      ? "screen"
      : (integration?.transport ?? "screen")
  const provider = agentProvider(integration?.providerId ?? "codex")
  const openCodeSessions = new OpenCodeSessionProjection(id, provider, integration?.resumeThreadId)
  const updateIntegratedAgent = () => {
    if (!launch.isCurrent()) return
    context.updateSession(id, {
      agent: {
        key: `${provider.id}-${agentTransport}:${id}`,
        label: provider.label,
        profile: provider.profile,
        state: agentState,
        activity: agentState === "working" ? agentActivity : null,
        ...(agentTitle ? { taskTitle: agentTitle } : {}),
      },
      agentIntegration: { providerId: provider.id, transport: agentTransport },
    })
  }
  if (integration?.providerId === "claude" && !integration.remote) updateIntegratedAgent()
  const options = {
    cwd: integration?.remote
      ? TERM_AGENTS_WORKING_DIRECTORY
      : (command.workingDirectory ?? TERM_AGENTS_WORKING_DIRECTORY),
    ...(integration?.resumeThreadId ? { resumeThreadId: integration.resumeThreadId } : {}),
    ...(integration?.remote ? { remote: integration.remote } : {}),
    ...size,
    onData(data: Uint8Array) {
      if (!launch.isCurrent()) return
      output.write(data)
      context.terminals.current.get(id)?.write(data)
    },
    onExit: (result: TermAgentsExit) =>
      finishTerminalExit(id, command, result, launch, active, output, context),
  }
  const publishOpenCodeSessions = () => {
    if (!launch.isCurrent()) return
    const { active, messages } = openCodeSessions.snapshot()
    if (active) context.updateAgentMessages(id, messages, true)
    else context.clearAgentMessages(id)
    context.updateSession(id, {
      agent: active?.agent ?? {
        key: `${provider.id}-${agentTransport}:${id}`,
        label: provider.label,
        profile: provider.profile,
        state: "idle",
        activity: null,
      },
      agentIntegration: { providerId: provider.id, transport: agentTransport },
    })
  }
  try {
    const events = {
      onActivity(activity: AgentActivity) {
        agentActivity = activity
        agentState = "working"
        updateIntegratedAgent()
      },
      onState(state: AgentState) {
        agentState = state
        if (state === "working") agentActivity = "thinking"
        updateIntegratedAgent()
      },
      onTitle(title: string) {
        agentTitle = cleanAgentTaskTitle(title)
        updateIntegratedAgent()
      },
      onUserMessage(message: AgentMessageHistoryEntry) {
        if (!launch.isCurrent()) return
        context.updateAgentMessages(id, [message], false)
      },
      onUserMessageHistory(messages: readonly AgentMessageHistoryEntry[], replace: boolean) {
        if (!launch.isCurrent()) return
        context.updateAgentMessages(id, messages, replace)
      },
      onError(message: string) {
        if (!launch.isCurrent()) return
        context.setNotice(`${provider.label}: ${translateUi(message)}`)
      },
    }
    active.handle = integration
      ? await startIntegratedAgentTerminal(
          integration,
          options,
          {
            codex: {
              ...events,
              onHydrated(thread) {
                if (!launch.isCurrent()) return
                agentState = thread.state
                updateIntegratedAgent()
                if (integration.remote) {
                  hydrationRevision += 1
                  context.updateSession(id, {
                    remoteCodexHydration: { ...thread, revision: hydrationRevision },
                    remoteAgentHydration: { ...thread, revision: hydrationRevision },
                  })
                }
              },
            },
            claude: {
              ...events,
              onObserved() {
                if (agentTransport === "hooks") return
                agentTransport = "hooks"
                updateIntegratedAgent()
              },
              onBackground() {
                agentTransport = "background"
              },
              onHydrated(thread) {
                if (!launch.isCurrent() || !integration.remote) return
                hydrationRevision += 1
                context.updateSession(id, {
                  remoteAgentHydration: { ...thread, revision: hydrationRevision },
                })
              },
            },
            openCode: {
              ...events,
              onSessionUpdated(hydration) {
                if (!launch.isCurrent()) return
                openCodeSessions.upsert(hydration)
                publishOpenCodeSessions()
              },
              onSessionRemoved(sessionId) {
                if (!launch.isCurrent()) return
                openCodeSessions.remove(sessionId)
                publishOpenCodeSessions()
              },
              onActiveSessionChanged(sessionId) {
                if (!launch.isCurrent()) return
                openCodeSessions.activate(sessionId)
                if (openCodeSessions.has(sessionId)) publishOpenCodeSessions()
              },
              onHydrated(hydration) {
                if (!launch.isCurrent() || !integration.remote) return
                const projected = openCodeSessions.snapshot()
                if (projected.sessions.length > 0 && projected.active?.id !== hydration.session.id)
                  return
                hydrationRevision += 1
                const latest = hydration.messages.at(-1)
                context.updateSession(id, {
                  remoteAgentHydration: {
                    revision: hydrationRevision,
                    threadId: hydration.session.id,
                    state: hydration.state,
                    latestTurnStatus:
                      latest?.status === "queued" ? "inProgress" : (latest?.status ?? null),
                    waitingOnApproval: hydration.waitingOnApproval,
                  },
                })
              },
            },
          },
          launch.signal,
        )
      : await startWorkspaceTerminal(command, options, launch.signal)
    await acceptStartedTerminal(id, command, active.handle, active, isCurrent, context)
  } catch (error) {
    failTerminalStart(id, error, launch, isCurrent, terminal, output, context)
  }
}

export function useTerminalSessionLaunch(notice: string, context: Omit<LaunchContext, "notify">) {
  const notify = useTerminalNotifications(notice)
  const contextRef = useRef<LaunchContext>({ ...context, notify })
  contextRef.current = { ...context, notify }
  return useCallback(
    (id: string, clear = false) =>
      contextRef.current.launches.current.run(id, (launch) =>
        launchTerminal(id, clear, launch, contextRef.current),
      ),
    [],
  )
}
