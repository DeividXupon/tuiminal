import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as commands from "../packages/feature-terminal/src/services/tmux-command"
import * as terminal from "../packages/feature-terminal/src/services/terminal"
import { startTmuxTerminal } from "../packages/feature-terminal/src/services/tmux-terminal"
import { sendTmuxInput } from "../packages/feature-terminal/src/services/tmux-input"
import { TmuxMirrorRefresh } from "../packages/feature-terminal/src/services/tmux-mirror-refresh"
import * as sizing from "../packages/feature-terminal/src/services/tmux-mirror-size"
import { AgentMonitor } from "../packages/feature-terminal/src/services/agent-monitor"
import {
  parseTmuxScreen,
  renderTmuxScreen,
} from "../packages/feature-terminal/src/rendering/tmux-screen"

const target = { socket: "/tmp/fixture.sock", sessionId: "$0", name: "0", paneId: "%6" }
const handles: terminal.FreeTerminalProcessHandle[] = []
let command: ReturnType<typeof spyOn<typeof commands, "runTmux">> | undefined
let native: ReturnType<typeof spyOn<typeof terminal, "startFreeTerminalProcess">> | undefined
let fit: ReturnType<typeof spyOn<typeof sizing, "fitTmuxMirror">> | undefined
beforeEach(() => {
  // Screen/input lifecycle is isolated here; source geometry and restoration
  // have real service and native tmux coverage in terminal-tmux-size.test.ts.
  fit = spyOn(sizing, "fitTmuxMirror").mockResolvedValue({
    resize: async () => {},
    syncVisibility: async () => {},
    stop: async () => {},
  })
})
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.stop()
  command?.mockRestore()
  native?.mockRestore()
  fit?.mockRestore()
})

function snapshot(content: string, dead = false, title = "") {
  return `1120\t${dead ? 1 : 0}\t${dead ? 0 : ""}\t100\t24\t2\t1\t1\t0\t0\t${title}\n${content}\n`
}

test("mirror forwards existing titles and title-only updates without repainting its screen", async () => {
  let source = snapshot("UNCHANGED_CONVERSATION", false, "OC | Fix login")
  command = spyOn(commands, "runTmux").mockImplementation(async () => source)
  const observer = new AgentMonitor(80, 24)
  const changed = Promise.withResolvers<void>()
  const frames: string[] = []
  try {
    const handle = await startTmuxTerminal(
      [],
      {
        onData(data) {
          const frame = new TextDecoder().decode(data)
          frames.push(frame)
          observer.write(data)
          if (observer.title === "OC | Add tests") changed.resolve()
        },
        onExit: () => {},
      },
      target,
    )
    handles.push(handle)
    expect(observer.title).toBe("OC | Fix login")
    source = snapshot("UNCHANGED_CONVERSATION", false, "OC | Add tests")
    await changed.promise
    expect(observer.title).toBe("OC | Add tests")
    expect(observer.screen()).toContain("UNCHANGED_CONVERSATION")
    expect(frames.at(-1)).not.toContain("UNCHANGED_CONVERSATION")
    expect(frames.at(-1)).not.toContain("\x1b[2J")
    await handle.stop()
  } finally {
    observer.dispose()
  }
})

