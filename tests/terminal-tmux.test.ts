import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as terminal from "../packages/feature-terminal/src/services/terminal"
import * as commands from "../packages/feature-terminal/src/services/tmux-command"
import { startTmuxTerminal } from "../packages/feature-terminal/src/services/tmux-terminal"

let commandSpy: ReturnType<typeof spyOn<typeof commands, "runTmux">> | undefined
let nativeSpy: ReturnType<typeof spyOn<typeof terminal, "startFreeTerminalProcess">> | undefined
const handles: terminal.FreeTerminalProcessHandle[] = []
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.stop().catch(() => undefined)
  commandSpy?.mockRestore()
  nativeSpy?.mockRestore()
})

function fixture() {
  const calls: string[][] = []
  let pane = "456\t0\t\t1\n"
  let sharedSession = false
  let windowSequence = 8
  let nativeOptions: Parameters<typeof terminal.startFreeTerminalProcess>[1] | undefined
  const input: Array<string | Uint8Array> = []
  const stop = mock(() => {})
  commandSpy = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    calls.push(args)
    if (args.includes("has-session")) {
      if (!sharedSession) throw new Error("no server running")
      return ""
    }
    if (args.includes("new-window"))
      return `/tmp/owned-test.sock\t$7\t@${++windowSequence}\t%${windowSequence}\n`
    if (args.includes("new-session")) {
      if (args.includes("-t")) return ""
      sharedSession = true
      return "/tmp/owned-test.sock\t$7\t@7\t%8\n"
    }
    if (args.includes("display-message")) return pane
    if (args.includes("capture-pane")) return "final command output\n"
    return ""
  })
  nativeSpy = spyOn(terminal, "startFreeTerminalProcess").mockImplementation((_args, options) => {
    nativeOptions = options
    return {
      pid: 789,
      write: (data) => input.push(data),
      resize: () => {},
      stop: async () => {
        stop()
        options.onExit({ code: 0, signal: null, stopped: true })
      },
    }
  })
  return {
    calls,
    input,
    stop,
    setPane: (value: string) => {
      pane = value
    },
    output: (data: string) => nativeOptions?.onData(new TextEncoder().encode(data)),
  }
}

test("owned terminals share the tuiminal session and close only their own window", async () => {
  const { calls, stop } = fixture()
  const shell = ["/bin/sh", "-lc", "printf a; printf b"]
  const handle = await startTmuxTerminal(shell, {
    onData: () => {},
    onExit: () => {},
    cwd: "/tmp/project",
  })
  handles.push(handle)
  const create = calls.find((args) => args.includes("new-session") && !args.includes("-t"))!
  expect(create).toContain("-d")
  expect(create.slice(create.indexOf("-s"), create.indexOf("-s") + 2)).toEqual(["-s", "tuiminal"])
  expect(create.slice(-3)).toEqual(shell)
  const persistence = calls.find(
    (args) => args.includes("set-option") && args.includes("@tuiminal_terminal_id"),
  )
  expect(persistence?.at(-1)).toStartWith("terminal-")
  expect(handle.tmux?.persistentId).toBe(persistence?.at(-1))
  expect(calls.flat()).not.toContain("split-window")
  expect(await handle.readAgentPid?.()).toBe(456)
  expect(nativeSpy?.mock.calls[0]?.[0]?.slice(0, -1)).toEqual([
    "tmux",
    "-S",
    "/tmp/owned-test.sock",
    "-f",
    "/dev/null",
    "attach-session",
    "-t",
  ])
  expect(nativeSpy?.mock.calls[0]?.[0]?.at(-1)).toStartWith("tuiminal-client-")
  await Promise.all([handle.stop(), handle.stop()])
  expect(stop).toHaveBeenCalledTimes(1)
  expect(calls.filter((args) => args.includes("kill-session"))).toHaveLength(1)
  expect(calls.filter((args) => args.includes("kill-window"))).toEqual([])
  await handle.close?.()
  expect(calls.filter((args) => args.includes("kill-window"))).toEqual([
    ["-S", "/tmp/owned-test.sock", "kill-window", "-t", "@7"],
  ])
})

test("additional owned terminals become windows of the existing tuiminal session", async () => {
  const { calls } = fixture()
  const first = await startTmuxTerminal(["/bin/sh"], { onData: () => {}, onExit: () => {} })
  const second = await startTmuxTerminal(["/bin/sh"], { onData: () => {}, onExit: () => {} })
  handles.push(first, second)

  expect(calls.filter((args) => args.includes("new-session") && !args.includes("-t"))).toHaveLength(
    1,
  )
  const next = calls.find((args) => args.includes("new-window"))!
  expect(next.slice(next.indexOf("-t"), next.indexOf("-t") + 2)).toEqual(["-t", "=tuiminal"])
})

test("a restored Tuiminal window receives an independent linked client", async () => {
  const { calls } = fixture()
  const handle = await startTmuxTerminal(
    [],
    { onData: () => {}, onExit: () => {} },
    {
      socket: "/tmp/owned-test.sock",
      sessionId: "$7",
      windowId: "@4",
      paneId: "%5",
      name: "tuiminal",
      ownedByTuiminal: true,
    },
  )
  handles.push(handle)

  expect(calls.some((args) => args.includes("new-window"))).toBe(false)
  expect(calls.filter((args) => args.includes("new-session"))).toHaveLength(1)
  await handle.close?.()
  expect(calls).toContainEqual(["-S", "/tmp/owned-test.sock", "kill-window", "-t", "@4"])
})

test("owned command exit uses the pane exit code instead of the client exit code", async () => {
  const { setPane } = fixture()
  setPane("456\t1\t7\t1\n")
  const exited = Promise.withResolvers<terminal.FreeTerminalExit>()
  const received: string[] = []
  const handle = await startTmuxTerminal(["/bin/sh", "-c", "exit 7"], {
    onData: (data) => received.push(new TextDecoder().decode(data)),
    onExit: exited.resolve,
  })
  handles.push(handle)
  expect(await exited.promise).toEqual({ code: 7, signal: null, stopped: false })
  expect(received.join("")).toContain("final command output")
})

test("uncertain creation cleans only its own generated window and never attaches", async () => {
  const { calls } = fixture()
  commandSpy!.mockImplementation(async (args) => {
    calls.push(args)
    if (args.includes("has-session")) throw new Error("no server running")
    if (args.includes("new-session")) throw new Error("timeout")
    return ""
  })
  await expect(
    startTmuxTerminal(["/bin/sh"], { onData: () => {}, onExit: () => {} }),
  ).rejects.toThrow("timeout")
  const create = calls.find((args) => args.includes("new-session"))!
  const ownName = create[create.indexOf("-n") + 1]
  expect(calls.at(-1)?.slice(-3)).toEqual(["kill-window", "-t", `=tuiminal:=${ownName}`])
  expect(nativeSpy).not.toHaveBeenCalled()
})

test("shell commands and directories ending in semicolons are literal tmux arguments", async () => {
  const { calls } = fixture()
  const handle = await startTmuxTerminal(["/bin/sh", "-lc", "printf first; printf second;"], {
    cwd: "/tmp/project;",
    onData: () => {},
    onExit: () => {},
  })
  handles.push(handle)
  const create = calls.find((args) => args.includes("new-session"))!
  expect(create.at(-1)).toBe("printf first; printf second\\;")
  expect(create[create.indexOf("-c") + 1]).toBe("/tmp/project\\;")
})
