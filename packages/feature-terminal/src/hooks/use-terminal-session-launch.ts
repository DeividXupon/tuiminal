import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { basename } from "node:path"
import { useCallback, useRef, type RefObject } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { FreeTerminalCommand, TerminalSession } from "../model/sessions"
import { AgentMonitor } from "../services/agent-monitor"
import {
  FREE_TERMINAL_WORKING_DIRECTORY,
  type FreeTerminalExit,
  type FreeTerminalProcessHandle,
} from "../services/terminal"
import { startWorkspaceTerminal } from "../services/terminal-backend"
import { type TerminalLaunch, TerminalLaunches } from "../services/terminal-launches"
import { stopTerminalBeforeRestart, TerminalRetirementError } from "../services/terminal-lifecycle"
import { notifyTerminalExit, useTerminalNotifications } from "./use-terminal-notifications"

type TerminalSize = { columns: number; rows: number }
type Notify = Parameters<typeof notifyTerminalExit>[0]

type LaunchContext = {
  dimensions: RefObject<{ width: number; height: number }>
  terminals: RefObject<Map<string, EmbeddedTerminalRenderable>>
  handles: RefObject<Map<string, FreeTerminalProcessHandle>>
  commands: RefObject<Map<string, FreeTerminalCommand>>
  sizes: RefObject<Map<string, TerminalSize>>
  launches: RefObject<TerminalLaunches>
  outputs: RefObject<Map<string, AgentMonitor>>
  activeSession: RefObject<string | null>
  updateSession: (id: string, update: Partial<TerminalSession>) => void
  closeFinishedShell: (id: string) => void
  focusTerminal: (id: string) => void
  setNotice: (message: string) => void
  notify: Notify
}

type ActiveLaunch = { handle: FreeTerminalProcessHandle | null; ended: boolean }

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
  context.updateSession(id, {
    agent: null,
    busy: false,
    status: "starting",
    pid: null,
    exitCode: null,
    startedAt: Date.now(),
  })
  return output
}

function exitMessage(command: FreeTerminalCommand, result: FreeTerminalExit) {
  const failed = result.code !== 0 && !result.stopped
  const color = failed ? "38;2;255;107;107" : "38;2;130;144;163"
  const status = translateUi(command.tmux ? "Espelho desconectado" : "sessão encerrada")
  const code = result.code === null ? "" : ` · ${translateUi("código")} ${result.code}`
  return { failed, text: `\r\n\u001b[${color}m◆ ${status}${code}\u001b[0m\r\n` }
}

function finishTerminalExit(
  id: string,
  command: FreeTerminalCommand,
  result: FreeTerminalExit,
  launch: TerminalLaunch,
  active: ActiveLaunch,
  output: AgentMonitor,
  context: LaunchContext,
) {
  active.ended = true
  if (context.handles.current.get(id) === active.handle) context.handles.current.delete(id)
  if (!launch.isCurrent()) return
  output.dispose()
  context.outputs.current.delete(id)
  if (command.kind === "shell" && !result.stopped) {
    if (!command.tmux) notifyTerminalExit(context.notify, command.label, result)
    context.closeFinishedShell(id)
    return
  }
  const message = exitMessage(command, result)
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
  command: FreeTerminalCommand,
  handle: FreeTerminalProcessHandle,
  active: ActiveLaunch,
  isCurrent: () => boolean,
  context: LaunchContext,
) {
  if (!isCurrent()) {
    await (handle.close?.() ?? handle.stop())
    return
  }
  if (active.ended) return
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
        : `${command.label} iniciado em ${basename(FREE_TERMINAL_WORKING_DIRECTORY)}.`,
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
  context.updateSession(id, { status: "failed", pid: null, exitCode: 1 })
  context.setNotice(`Erro: ${message}`)
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
  const active: ActiveLaunch = { handle: null, ended: false }
  try {
    active.handle = await startWorkspaceTerminal(
      command,
      {
        cwd: FREE_TERMINAL_WORKING_DIRECTORY,
        ...size,
        onData(data) {
          if (!launch.isCurrent()) return
          output.write(data)
          context.terminals.current.get(id)?.write(data)
        },
        onExit: (result) =>
          finishTerminalExit(id, command, result, launch, active, output, context),
      },
      launch.signal,
    )
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