test("mirror paints existing agent content, follows the exact pane and never attaches a blank session", async () => {
  let source = snapshot("EXISTING_AGENT_CONVERSATION")
  command = spyOn(commands, "runTmux").mockImplementation(async () => source)
  native = spyOn(terminal, "startFreeTerminalProcess")
  const frames: string[] = []
  const changed = Promise.withResolvers<void>()
  const exit = mock(() => {})
  const handle = await startTmuxTerminal(
    [],
    {
      onData(data) {
        const frame = new TextDecoder().decode(data)
        frames.push(frame)
        if (frame.includes("NEXT_AGENT_TURN")) changed.resolve()
      },
      onExit: exit,
    },
    target,
  )
  handles.push(handle)
  expect(frames.join("")).toContain("EXISTING_AGENT_CONVERSATION")
  expect(await handle.readAgentPid?.()).toBe(1120)
  source = snapshot("NEXT_AGENT_TURN")
  await changed.promise
  handle.resize(60, 12)
  await Promise.all([handle.stop(), handle.stop()])
  expect(exit).toHaveBeenCalledTimes(1)
  expect(native).not.toHaveBeenCalled()
  expect(
    command.mock.calls.every(([args]) => args.includes("capture-pane") && args.includes("%6")),
  ).toBe(true)
  const all = command.mock.calls.flatMap(([args]) => args)
  for (const forbidden of [
    "new-session",
    "attach-session",
    "select-window",
    "select-pane",
    "resize-pane",
    "split-window",
    "kill-session",
    "kill-pane",
  ])
    expect(all).not.toContain(forbidden)
})

test("missing pane fails without creating any replacement shell", async () => {
  command = spyOn(commands, "runTmux").mockRejectedValue(new Error("can't find pane: %6"))
  native = spyOn(terminal, "startFreeTerminalProcess")
  await expect(
    startTmuxTerminal([], { onData: () => {}, onExit: () => {} }, target),
  ).rejects.toThrow("can't find pane")
  expect(native).not.toHaveBeenCalled()
  expect(command.mock.calls.flatMap(([args]) => args)).not.toContain("new-session")
})

test("mirror fits its actual viewport and waits for source restoration before reporting disconnection", async () => {
  command = spyOn(commands, "runTmux").mockResolvedValue(snapshot("READY"))
  const restoring = Promise.withResolvers<void>()
  const restored = Promise.withResolvers<void>()
  const resize = mock(async (_columns: number, _rows: number) => {})
  fit!.mockResolvedValue({
    resize,
    syncVisibility: async () => {},
    stop: () => {
      restoring.resolve()
      return restored.promise
    },
  })
  const exit = mock(() => {})
  const handle = await startTmuxTerminal(
    [],
    { columns: 94, rows: 29, onData: () => {}, onExit: exit },
    target,
  )
  handles.push(handle)
  try {
    expect(fit).toHaveBeenCalledWith(target, 94, 29)
    handle.resize(46, 14)
    expect(resize).toHaveBeenCalledWith(46, 14)
    const stopping = handle.stop()
    await restoring.promise
    expect(exit).not.toHaveBeenCalled()
    restored.resolve()
    await stopping
    expect(exit).toHaveBeenCalledTimes(1)
  } finally {
    restored.resolve()
    await handle.stop()
  }
})

test("typing targets the chosen pane and queued input is discarded on close", async () => {
  const sent = Promise.withResolvers<void>()
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (args.includes("send-keys")) {
      sent.resolve()
      return ""
    }
    return snapshot("READY")
  })
  const handle = await startTmuxTerminal([], { onData: () => {}, onExit: () => {} }, target)
  handles.push(handle)
  handle.write("a;\r")
  await sent.promise
  expect(command.mock.calls.find(([args]) => args.includes("send-keys"))?.[0]).toEqual([
    "-S",
    target.socket,
    "send-keys",
    "-H",
    "-t",
    "%6",
    "61",
    "3b",
    "0d",
  ])
  handle.write("MUST_NOT_SEND")
  await handle.stop()
  expect(command.mock.calls.filter(([args]) => args.includes("send-keys"))).toHaveLength(1)
})

