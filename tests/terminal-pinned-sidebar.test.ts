import { afterAll, afterEach, expect, spyOn, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { CliRenderEvents } from "@opentui/core"
import { FEATURE_VERSION } from "../apps/cli/src/features/environment"
import { prepareFeatureHost } from "../apps/cli/src/features/host-modules"
import { FEATURE_HOST_KEY } from "../packages/core/src/runtime/feature-host"
import {
  publishTerminalSidebar,
  requestPinnedTerminalTarget,
  resetPinnedTerminalSidebarForTests,
  setTerminalSidebarPinned,
  subscribeTerminalSidebar,
  terminalSidebarSnapshot,
  toggleTerminalSidebarPinned,
} from "../packages/feature-terminal/src/model/pinned-sidebar"
import { TMUX_SIDEBAR_MUTATION_OPTION } from "../packages/feature-terminal/src/model/tmux"
import {
  openPinnedSidebarControl,
  requestPinnedSidebarSnapshot,
  sendPinnedSidebarTarget,
} from "../packages/feature-terminal/src/services/pinned-sidebar-control"
import {
  ensurePinnedSidebarMouse,
  pinnedSidebarFocusHook,
  restorePinnedSidebarMouse,
  waitForPinnedTmuxSidebarFocus,
} from "../packages/feature-terminal/src/services/pinned-sidebar-focus"
import { routePinnedTerminalToTuiminal } from "../packages/feature-terminal/src/services/pinned-sidebar-navigation"
import { waitForPinnedSidebarTerminalReady } from "../packages/feature-terminal/src/services/pinned-sidebar-terminal"
import {
  reconcilePinnedTmuxSidebars,
  removePinnedTmuxSidebars,
} from "../packages/feature-terminal/src/services/pinned-sidebar-tmux"
import * as commands from "../packages/feature-terminal/src/services/tmux-command"

const originalTmux = process.env.TMUX
const originalPane = process.env.TMUX_PANE
const hostRegistry = globalThis as typeof globalThis & Record<string, unknown>
const previousHost = hostRegistry[FEATURE_HOST_KEY]
let command: ReturnType<typeof spyOn<typeof commands, "runTmux">> | undefined

afterEach(() => {
  command?.mockRestore()
  resetPinnedTerminalSidebarForTests()
  if (originalTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = originalTmux
  if (originalPane === undefined) delete process.env.TMUX_PANE
  else process.env.TMUX_PANE = originalPane
})

afterAll(() => {
  if (previousHost === undefined) delete hostRegistry[FEATURE_HOST_KEY]
  else hostRegistry[FEATURE_HOST_KEY] = previousHost
})

test("shared pinned sidebar state publishes toggles and immutable tmux target requests", () => {
  resetPinnedTerminalSidebarForTests()
  let changes = 0
  const unsubscribe = subscribeTerminalSidebar(() => changes++)
  setTerminalSidebarPinned(true)
  requestPinnedTerminalTarget({ socket: "/tmp/work.sock", paneId: "%8" })
  const requested = terminalSidebarSnapshot()
  expect(requested.pinned).toBe(true)
  expect(requested.requestedTarget).toEqual({ socket: "/tmp/work.sock", paneId: "%8" })
  expect(requested.requestRevision).toBe(1)
  toggleTerminalSidebarPinned()
  expect(terminalSidebarSnapshot().pinned).toBe(false)
  expect(changes).toBe(3)
  unsubscribe()
})

test("pinned navigation routes terminals through Tuiminal before opening its host pane", async () => {
  const target = { socket: "/tmp/work.sock", paneId: "%8" }
  const events: string[] = []
  expect(
    await routePinnedTerminalToTuiminal(
      target,
      async (selection) => {
        events.push(`deliver:${"paneId" in selection ? selection.paneId : "other"}`)
        return true
      },
      async () => {
        events.push("host")
      },
    ),
  ).toBe(true)
  expect(events).toEqual(["deliver:%8", "host"])

  events.length = 0
  expect(
    await routePinnedTerminalToTuiminal(
      target,
      async () => false,
      async () => {
        events.push("host")
      },
    ),
  ).toBe(false)
  expect(events).toEqual([])
})

test("publishing the same sidebar view does not notify subscribers twice", () => {
  const owner = {}
  const view = {
    sessions: [],
    folders: [],
    collapsedFolderIds: [],
    selectedFolder: "default",
    activeSessionId: null,
    width: 24,
    height: 30,
    masterKey: "Ctrl+B" as const,
    recentThreads: [],
    onSelectFolder: () => undefined,
    onToggleFolder: () => undefined,
    onActivate: () => undefined,
    onActions: () => undefined,
    onNew: () => undefined,
    onCommand: () => undefined,
  }
  let changes = 0
  const unsubscribe = subscribeTerminalSidebar(() => changes++)
  publishTerminalSidebar(owner, view)
  publishTerminalSidebar(owner, view)
  expect(changes).toBe(1)
  unsubscribe()
})

test("tmux focus notification uses a pane-scoped event channel", () => {
  const hook = pinnedSidebarFocusHook("%8")
  expect(hook).toContain("#{==:#{pane_id},%8}")
  expect(hook).toContain("wait-for -S tuiminal-sidebar-focus-8")
  expect(hook).not.toContain("kill")
  expect(pinnedSidebarFocusHook("not-a-pane")).toBeNull()
})

test("sidebar consumes tmux terminal identification before navigation becomes available", async () => {
  class CapabilitySource extends EventEmitter {
    capabilities: { terminal: { from_xtversion: boolean } } | null = null
  }
  const source = new CapabilitySource()
  let settled = false
  const ready = waitForPinnedSidebarTerminalReady(source, 1000).then(() => {
    settled = true
  })
  await Bun.sleep(0)
  expect(settled).toBe(false)
  source.capabilities = { terminal: { from_xtversion: true } }
  source.emit(CliRenderEvents.CAPABILITIES)
  await ready
  expect(settled).toBe(true)
  expect(source.listenerCount(CliRenderEvents.CAPABILITIES)).toBe(0)
})

test("pinned sidebar enables tmux mouse temporarily and preserves an existing setting", async () => {
  const options = new Map([
    ["mouse", "off"],
    ["@tuiminal_sidebar_mouse_restore", ""],
  ])
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (args.includes("show-option")) return `${options.get(args.at(-1) ?? "") ?? ""}\n`
    if (args.includes("set-option")) {
      const unset = args.includes("-gu")
      const option = args.at(unset ? -1 : -2)
      if (option) options.set(option, unset ? "" : (args.at(-1) ?? ""))
    }
    return ""
  })

  await ensurePinnedSidebarMouse("/tmp/work.sock")
  expect(options.get("mouse")).toBe("on")
  expect(options.get("@tuiminal_sidebar_mouse_restore")).toBe("off")
  await restorePinnedSidebarMouse("/tmp/work.sock")
  expect(options.get("mouse")).toBe("off")
  expect(options.get("@tuiminal_sidebar_mouse_restore")).toBe("")

  options.set("mouse", "on")
  await ensurePinnedSidebarMouse("/tmp/work.sock")
  await restorePinnedSidebarMouse("/tmp/work.sock")
  expect(options.get("mouse")).toBe("on")
  expect(options.get("@tuiminal_sidebar_mouse_restore")).toBe("")
})

