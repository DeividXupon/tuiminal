import { randomUUID } from "node:crypto"
import {
  TUIMINAL_TMUX_SERVER,
  TUIMINAL_TMUX_SESSION,
  TMUX_TERMINAL_ID_OPTION,
  tmuxLiteralArgument,
  type TmuxPaneTarget,
} from "../model/tmux"
import { runTmux } from "./tmux-command"
import type { startFreeTerminalProcess } from "./terminal"
import { TerminalRetirementError } from "./terminal-lifecycle"

export const TUIMINAL_TMUX_SERVER_ARGS = ["-L", TUIMINAL_TMUX_SERVER, "-f", "/dev/null"]
type Options = Parameters<typeof startFreeTerminalProcess>[1]

const missingSession = (error: unknown) =>
  /no server running|no such file or directory|can't find session/i.test(String(error))

let pendingCreation = Promise.resolve()
function serializeCreation<T>(operation: () => Promise<T>) {
  const next = pendingCreation.then(operation)
  pendingCreation = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function parseCreatedTarget(output: string, windowName: string): TmuxPaneTarget {
  const [socket, sessionId, windowId, paneId] = output.trim().split("\t")
  if (
    !socket?.startsWith("/") ||
    !/^\$\d+$/.test(sessionId ?? "") ||
    !/^@\d+$/.test(windowId ?? "") ||
    !/^%\d+$/.test(paneId ?? "")
  )
    throw new Error("Não foi possível iniciar a janela tmux.")
  return {
    socket,
    sessionId: sessionId!,
    windowId: windowId!,
    paneId: paneId!,
    name: TUIMINAL_TMUX_SESSION,
    windowName,
    persistentId: windowName,
  }
}

function ownedWindowDestroy(windowName: string, target: () => TmuxPaneTarget | undefined) {
  let stopping: Promise<void> | undefined
  return () => {
    if (stopping) return stopping
    const pane = target()
    const args = pane
      ? ["-S", pane.socket, "kill-window", "-t", pane.windowId ?? ""]
      : [
          ...TUIMINAL_TMUX_SERVER_ARGS,
          "kill-window",
          "-t",
          `=${TUIMINAL_TMUX_SESSION}:=${windowName}`,
        ]
    stopping = runTmux(args)
      .then(() => undefined)
      .catch((error) => {
        if (missingSession(error) || /can't find window/i.test(String(error))) return
        stopping = undefined
        throw error
      })
    return stopping
  }
}

async function ownedSessionExists() {
  try {
    await runTmux([...TUIMINAL_TMUX_SERVER_ARGS, "has-session", "-t", `=${TUIMINAL_TMUX_SESSION}`])
    return true
  } catch (error) {
    if (!missingSession(error)) throw error
    return false
  }
}

async function createFirstOwnedWindow(createArguments: string[], options: Options) {
  try {
    return await runTmux([
      ...TUIMINAL_TMUX_SERVER_ARGS,
      "start-server",
      ";",
      "set-option",
      "-g",
      "status",
      "off",
      ";",
      "set-option",
      "-g",
      "prefix",
      "None",
      ";",
      "set-option",
      "-g",
      "prefix2",
      "None",
      ";",
      "set-option",
      "-g",
      "set-titles",
      "on",
      ";",
      "set-option",
      "-g",
      "set-titles-string",
      "#{pane_title}",
      ";",
      "set-option",
      "-gw",
      "remain-on-exit",
      "on",
      ";",
      "new-session",
      "-s",
      TUIMINAL_TMUX_SESSION,
      "-x",
      String(Math.max(20, options.columns ?? 80)),
      "-y",
      String(Math.max(5, options.rows ?? 24)),
      ...createArguments,
    ])
  } catch (error) {
    if (!/duplicate session/i.test(String(error))) throw error
    return createAdditionalOwnedWindow(createArguments)
  }
}

function createAdditionalOwnedWindow(createArguments: string[]) {
  return runTmux([
    ...TUIMINAL_TMUX_SERVER_ARGS,
    "new-window",
    "-t",
    `=${TUIMINAL_TMUX_SESSION}`,
    ...createArguments,
  ])
}

async function createOwnedWindowOutput(createArguments: string[], options: Options) {
  return (await ownedSessionExists())
    ? createAdditionalOwnedWindow(createArguments)
    : createFirstOwnedWindow(createArguments, options)
}

/** Creates one persistent window in the shared Tuiminal tmux session. */
export async function createOwnedTmuxWindow(command: string[], options: Options) {
  return serializeCreation(async () => {
    const windowName = `terminal-${randomUUID()}`
    let target: TmuxPaneTarget | undefined
    const destroy = ownedWindowDestroy(windowName, () => target)
    const createArguments = [
      "-d",
      "-P",
      "-F",
      "#{socket_path}\t#{session_id}\t#{window_id}\t#{pane_id}",
      "-n",
      windowName,
      "-c",
      tmuxLiteralArgument((options.cwd ?? process.cwd()).replaceAll("#", "##")),
      "--",
      ...command.map(tmuxLiteralArgument),
    ]
    try {
      const output = await createOwnedWindowOutput(createArguments, options)
      target = parseCreatedTarget(output, windowName)
      await runTmux([
        "-S",
        target.socket,
        "set-option",
        "-w",
        "-t",
        target.windowId!,
        TMUX_TERMINAL_ID_OPTION,
        windowName,
      ])
      await runTmux([
        "-S",
        target.socket,
        "set-option",
        "-w",
        "-t",
        target.paneId,
        "automatic-rename",
        "on",
      ])
      return { target: { ...target, ownedByTuiminal: true as const }, destroy }
    } catch (error) {
      try {
        await destroy()
      } catch (cleanup) {
        throw new TerminalRetirementError(new AggregateError([error, cleanup]), destroy)
      }
      throw error
    }
  })
}
