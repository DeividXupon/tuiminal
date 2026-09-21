import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as terminal from "../packages/feature-terminal/src/services/terminal"
import * as tmux from "../packages/feature-terminal/src/services/tmux-terminal"
import * as capability from "../packages/feature-terminal/src/services/tmux-command"
import { startWorkspaceTerminal } from "../packages/feature-terminal/src/services/terminal-backend"
import { parseTmuxPanes, supportsTmux } from "../packages/feature-terminal/src/model/tmux"

const preference = process.env.TUIMINAL_TERMINAL_BACKEND
const command = terminal.createFreeTerminalCommand("echo first && echo second")
const options = { onData: () => {}, onExit: () => {} }
const restores: Array<() => void> = []
afterEach(() => {
  for (const restore of restores.splice(0)) restore()
  if (preference === undefined) delete process.env.TUIMINAL_TERMINAL_BACKEND
  else process.env.TUIMINAL_TERMINAL_BACKEND = preference
})

function fixture(available: boolean) {
  const handle = {
    pid: 123,
    write: mock(() => {}),
    resize: mock(() => {}),
    stop: mock(async () => {}),
  }
  const native = spyOn(terminal, "startFreeTerminalProcess").mockReturnValue(handle)
  const multiplexed = spyOn(tmux, "startTmuxTerminal").mockResolvedValue({
    ...handle,
    backend: "tmux",
  })
  const detection = spyOn(capability, "hasTmux").mockResolvedValue(available)
  restores.push(
    () => native.mockRestore(),
    () => multiplexed.mockRestore(),
    () => detection.mockRestore(),
  )
  return { handle, native, multiplexed, detection }
}

test("auto mode runs the original shell once when tmux is unavailable", async () => {
  process.env.TUIMINAL_TERMINAL_BACKEND = "auto"
  const { native, multiplexed } = fixture(false)
  await startWorkspaceTerminal(command, options, new AbortController().signal)
  expect(native).toHaveBeenCalledTimes(1)
  expect(native.mock.calls[0]?.[0]).toEqual(command.command)
  expect(multiplexed).not.toHaveBeenCalled()
})

test("native mode works without probing or starting tmux", async () => {
  process.env.TUIMINAL_TERMINAL_BACKEND = "native"
  const { native, detection, multiplexed } = fixture(true)
  await startWorkspaceTerminal(command, options, new AbortController().signal)
  expect(native).toHaveBeenCalledTimes(1)
  expect(detection).not.toHaveBeenCalled()
  expect(multiplexed).not.toHaveBeenCalled()
})

test("available tmux receives the original command without a second native launch", async () => {
  process.env.TUIMINAL_TERMINAL_BACKEND = "auto"
  const { native, multiplexed } = fixture(true)
  const result = await startWorkspaceTerminal(command, options, new AbortController().signal)
  expect(result.backend).toBe("tmux")
  expect(multiplexed.mock.calls[0]?.[0]).toEqual(command.command)
  expect(native).not.toHaveBeenCalled()
})

test("a failed tmux launch never replays a potentially executed command natively", async () => {
  process.env.TUIMINAL_TERMINAL_BACKEND = "auto"
  const { native, multiplexed } = fixture(true)
  multiplexed.mockRejectedValue(new Error("connection lost after create"))
  await expect(
    startWorkspaceTerminal(command, options, new AbortController().signal),
  ).rejects.toThrow("connection lost")
  expect(native).not.toHaveBeenCalled()
})

test("closing while tmux is starting retires the late handle", async () => {
  process.env.TUIMINAL_TERMINAL_BACKEND = "auto"
  const { handle, multiplexed, native } = fixture(true)
  const pending = Promise.withResolvers<terminal.FreeTerminalProcessHandle>()
  multiplexed.mockReturnValue(pending.promise)
  const controller = new AbortController()
  const starting = startWorkspaceTerminal(command, options, controller.signal)
  // Let availability resolve before cancelling the detached launch.
  await Promise.resolve()
  controller.abort()
  pending.resolve(handle)
  await expect(starting).rejects.toThrow()
  expect(handle.stop).toHaveBeenCalledTimes(1)
  expect(native).not.toHaveBeenCalled()
})

test("explicit tmux mode reports absence without running the command", async () => {
  process.env.TUIMINAL_TERMINAL_BACKEND = "tmux"
  const { native } = fixture(false)
  await expect(
    startWorkspaceTerminal(command, options, new AbortController().signal),
  ).rejects.toThrow("tmux 3.2")
  expect(native).not.toHaveBeenCalled()
})

test("tmux discovery keeps immutable server/pane identities and Unicode names", () => {
  const sessions = parseTmuxPanes(
    "/tmp/demo.sock\t$2\tAPI 日本語\t@3\t0\tagent\t%4\t0\tnode\t456\t/tmp/my project\ninvalid\n",
  )
  expect(sessions).toEqual([
    {
      socket: "/tmp/demo.sock",
      sessionId: "$2",
      name: "API 日本語",
      panePid: 456,
      windowId: "@3",
      windowIndex: 0,
      windowName: "agent",
      paneId: "%4",
      paneIndex: 0,
      command: "node",
      cwd: "/tmp/my project",
    },
  ])
  expect(parseTmuxPanes("/tmp/demo.sock\tname:*\tunsafe\t456\t1\t/tmp")).toEqual([])
  expect(
    parseTmuxPanes(
      "/tmp/demo.sock\t$2\ttuiminal\t@3\t0\tzsh\t%4\t0\tzsh\t456\t\t'zsh'\tShell\tterminal-stable-id\t/tmp/my project\n",
    )[0]?.persistentId,
  ).toBe("terminal-stable-id")
  expect(supportsTmux("tmux 3.2a")).toBe(true)
  expect(supportsTmux("tmux 3.1c")).toBe(false)
  expect(supportsTmux("unexpected output")).toBe(false)
})