test.skipIf(process.platform === "win32" || !Bun.which("tmux"))(
  "sidebar focus events do not terminate either pane",
  async () => {
    const server = `tuiminal-sidebar-focus-${randomUUID()}`
    const prefix = ["-L", server, "-f", "/dev/null"]
    const focusController = new AbortController()
    try {
      const [hostPane, rawHostPid] = (
        await commands.runTmux([
          ...prefix,
          "new-session",
          "-d",
          "-s",
          "fixture",
          "-P",
          "-F",
          "#{pane_id}\t#{pane_pid}",
          "--",
          "sleep",
          "30",
        ])
      )
        .trimEnd()
        .split("\t")
      const [sidebarPane, rawSidebarPid] = (
        await commands.runTmux([
          ...prefix,
          "split-window",
          "-d",
          "-h",
          "-t",
          hostPane!,
          "-P",
          "-F",
          "#{pane_id}\t#{pane_pid}",
          "--",
          "sleep",
          "30",
        ])
      )
        .trimEnd()
        .split("\t")
      const hostPid = Number(rawHostPid)
      const sidebarPid = Number(rawSidebarPid)
      const hook = pinnedSidebarFocusHook(sidebarPane!)
      expect(hook).not.toBeNull()
      await commands.runTmux([
        ...prefix,
        "set-hook",
        "-p",
        "-t",
        sidebarPane!,
        "after-select-pane",
        hook!,
      ])

      const socket = (
        await commands.runTmux([...prefix, "display-message", "-p", "#{socket_path}"])
      ).trim()
      const focused = waitForPinnedTmuxSidebarFocus(
        socket,
        sidebarPane!,
        focusController.signal,
      ).then(() => true)
      await commands.runTmux([...prefix, "select-pane", "-t", sidebarPane!])
      expect(await Promise.race([focused, Bun.sleep(1000).then(() => false)])).toBe(true)
      await commands.runTmux([...prefix, "select-pane", "-t", hostPane!])
      await Bun.sleep(100)

      const panes = await commands.runTmux([
        ...prefix,
        "list-panes",
        "-F",
        "#{pane_id}\t#{pane_pid}\t#{pane_dead}",
      ])
      expect(panes).toContain(`${hostPane}\t${hostPid}\t0`)
      expect(panes).toContain(`${sidebarPane}\t${sidebarPid}\t0`)
    } finally {
      focusController.abort()
      await commands.runTmux([...prefix, "kill-server"]).catch(() => undefined)
    }
  },
)

