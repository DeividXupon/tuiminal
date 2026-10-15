import { afterEach, expect, spyOn, test } from "bun:test"
import { randomUUID } from "node:crypto"
import * as commands from "../packages/feature-terminal/src/services/tmux-command"
import { fitTmuxMirror } from "../packages/feature-terminal/src/services/tmux-mirror-size"
import {
  formatTmuxLayout,
  parseTmuxLayout,
  type TmuxLayout,
} from "../packages/feature-terminal/src/model/tmux-layout"

const leases: Awaited<ReturnType<typeof fitTmuxMirror>>[] = []
let command: ReturnType<typeof spyOn<typeof commands, "runTmux">> | undefined
const target = { socket: "/tmp/size-fixture.sock", sessionId: "$0", name: "fixture", paneId: "%6" }
afterEach(async () => {
  for (const lease of leases.splice(0)) await lease.stop()
  command?.mockRestore()
  command = undefined
})

function fixture(layout = "0000,160x40,0,0,6", mode: string | null = null, borderRows = 0) {
  let tree = parseTmuxLayout(layout)
  let setting = mode
  let failRestore = false
  let viewed = false
  let sidebarPanes = new Set<string>()
  let sidebarMutation = ""
  let clientSize: [number, number] = [tree.width, tree.height]
  const original = formatTmuxLayout(tree)
  function panes(node: TmuxLayout): string[] {
    return node.pane
      ? [
          `pane\t${node.pane}\t${node.width}\t${node.height - borderRows}\t${
            node.pane === "%6" ? 1 : 0
          }\t${sidebarPanes.has(node.pane) ? 1 : 0}`,
        ]
      : node.children.flatMap(panes)
  }
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (args.includes("display-message"))
      return (
        [
          [
            "@1",
            tree.width,
            tree.height,
            formatTmuxLayout(tree),
            formatTmuxLayout(tree),
            0,
            sidebarMutation,
          ].join("\t"),
          ...(setting ? [`window-size ${setting}`] : []),
          setting ?? "largest",
          ...panes(tree),
          ...(viewed ? ["client\t@1"] : []),
        ].join("\n") + "\n"
      )
    if (failRestore && args.includes("set-option")) throw new Error("restore unavailable")
    if (args.includes("resize-window")) {
      tree =
        args.includes("-A") || args.includes("-a")
          ? { ...tree, width: clientSize[0], height: clientSize[1] }
          : {
              ...tree,
              width: Number(args[args.indexOf("-x") + 1]),
              height: Number(args[args.indexOf("-y") + 1]),
            }
      setting = "manual"
    }
    if (args.includes("select-layout"))
      tree = parseTmuxLayout(args[args.indexOf("select-layout") + 3]!)
    if (args.includes("set-option")) setting = args.includes("-wu") ? null : args.at(-1)!
    return ""
  })
  return {
    original,
    get layout() {
      return formatTmuxLayout(tree)
    },
    get size() {
      return [tree.width, tree.height]
    },
    get mode() {
      return setting
    },
    setFailure(value: boolean) {
      failRestore = value
    },
    setViewed(value: boolean) {
      viewed = value
    },
    setClientSize(width: number, height: number) {
      clientSize = [width, height]
      if (viewed && setting !== "manual") tree = { ...tree, width, height }
    },
    externalLayout(value: string, helpers: string[] = []) {
      tree = parseTmuxLayout(value)
      sidebarPanes = new Set(helpers)
    },
    setSidebarMutation(value: string) {
      sidebarMutation = value
    },
  }
}

test("source size follows the local viewport and disconnect restores dimensions and inherited sizing", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 94, 29)
  leases.push(lease)
  expect(source.size).toEqual([94, 29])
  expect(source.mode).toBe("manual")
  await lease.resize(46, 14)
  expect(source.size).toEqual([46, 14])
  await Promise.all([lease.stop(), lease.stop()])
  expect(source.layout).toBe(source.original)
  expect(source.mode).toBeNull()
  const all = command!.mock.calls.flatMap(([args]) => args)
  for (const forbidden of [
    "new-session",
    "split-window",
    "attach-session",
    "kill-pane",
    "kill-session",
    "select-pane",
    "select-window",
  ])
    expect(all).not.toContain(forbidden)
})

test("shared source windows restore only after the last mirror disconnects", async () => {
  const source = fixture("0000,321x40,0,0{160x40,0,0,6,160x40,161,0,9}", "largest")
  const first = await fitTmuxMirror(target, 94, 29)
  leases.push(first)
  const second = await fitTmuxMirror({ ...target, paneId: "%9" }, 60, 20)
  leases.push(second)
  expect(source.size).toEqual([155, 20])
  await first.stop()
  expect(source.size).toEqual([221, 20])
  expect(source.mode).toBe("manual")
  await second.stop()
  expect(source.layout).toBe(source.original)
  expect(source.mode).toBe("largest")
})

