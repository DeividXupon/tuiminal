import type { TmuxPaneTarget } from "../model/tmux"
import {
  parseTmuxScreen,
  renderTmuxScreen,
  TMUX_SCREEN_FORMAT,
  type TmuxScreen,
} from "../rendering/tmux-screen"
import type {
  FreeTerminalExit,
  FreeTerminalProcessHandle,
  startFreeTerminalProcess,
} from "./terminal"
import { registerTerminalResource } from "./terminal-resources"
import { runTmux } from "./tmux-command"
import { sendTmuxInput } from "./tmux-input"
import { TmuxMirrorRefresh } from "./tmux-mirror-refresh"
import { fitTmuxMirror } from "./tmux-mirror-size"
import { TerminalRetirementError } from "./terminal-lifecycle"

type Options = Parameters<typeof startFreeTerminalProcess>[1]

export async function startTmuxPaneMirror(
  target: TmuxPaneTarget,
  options: Options,
): Promise<FreeTerminalProcessHandle> {
  const controller = new AbortController()
  const prefix = ["-S", target.socket]
  let sizing: Awaited<ReturnType<typeof fitTmuxMirror>> | undefined
  const read = async () => {
    await sizing?.syncVisibility()
    return runTmux(
      [
        ...prefix,
        "display-message",
        "-p",
        "-t",
        target.paneId,
        TMUX_SCREEN_FORMAT,
        ";",
        "capture-pane",
        "-p",
        "-e",
        "-N",
        "-t",
        target.paneId,
      ],
      controller.signal,
    )
  }
  // Never create a replacement shell: a missing pane makes this launch fail.
  let captured = await read()
  let screen = parseTmuxScreen(captured)
  let columns = Math.max(1, options.columns ?? 80)
  let rows = Math.max(1, options.rows ?? 24)
  try {
    if (!screen.dead) {
      sizing = await fitTmuxMirror(target, columns, rows)
      captured = await read()
      screen = parseTmuxScreen(captured)
    }
  } catch (error) {
    try {
      await sizing?.stop()
    } catch (cleanup) {
      throw new TerminalRetirementError(new AggregateError([error, cleanup]), sizing!.stop)
    }
    throw error
  }
  let previous: TmuxScreen | undefined
  let closed = false
  let failures = 0
  let writing = Promise.resolve()
  let resizing = Promise.resolve()
  let stopping: Promise<void> | undefined
  let release = () => {}
  const paint = () => {
    if (closed) return
    const frame = renderTmuxScreen(screen, columns, rows, previous)
    options.onData(new TextEncoder().encode(frame))
    previous = screen
  }
  const finish = (result: FreeTerminalExit) => {
    if (stopping) return stopping
    closed = true
    controller.abort()
    stopping = Promise.allSettled([refresh.stop(), writing, resizing])
      .then(async () => {
        await sizing?.stop()
        release()
        options.onExit(result)
      })
      .catch((error) => {
        stopping = undefined
        throw error
      })
    return stopping
  }
  const refresh = new TmuxMirrorRefresh(
    async () => {
      const next = await read()
      if (closed) return false
      // Compare before parsing/cropping; idle panes need no terminal rendering.
      if (next === captured) {
        failures = 0
        return false
      }
      screen = parseTmuxScreen(next)
      paint()
      captured = next
      failures = 0
      if (screen.dead)
        void finish({ code: screen.code, signal: null, stopped: false }).catch(() => {})
      return true
    },
    () => {
      if (!closed && ++failures >= 3)
        void finish({ code: 1, signal: null, stopped: false }).catch(() => {})
    },
  )
  const handle: FreeTerminalProcessHandle = {
    pid: screen.pid,
    backend: "tmux",
    async readAgentPid(signal) {
      signal?.throwIfAborted()
      if (closed) return null
      if (failures) throw new Error("Não foi possível ler o painel tmux.")
      return screen.dead ? null : screen.pid
    },
    write(data) {
      if (closed || screen.dead) return
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data.slice()
      // Serialize input; never retry a timeout that may have delivered it already.
      writing = writing
        .then(async () => {
          if (closed) return
          await sendTmuxInput(target, bytes, controller.signal)
          refresh.request()
        })
        .catch(() => {
          // Input is never retried: a timeout may have delivered it already.
          if (!closed) void finish({ code: 1, signal: null, stopped: false }).catch(() => {})
        })
    },
    resize(width, height) {
      if (closed || width <= 0 || height <= 0) return
      const nextColumns = Math.max(1, width)
      const nextRows = Math.max(1, height)
      if (columns === nextColumns && rows === nextRows) return
      columns = nextColumns
      rows = nextRows
      previous = undefined
      paint()
      resizing = (sizing?.resize(columns, rows) ?? Promise.resolve())
        .then(() => refresh.request())
        .catch(() => {
          if (!closed) void finish({ code: 1, signal: null, stopped: false }).catch(() => {})
        })
    },
    stop: () => finish({ code: null, signal: null, stopped: true }),
  }
  release = registerTerminalResource(handle)
  try {
    paint()
  } catch (error) {
    try {
      await handle.stop()
    } catch (cleanup) {
      throw new TerminalRetirementError(new AggregateError([error, cleanup]), handle.stop)
    }
    throw error
  }
  if (screen.dead) void finish({ code: screen.code, signal: null, stopped: false }).catch(() => {})
  else refresh.start()
  return handle
}