test.skipIf(process.platform === "win32" || !Bun.which("tmux"))(
  "native tmux completes sidebar mutations in every target window",
  async () => {
    const server = `tuiminal-sidebar-mutation-${randomUUID()}`
    const prefix = ["-L", server, "-f", "/dev/null"]
    try {
      const [socket, hostPane, hostWindow] = (
        await commands.runTmux([
          ...prefix,
          "new-session",
          "-d",
          "-s",
          "fixture",
          "-P",
          "-F",
          "#{socket_path}\t#{pane_id}\t#{window_id}",
          "--",
          "sleep",
          "30",
        ])
      )
        .trimEnd()
        .split("\t")
      if (!socket || !hostPane || !hostWindow)
        throw new Error("tmux did not create the host window")
      const otherWindow = (
        await commands.runTmux([
          ...prefix,
          "new-window",
          "-d",
          "-t",
          "fixture",
          "-P",
          "-F",
          "#{window_id}",
          "--",
          "sleep",
          "30",
        ])
      ).trim()
      if (!otherWindow) throw new Error("tmux did not create the secondary window")
      process.env.TMUX = `${socket},1,0`
      process.env.TMUX_PANE = hostPane
      prepareFeatureHost(
        FEATURE_VERSION,
        () => [process.execPath, "--internal-sqlite-worker"],
        () => ["sleep", "30"],
      )

      await reconcilePinnedTmuxSidebars("/tmp/tuiminal-sidebar-mutation.sock", 24)

      expect((await commands.runTmux(["-S", socket, "show-options", "-gqv", "mouse"])).trim()).toBe(
        "on",
      )

      for (const windowId of [hostWindow, otherWindow]) {
        const mutation = await commands.runTmux([
          "-S",
          socket,
          "show-options",
          "-wqv",
          "-t",
          windowId,
          TMUX_SIDEBAR_MUTATION_OPTION,
        ])
        expect(mutation.trim()).toStartWith("complete:")
      }
      await removePinnedTmuxSidebars()
      expect((await commands.runTmux(["-S", socket, "show-options", "-gqv", "mouse"])).trim()).toBe(
        "off",
      )
    } finally {
      await commands.runTmux([...prefix, "kill-server"]).catch(() => undefined)
    }
  },
)