test("pane border status rows do not take space from the application's requested height", async () => {
  const source = fixture("0000,160x41,0,0,6", null, 1)
  leases.push(await fitTmuxMirror(target, 94, 29))
  expect(source.size).toEqual([94, 30])
})

test("rapid viewport changes coalesce and disconnection cannot be followed by a stale resize", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 94, 29)
  leases.push(lease)
  command!.mockClear()
  await Promise.all([lease.resize(80, 24), lease.resize(70, 20), lease.resize(60, 18)])
  expect(source.size).toEqual([60, 18])
  expect(command!.mock.calls.filter(([args]) => args.includes("resize-window"))).toHaveLength(1)
  const resizing = lease.resize(50, 16)
  await Promise.all([resizing, lease.stop()])
  await lease.resize(20, 10)
  expect(source.layout).toBe(source.original)
})

test("failed restoration remains retryable without losing the original dimensions", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 94, 29)
  leases.push(lease)
  source.setFailure(true)
  try {
    await expect(lease.stop()).rejects.toThrow("restore unavailable")
  } finally {
    source.setFailure(false)
    await lease.stop()
  }
  expect(source.layout).toBe(source.original)
  expect(source.mode).toBeNull()
})

test("newer manual layout changes are not overwritten on disconnect", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 94, 29)
  leases.push(lease)
  source.externalLayout("0000,120x35,0,0,6")
  await lease.stop()
  expect(source.size).toEqual([120, 35])
})

test("viewing the source window restores it until the client leaves again", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 94, 29)
  leases.push(lease)
  expect(source.size).toEqual([94, 29])
  expect(source.mode).toBe("manual")

  source.setClientSize(200, 50)
  source.setViewed(true)
  await lease.syncVisibility(true)
  expect(source.size).toEqual([200, 50])
  expect(source.mode).toBeNull()

  source.externalLayout("0000,180x50,0,0,6")
  await lease.syncVisibility(true)
  source.setViewed(false)
  await lease.syncVisibility(true)
  expect(source.size).toEqual([94, 29])
  expect(source.mode).toBe("manual")

  await lease.stop()
  expect(source.size).toEqual([180, 50])
  expect(source.mode).toBeNull()
})

test("a source window already visible to a client is not resized on mirror startup", async () => {
  const source = fixture()
  source.setViewed(true)
  source.setClientSize(200, 50)
  const lease = await fitTmuxMirror(target, 94, 29)
  leases.push(lease)
  expect(source.size).toEqual([200, 50])
  expect(source.mode).toBeNull()

  source.setViewed(false)
  await lease.syncVisibility(true)
  expect(source.size).toEqual([94, 29])
  expect(source.mode).toBe("manual")

  await lease.stop()
  expect(source.size).toEqual([200, 50])
  expect(source.mode).toBeNull()
})

test("a pinned sidebar added after fitting is preserved when the source becomes visible", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 80, 24)
  leases.push(lease)
  expect(source.size).toEqual([80, 24])

  source.externalLayout("0000,113x24,0,0{32x24,0,0,18,80x24,33,0,6}", ["%18"])
  await lease.syncVisibility(true)
  expect(source.size).toEqual([113, 24])
  source.setClientSize(209, 51)
  source.setViewed(true)
  await lease.syncVisibility(true)

  expect(source.size).toEqual([209, 51])
  expect(source.layout).toContain(",18")
  expect(source.layout).toContain(",6")
  expect(source.mode).toBeNull()
})

test("an in-flight pinned sidebar split does not surrender mirror sizing", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 80, 24)
  leases.push(lease)

  const revision = `${Date.now()}-123-1`
  source.setSidebarMutation(`pending:${revision}`)
  await lease.syncVisibility(true)
  source.externalLayout("0000,113x24,0,0{32x24,0,0,18,80x24,33,0,6}")
  await lease.syncVisibility(true)
  source.externalLayout(source.layout, ["%18"])
  source.setSidebarMutation(`complete:${revision}`)
  await lease.syncVisibility(true)

  source.setClientSize(209, 51)
  source.setViewed(true)
  await lease.syncVisibility(true)

  expect(source.size).toEqual([209, 51])
  expect(source.layout).toContain(",18")
  expect(source.layout).toContain(",6")
  expect(source.mode).toBeNull()
})

test("removing a pinned sidebar does not leave its source window at a manual size", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 80, 24)
  leases.push(lease)

  source.setSidebarMutation("complete:1-123-1")
  source.externalLayout("0000,113x24,0,0{32x24,0,0,18,80x24,33,0,6}", ["%18"])
  await lease.syncVisibility(true)

  const revision = `${Date.now()}-123-2`
  source.setSidebarMutation(`pending:${revision}`)
  await lease.syncVisibility(true)
  source.externalLayout("0000,113x24,0,0,6")
  await lease.syncVisibility(true)
  source.setSidebarMutation(`complete:${revision}`)
  await lease.syncVisibility(true)

  source.setClientSize(209, 51)
  source.setViewed(true)
  await lease.syncVisibility(true)

  expect(source.size).toEqual([209, 51])
  expect(source.layout).not.toContain(",18")
  expect(source.mode).toBeNull()
})

