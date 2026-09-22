import { randomUUID } from "node:crypto"
import type { TmuxPaneTarget, TmuxSessionTarget, TmuxTerminalKind } from "../model/tmux"
import {
  type FreeTerminalExit,
  type FreeTerminalProcessHandle,
  startFreeTerminalProcess,
} from "./terminal"
import { TerminalRetirementError } from "./terminal-lifecycle"
import { registerTerminalResource } from "./terminal-resources"
import { runTmux } from "./tmux-command"
import { startTmuxPaneMirror } from "./tmux-mirror"
import { createOwnedTmuxWindow } from "./tmux-owned-session"

type Options = Parameters<typeof startFreeTerminalProcess>[1]

type PaneInfo = { pid: number | null; dead: boolean; code: number | null; panes: number }

export async function destroyOwnedTmuxTarget(target: TmuxSessionTarget) {
  try {
    await runTmux([
      "-S",
      target.socket,
      target.windowId ? "kill-window" : "kill-session",
      "-t",
      target.windowId ?? target.sessionId,
    ])
  } catch (error) {
    if (
      !/no server running|no such file or directory|can't find (?:session|window)/i.test(
        String(error),
      )
    )
      throw error
  }
}

async function inspectPane(target: TmuxPaneTarget, signal?: AbortSignal): Promise<PaneInfo> {
  const output = await runTmux(
    [
      "-S",
      target.socket,
      "display-message",
      "-p",
      "-t",
      target.paneId,
      "#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}\t#{window_panes}",
    ],
    signal,
  )
  const [pid, dead, code, panes] = output.trimEnd().split("\t")
  return {
    pid: Number(pid) > 0 ? Number(pid) : null,
    dead: dead === "1",
    code: code && /^\d+$/.test(code) ? Number(code) : null,
    panes: Number(panes),
  }
}

async function createLinkedClientSession(target: TmuxPaneTarget) {
  const name = `tuiminal-client-${randomUUID()}`
  let stopping: Promise<void> | undefined
  const stop = () => {
    if (stopping) return stopping
    stopping = runTmux(["-S", target.socket, "kill-session", "-t", `=${name}`])
      .then(() => undefined)
      .catch((error) => {
        if (!/no server running|no such file or directory|can't find session/i.test(String(error)))
          throw error
      })
    return stopping
  }
  try {
    await runTmux([
      "-S",
      target.socket,
      "new-session",
      "-d",
      "-t",
      target.sessionId,
      "-s",
      name,
      ";",
      "select-window",
      "-t",
      `${name}:${target.windowId}`,
    ])
    return { name, stop }
  } catch (error) {
    try {
      await stop()
    } catch (cleanup) {
      throw new TerminalRetirementError(new AggregateError([error, cleanup]), stop)
    }
    throw error
  }
}

export async function startTmuxTerminal(
  command: string[],
  options: Options,
  borrowed?: TmuxPaneTarget,
  terminalKind: TmuxTerminalKind = "custom",
): Promise<FreeTerminalProcessHandle> {
  if (borrowed && (!borrowed.ownedByTuiminal || !borrowed.windowId)) {
    const mirror = await startTmuxPaneMirror(borrowed, options)
    return {
      ...mirror,
      tmux: borrowed,
      ...(borrowed.ownedByTuiminal
        ? {
            close: async () => {
              await mirror.stop()
              await destroyOwnedTmuxTarget(borrowed)
            },
          }
        : {}),
    }
  }
  const owned = borrowed
    ? { target: borrowed, destroy: () => destroyOwnedTmuxTarget(borrowed) }
    : await createOwnedTmuxWindow(command, options, terminalKind)
  const target = owned.target
  let client: FreeTerminalProcessHandle | undefined
  let clientSession: Awaited<ReturnType<typeof createLinkedClientSession>> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let finishing = false
  let finishPromise: Promise<void> | undefined
  let release = () => {}
  const inspection = new AbortController()
  const finish = (result: FreeTerminalExit) => {
    if (finishPromise) return finishPromise
    finishing = true
    clearTimeout(timer)
    inspection.abort()
    finishPromise = (async () => {
      // tmux restores its client's alternate screen on exit. Preserve the owned
      // pane's final output before that restore so finished commands stay readable.
      const screen =
        owned && !result.stopped
          ? await runTmux([
              "-S",
              target.socket,
              "capture-pane",
              "-p",
              "-e",
              "-t",
              target.paneId,
            ]).catch(() => null)
          : null
      // Retire the local client without injecting an interrupt into the agent.
      await client?.stop()
      await clientSession?.stop()
      if (screen !== null)
        options.onData(
          new TextEncoder().encode(`\x1bc${screen.replace(/\n+$/, "").replaceAll("\n", "\r\n")}`),
        )
      release()
      options.onExit(result)
    })().catch((error) => {
      finishPromise = undefined
      throw error
    })
    return finishPromise
  }
  const poll = async () => {
    try {
      const pane = await inspectPane(target, inspection.signal)
      if (!finishing && pane.dead) {
        await finish({ code: pane.code, signal: null, stopped: false })
      }
    } catch {
      // Connection exit owns terminal failure reporting. A transient inspection
      // error must not turn a live command into a completed session.
    } finally {
      if (!finishing) timer = setTimeout(() => void poll(), 500)
    }
  }
  try {
    // The tmux client uses the alternate screen, so OpenTUI's local scrollback is empty.
    // Let tmux receive wheel events and enter its own copy mode instead.
    await runTmux(["-S", target.socket, "set-option", "-gq", "mouse", "on"])
    clientSession = await createLinkedClientSession(target)
    client = startFreeTerminalProcess(
      ["tmux", "-S", target.socket, "-f", "/dev/null", "attach-session", "-t", clientSession.name],
      {
        ...options,
        interruptOnStop: false,
        env: { ...options.env, TMUX: "", TMUX_PANE: "" },
        onExit(result) {
          if (!finishing) void finish(result).catch(() => undefined)
        },
      },
    )
    const handle: FreeTerminalProcessHandle = {
      pid: client.pid,
      backend: "tmux",
      tmux: target,
      write: (data) => {
        if (!finishing) client?.write(data)
      },
      resize: (columns, rows) => {
        if (!finishing) client?.resize(columns, rows)
      },
      async readAgentPid(signal) {
        const pane = await inspectPane(target, signal)
        // Each owned window contains a single command pane.
        return !pane.dead && pane.panes === 1 ? pane.pid : null
      },
      stop: () => finish({ code: null, signal: null, stopped: true }),
      close: async () => {
        await finish({ code: null, signal: null, stopped: true })
        await owned.destroy()
      },
    }
    release = registerTerminalResource(handle)
    void poll()
    return handle
  } catch (error) {
    const retire = async () => {
      await client?.stop()
      await clientSession?.stop()
      if (!borrowed) await owned.destroy()
    }
    try {
      await retire()
    } catch (cleanup) {
      throw new TerminalRetirementError(new AggregateError([error, cleanup]), retire)
    }
    throw error
  }
}