test.skipIf(process.platform === "win32")(
  "private sidebar control returns the live replica and accepts exact session activation",
  async () => {
    const selected: unknown[] = []
    const replica = {
      sessions: [],
      folders: [{ id: "terminal", name: "Terminal" }],
      collapsedFolderIds: ["terminal"],
      selectedFolder: "terminal",
      activeSessionId: null,
      masterKey: "Ctrl+B" as const,
      recentThreads: [],
      theme: { canvas: "#000000" },
      language: "pt-BR",
    }
    const control = await openPinnedSidebarControl(
      (target) => selected.push(target),
      () => replica,
    )
    expect(control).not.toBeNull()
    try {
      expect(await requestPinnedSidebarSnapshot(control!.endpoint)).toEqual(replica)
      expect(await sendPinnedSidebarTarget(control!.endpoint, { sessionId: "shell-123-1" })).toBe(
        true,
      )
      expect(await sendPinnedSidebarTarget(control!.endpoint, { folderId: "terminal" })).toBe(true)
      expect(await sendPinnedSidebarTarget(control!.endpoint, { action: "n" })).toBe(true)
      expect(
        await sendPinnedSidebarTarget(control!.endpoint, { resumeThreadId: "thread-123" }),
      ).toBe(true)
      expect(selected).toEqual([
        { sessionId: "shell-123-1" },
        { folderId: "terminal" },
        { action: "n" },
        { resumeThreadId: "thread-123" },
      ])
    } finally {
      await control?.close()
    }
  },
)