test("disconnect restores the original content size around a sidebar added while hidden", async () => {
  const source = fixture()
  const lease = await fitTmuxMirror(target, 80, 24)
  leases.push(lease)

  source.externalLayout("0000,113x24,0,0{32x24,0,0,18,80x24,33,0,6}", ["%18"])
  await lease.syncVisibility(true)
  await lease.stop()

  expect(source.size).toEqual([193, 40])
  expect(source.layout).toContain("32x40,0,0,18")
  expect(source.layout).toContain("160x40,33,0,6")
  expect(source.mode).toBeNull()
})

test("a legacy manual mirror size is released when its pinned source is already visible", async () => {
  const source = fixture("0000,80x24,0,0{17x24,0,0,18,62x24,18,0,6}", "manual")
  source.externalLayout(source.layout, ["%18"])
  source.setViewed(true)
  source.setClientSize(209, 51)

  const lease = await fitTmuxMirror(target, 80, 24)
  leases.push(lease)

  expect(source.size).toEqual([209, 51])
  expect(source.layout).toContain(",18")
  expect(source.mode).toBeNull()
})

test("an initially visible manual window without a pinned helper remains user-owned", async () => {
  const source = fixture("0000,160x40,0,0,6", "manual")
  source.setViewed(true)
  source.setClientSize(209, 51)

  const lease = await fitTmuxMirror(target, 80, 24)
  leases.push(lease)

  expect(source.size).toEqual([160, 40])
  expect(source.mode).toBe("manual")
})

test("the window containing Tuiminal cannot enter a recursive resize loop", async () => {
  const previous = { TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE }
  process.env.TMUX = `${target.socket},123,0`
  process.env.TMUX_PANE = "%9"
  try {
    const source = fixture("0000,321x40,0,0{160x40,0,0,6,160x40,161,0,9}")
    const lease = await fitTmuxMirror(target, 94, 29)
    leases.push(lease)
    expect(source.layout).toBe(source.original)
    expect(command!.mock.calls.flatMap(([args]) => args)).not.toContain("resize-window")
    await lease.stop()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test.skipIf(process.platform === "win32" || !Bun.which("tmux"))(
  "native tmux accepts the fitted layout and restores its original size and option inheritance",
  async () => {
    const server = `tuiminal-size-test-${randomUUID()}`
    const prefix = ["-L", server, "-f", "/dev/null"]
    try {
      const result = await commands.runTmux([
        ...prefix,
        "new-session",
        "-d",
        "-s",
        "fixture",
        "-x",
        "160",
        "-y",
        "40",
        "-P",
        "-F",
        "#{socket_path}\t#{session_id}\t#{pane_id}",
        "cat",
      ])
      const [socket, sessionId, paneId] = result.trim().split("\t")
      const borrowed = { socket: socket!, sessionId: sessionId!, paneId: paneId!, name: "fixture" }
      const read = () =>
        commands.runTmux([
          "-S",
          borrowed.socket,
          "display-message",
          "-p",
          "-t",
          borrowed.paneId,
          "#{pane_width}x#{pane_height}\t#{window_layout}\t#{window_zoomed_flag}",
          ";",
          "show-options",
          "-wq",
          "-t",
          borrowed.paneId,
          "window-size",
        ])
      const original = await read()
      const lease = await fitTmuxMirror(borrowed, 94, 29)
      try {
        expect(await read()).toStartWith("94x29\t")
        await lease.resize(46, 14)
        expect(await read()).toStartWith("46x14\t")
      } finally {
        await lease.stop()
      }
      expect(await read()).toBe(original)
      await commands.runTmux([
        "-S",
        borrowed.socket,
        "split-window",
        "-d",
        "-h",
        "-t",
        borrowed.paneId,
        "cat",
      ])
      const split = await read()
      const splitLease = await fitTmuxMirror(borrowed, 94, 29)
      try {
        expect(await read()).toStartWith("94x29\t")
      } finally {
        await splitLease.stop()
      }
      expect(await read()).toBe(split)
      await commands.runTmux(["-S", borrowed.socket, "resize-pane", "-Z", "-t", borrowed.paneId])
      const zoomed = await read()
      const zoomLease = await fitTmuxMirror(borrowed, 94, 29)
      try {
        const fitted = await read()
        expect(fitted).toStartWith("94x29\t")
        expect(fitted.split("\n")[0]).toEndWith("\t1")
      } finally {
        await zoomLease.stop()
      }
      expect(await read()).toBe(zoomed)
    } finally {
      // This unique server belongs only to this fixture.
      await commands.runTmux([...prefix, "kill-server"]).catch(() => {})
    }
  },
)