test("input wakes capture after delivery and unchanged captures do not write another frame", async () => {
  let source = snapshot("AGENT_CONVERSATION\nPROMPT")
  const updated = Promise.withResolvers<void>()
  const frames: string[] = []
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (args.includes("send-keys")) {
      source = snapshot("AGENT_CONVERSATION\nPROMPT a")
      return ""
    }
    return source
  })
  const request = spyOn(TmuxMirrorRefresh.prototype, "request")
  try {
    const handle = await startTmuxTerminal(
      [],
      {
        onData(data) {
          const frame = new TextDecoder().decode(data)
          frames.push(frame)
          if (frame.includes("PROMPT a")) updated.resolve()
        },
        onExit: () => {},
      },
      target,
    )
    handles.push(handle)
    handle.write("a")
    await updated.promise
    expect(request).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(2)
    expect(frames[1]).not.toContain("AGENT_CONVERSATION")
    expect(frames[1]).not.toContain("\x1b[2J")

    const idleCapture = Promise.withResolvers<void>()
    let idleCaptures = 0
    command.mockImplementation(async () => {
      // The next capture proves the preceding identical snapshot was processed.
      if (++idleCaptures === 2) idleCapture.resolve()
      return source
    })
    await idleCapture.promise
    await handle.stop()
    expect(frames).toHaveLength(2)
  } finally {
    request.mockRestore()
  }
})

test("a late capture after disconnect cannot repaint the terminal", async () => {
  const pending = Promise.withResolvers<string>()
  const started = Promise.withResolvers<void>()
  command = spyOn(commands, "runTmux")
    .mockResolvedValueOnce(snapshot("INITIAL"))
    .mockResolvedValueOnce(snapshot("INITIAL"))
    .mockImplementation(() => {
      started.resolve()
      return pending.promise
    })
  const frames: string[] = []
  const handle = await startTmuxTerminal(
    [],
    {
      onData: (data) => frames.push(new TextDecoder().decode(data)),
      onExit: () => {},
    },
    target,
  )
  handles.push(handle)
  await started.promise
  const stopping = handle.stop()
  pending.resolve(snapshot("STALE_OUTPUT"))
  await stopping
  expect(frames.join("")).not.toContain("STALE_OUTPUT")
})

test("paste uses tmux's source paste mode and cleans only its own named buffer", async () => {
  command = spyOn(commands, "runTmux").mockResolvedValue("")
  await sendTmuxInput(
    target,
    new TextEncoder().encode("\x1b[200~first\nsecond;\x1b[201~"),
    new AbortController().signal,
  )
  const calls = command.mock.calls.map(([args]) => args)
  const name = calls[0]![calls[0]!.indexOf("-b") + 1]!
  expect(name).toStartWith("tuiminal-paste-")
  expect(calls[0]!.at(-1)).toBe("first\nsecond\\;")
  expect(calls[1]).toEqual([
    "-S",
    target.socket,
    "paste-buffer",
    "-p",
    "-r",
    "-b",
    name,
    "-t",
    "%6",
  ])
  // tmux 3.2 otherwise deletes the user's top buffer if our name disappeared.
  expect(calls[2]).toEqual([
    "-S",
    target.socket,
    "set-buffer",
    "-b",
    name,
    "--",
    " ",
    ";",
    "delete-buffer",
    "-b",
    name,
  ])
})

test("a smaller mirror crops without wrapping the agent screen and repaints after resize", () => {
  const monitor = new AgentMonitor(20, 5)
  try {
    const screen = parseTmuxScreen(snapshot("\x1b[32mFIRST_LINE_THAT_IS_TOO_WIDE\nPROMPT"))
    monitor.write(new TextEncoder().encode(renderTmuxScreen(screen, 20, 5)))
    const lines = monitor.screen().split("\n")
    expect(lines[0]).toContain("FIRST_LINE_THAT_IS_T")
    expect(lines[1]).toContain("PROMPT")
    expect(monitor.screen()).not.toContain("WIDE")
    monitor.resize(40, 10)
    monitor.write(new TextEncoder().encode(renderTmuxScreen(screen, 40, 10)))
    expect(monitor.screen()).toContain("FIRST_LINE_THAT_IS_TOO_WIDE")
  } finally {
    monitor.dispose()
  }
})