test("tmux reconciliation creates one marked left replica per window and removes only replicas", async () => {
  process.env.TMUX = "/tmp/work.sock,100,0"
  process.env.TMUX_PANE = "%2"
  prepareFeatureHost(
    FEATURE_VERSION,
    () => [process.execPath, "--internal-sqlite-worker"],
    (args) => ["tuiminal-sidebar", ...args],
  )
  let nextPane = 20
  let ctrlBBridge = false
  let listing =
    "@1\t%1\t\t\t\t\t120\t60\n" + "@1\t%2\t\t\t\t\t120\t60\n" + "@2\t%3\t\t\t\t\t120\t120\n"
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (args.includes("list-panes")) return listing
    if (args.includes("list-keys"))
      return ctrlBBridge
        ? 'bind-key -T root C-b if-shell -F "#{@tuiminal_sidebar}" "send-keys C-b" "switch-client -T prefix"\n'
        : "bind-key -T root C-b switch-client -T prefix\n"
    if (args.includes("show-option") && args.includes("@tuiminal_sidebar_ctrl_b_bridge"))
      return ctrlBBridge ? "1\n" : ""
    if (args.includes("show-option") && args.at(-1) === "prefix") return "C-b\n"
    if (args.includes("bind-key")) ctrlBBridge = args.includes("if-shell")
    if (args.includes("@tuiminal_sidebar_ctrl_b_bridge")) ctrlBBridge = !args.includes("-gu")
    if (args.includes("split-window")) {
      const pane = nextPane++
      return `%${pane}\n`
    }
    return ""
  })
  await reconcilePinnedTmuxSidebars("/tmp/control.sock", 24)
  const splits = command.mock.calls
    .map(([args]) => args)
    .filter((args) => args.includes("split-window"))
  expect(splits).toHaveLength(2)
  expect(splits.every((args) => args.includes("-b") && args.includes("-l"))).toBe(true)
  expect(splits.every((args) => args[args.indexOf("-l") + 1] === "26")).toBe(true)
  const calls = command.mock.calls.map(([args]) => args)
  for (const split of splits) {
    const splitIndex = calls.indexOf(split)
    const windowId = split[split.indexOf("-t") + 1]!
    expect(
      calls
        .slice(0, splitIndex)
        .some(
          (args) =>
            args.includes(TMUX_SIDEBAR_MUTATION_OPTION) &&
            args.includes(windowId) &&
            args.some((value) => value.startsWith("pending:")),
        ),
    ).toBe(true)
    expect(
      calls.slice(splitIndex + 1).some((args) => {
        const ifShellIndex = args.indexOf("if-shell")
        return (
          ifShellIndex >= 0 &&
          args[ifShellIndex + 1] === "-t" &&
          args[ifShellIndex + 2] === windowId &&
          args.some(
            (value) => value.includes(TMUX_SIDEBAR_MUTATION_OPTION) && value.includes(windowId),
          )
        )
      }),
    ).toBe(true)
  }
  expect(ctrlBBridge).toBe(true)
  expect(splits.find((args) => args.includes("@1"))).toContain("app")
  expect(splits.find((args) => args.includes("@2"))).toContain("tmux")
  expect(
    command.mock.calls.map(([args]) => args).filter((args) => args.includes("@tuiminal_sidebar")),
  ).toHaveLength(2)
  const focusHooks = command.mock.calls
    .map(([args]) => args)
    .filter((args) => args.includes("set-hook") && args.includes("after-select-pane"))
  expect(focusHooks).toHaveLength(2)
  expect(
    focusHooks.every(
      (args) =>
        args.includes("-p") &&
        args.some(
          (value) =>
            value.includes("wait-for -S tuiminal-sidebar-focus-") && !value.includes("kill"),
        ),
    ),
  ).toBe(true)

  listing =
    "@1\t%1\t\t\t\t\t120\t47\n" +
    "@1\t%2\t\t\t\t\t120\t47\n" +
    "@1\t%20\t1\t/tmp/control.sock\t%2\tapp\t120\t26\n" +
    "@2\t%3\t\t\t\t\t120\t93\n" +
    "@2\t%21\t1\t/tmp/control.sock\t%2\ttmux\t120\t26\n"
  command.mockClear()
  await reconcilePinnedTmuxSidebars("/tmp/control.sock", 24)
  expect(
    command.mock.calls
      .map(([args]) => args)
      .filter((args) => args.includes("set-hook") && args.includes("after-select-pane")),
  ).toHaveLength(2)
  expect(command.mock.calls.some(([args]) => args.includes("split-window"))).toBe(false)

  command.mockClear()
  await removePinnedTmuxSidebars()
  expect(ctrlBBridge).toBe(false)
  expect(
    command.mock.calls
      .map(([args]) => args)
      .find(
        (args) =>
          args.includes("bind-key") &&
          args.includes("C-b") &&
          args.includes("switch-client") &&
          !args.includes("if-shell"),
      ),
  ).toBeDefined()
  expect(
    command.mock.calls.map(([args]) => args).filter((args) => args.includes("kill-pane")),
  ).toEqual([
    ["-S", "/tmp/work.sock", "kill-pane", "-t", "%20"],
    ["-S", "/tmp/work.sock", "kill-pane", "-t", "%21"],
  ])
})

test("tmux reconciliation removes a replica that became the window's only pane", async () => {
  process.env.TMUX = "/tmp/work.sock,100,0"
  process.env.TMUX_PANE = "%2"
  prepareFeatureHost(
    FEATURE_VERSION,
    () => [process.execPath, "--internal-sqlite-worker"],
    (args) => ["tuiminal-sidebar", ...args],
  )
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (args.includes("list-panes"))
      return "@1\t%1\t1\t/tmp/control.sock\t%2\ttmux\t24\t24\n@2\t%2\t\t\t\t\t120\t120\n"
    return ""
  })

  await reconcilePinnedTmuxSidebars("/tmp/control.sock", 24)

  expect(
    command.mock.calls.map(([args]) => args).filter((args) => args.includes("kill-pane")),
  ).toContainEqual(["-S", "/tmp/work.sock", "kill-pane", "-t", "%1"])
})
