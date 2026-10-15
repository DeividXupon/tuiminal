import { installedTerminalSidebarCommand } from "@xupon/tuiminal-core/runtime/feature-host"
import type { TerminalMasterKey } from "@xupon/tuiminal-core/settings/theme"
import {
  TMUX_SIDEBAR_MUTATION_OPTION,
  TMUX_SIDEBAR_OPTION,
  tmuxLiteralArgument,
} from "../model/tmux"
import { pinnedSidebarControlAvailable } from "./pinned-sidebar-control"
import {
  ensurePinnedCtrlBBridge,
  ensurePinnedSidebarFocusHook,
  ensurePinnedSidebarMouse,
  restorePinnedCtrlBBridge,
  restorePinnedSidebarMouse,
} from "./pinned-sidebar-focus"
import { runAttachedTmux, runTmux } from "./tmux-command"

const SIDEBAR_OPTION = TMUX_SIDEBAR_OPTION
const ENABLED_OPTION = "@tuiminal_sidebar_enabled"
const CONTROL_OPTION = "@tuiminal_sidebar_control"
const HOST_OPTION = "@tuiminal_sidebar_host"
const MODE_OPTION = "@tuiminal_sidebar_mode"
const PANE_FORMAT = `#{window_id}\t#{pane_id}\t#{${SIDEBAR_OPTION}}\t#{${CONTROL_OPTION}}\t#{${HOST_OPTION}}\t#{${MODE_OPTION}}\t#{window_width}\t#{pane_width}`

type Pane = {
  windowId: string
  paneId: string
  sidebar: boolean
  control: string
  host: string
  mode: string
  windowWidth: number | null
  paneWidth: number | null
}

type SidebarMode = "app" | "tmux"

type SidebarWindow = {
  helpers: Pane[]
  contentPanes: Set<string>
  containsHost: boolean
  hasContent: boolean
  windowWidth: number | null
}

type ReconcileContext = {
  socket: string
  endpoint: string
  appPane: string
  fallbackWidth: number
  signal: AbortSignal | undefined
}

let sidebarMutationSequence = 0

async function mutateSidebarWindow<T>(
  socket: string,
  windowId: string,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
) {
  signal?.throwIfAborted()
  const revision = `${Date.now()}-${process.pid}-${++sidebarMutationSequence}`
  const pending = `pending:${revision}`
  const complete = `complete:${revision}`
  await runTmux(
    ["-S", socket, "set-option", "-wq", "-t", windowId, TMUX_SIDEBAR_MUTATION_OPTION, pending],
    signal,
  )
  try {
    return await operation()
  } finally {
    // Do not let an older aborted reconciliation overwrite a newer marker.
    await runTmux([
      "-S",
      socket,
      "if-shell",
      "-t",
      windowId,
      "-F",
      `#{==:#{${TMUX_SIDEBAR_MUTATION_OPTION}},${pending}}`,
      `set-option -wq -t ${windowId} ${TMUX_SIDEBAR_MUTATION_OPTION} ${complete}`,
      "",
    ]).catch(() => undefined)
  }
}

function inheritedSocket() {
  const socket = process.env.TMUX?.split(",")[0]
  return socket?.startsWith("/") ? socket : null
}

function parsePanes(source: string): Pane[] {
  const parsed = source
    .trimEnd()
    .split("\n")
    .flatMap((line) => {
      const [
        windowId,
        paneId,
        sidebar,
        control = "",
        host = "",
        mode = "",
        rawWidth,
        rawPaneWidth,
      ] = line.split("\t")
      const width = Number(rawWidth)
      const paneWidth = Number(rawPaneWidth)
      if (!windowId || !paneId || !/^@\d+$/.test(windowId) || !/^%\d+$/.test(paneId)) return []
      return [
        {
          windowId,
          paneId,
          sidebar: sidebar === "1",
          control,
          host,
          mode,
          windowWidth: Number.isSafeInteger(width) && width > 0 ? width : null,
          paneWidth: Number.isSafeInteger(paneWidth) && paneWidth > 0 ? paneWidth : null,
        },
      ]
    })
  return [...new Map(parsed.map((pane) => [pane.paneId, pane])).values()]
}

async function panes(socket: string, signal?: AbortSignal) {
  return parsePanes(await runTmux(["-S", socket, "list-panes", "-a", "-F", PANE_FORMAT], signal))
}

export function hasInheritedTmux() {
  return inheritedSocket() !== null && /^%\d+$/.test(process.env.TMUX_PANE ?? "")
}

export async function pinnedTmuxSidebarsEnabled(signal?: AbortSignal) {
  const socket = inheritedSocket()
  if (!socket) return false
  return (
    (await runTmux(["-S", socket, "show-option", "-gqv", ENABLED_OPTION], signal).catch(() => ""))
      .trim()
      .toLowerCase() === "1"
  )
}

export async function removePinnedTmuxSidebars(signal?: AbortSignal) {
  const socket = inheritedSocket()
  if (!socket) return
  await runTmux(["-S", socket, "set-option", "-gq", ENABLED_OPTION, "0"], signal).catch(
    () => undefined,
  )
  await restorePinnedCtrlBBridge(socket, signal)
  await restorePinnedSidebarMouse(socket, signal)
  const current = await panes(socket, signal).catch(() => [])
  for (const pane of current.filter((candidate) => candidate.sidebar)) {
    signal?.throwIfAborted()
    await mutateSidebarWindow(socket, pane.windowId, signal, () =>
      runTmux(["-S", socket, "kill-pane", "-t", pane.paneId], signal),
    ).catch(() => undefined)
  }
}

function collectSidebarWindows(current: Pane[], appPane: string) {
  const windows = new Map<string, SidebarWindow>()
  for (const pane of current) {
    const window = windows.get(pane.windowId) ?? {
      helpers: [],
      contentPanes: new Set<string>(),
      containsHost: false,
      hasContent: false,
      windowWidth: pane.windowWidth,
    }
    if (pane.windowWidth) window.windowWidth = pane.windowWidth
    if (pane.sidebar) window.helpers.push(pane)
    else {
      window.hasContent = true
      window.contentPanes.add(pane.paneId)
    }
    if (pane.paneId === appPane) window.containsHost = true
    windows.set(pane.windowId, window)
  }
  return windows
}

function sidebarWidth(window: SidebarWindow, fallback: number) {
  return String(
    Math.max(
      16,
      Math.min(32, Math.floor(window.windowWidth ? window.windowWidth * 0.22 : fallback)),
    ),
  )
}

async function removeSidebarPanes(
  context: ReconcileContext,
  windowId: string,
  panesToRemove: Pane[],
) {
  if (!panesToRemove.length) return
  await mutateSidebarWindow(context.socket, windowId, context.signal, async () => {
    for (const pane of panesToRemove)
      await runTmux(["-S", context.socket, "kill-pane", "-t", pane.paneId], context.signal)
  }).catch(() => undefined)
}

async function resolveSidebarOwner(
  context: ReconcileContext,
  window: SidebarWindow,
  helper: Pane,
  mode: SidebarMode,
) {
  if (
    helper.control === context.endpoint &&
    helper.host === context.appPane &&
    helper.mode === mode
  )
    return "use" as const
  const otherHostIsHere = window.contentPanes.has(helper.host)
  const bothHostsAreHere = window.containsHost && otherHostIsHere
  const currentHostWins =
    !bothHostsAreHere || Number(context.appPane.slice(1)) < Number(helper.host.slice(1))
  const otherOwnerAlive = helper.control.startsWith("/")
    ? await pinnedSidebarControlAvailable(helper.control)
    : false
  return !otherOwnerAlive ||
    (window.containsHost && !otherHostIsHere) ||
    (bothHostsAreHere && currentHostWins)
    ? ("replace" as const)
    : ("defer" as const)
}

async function createSidebar(
  context: ReconcileContext,
  windowId: string,
  width: string,
  mode: SidebarMode,
) {
  const command = installedTerminalSidebarCommand([
    context.socket,
    context.appPane,
    mode,
    context.endpoint,
  ])
  if (!command) return null
  return mutateSidebarWindow(context.socket, windowId, context.signal, async () => {
    const created = await runTmux(
      [
        "-S",
        context.socket,
        "split-window",
        "-h",
        "-b",
        "-d",
        "-l",
        width,
        "-t",
        windowId,
        "-P",
        "-F",
        "#{pane_id}",
        "--",
        ...command.map(tmuxLiteralArgument),
      ],
      context.signal,
    )
    const paneId = created.trim()
    if (!/^%\d+$/.test(paneId)) return null
    try {
      const options: [string, string][] = [
        [SIDEBAR_OPTION, "1"],
        [CONTROL_OPTION, context.endpoint],
        [HOST_OPTION, context.appPane],
        [MODE_OPTION, mode],
      ]
      for (const [option, value] of options)
        await runTmux(
          ["-S", context.socket, "set-option", "-p", "-t", paneId, option, value],
          context.signal,
        )
      return paneId
    } catch {
      await runTmux(["-S", context.socket, "kill-pane", "-t", paneId]).catch(() => undefined)
      return null
    }
  }).catch(() => null)
}

async function prepareNewSidebar(context: ReconcileContext, paneId: string) {
  await runTmux(
    ["-S", context.socket, "select-pane", "-T", "Tuiminal sidebar", "-t", paneId],
    context.signal,
  ).catch(() => undefined)
  await ensurePinnedSidebarFocusHook(context.socket, paneId, context.signal).catch(() => undefined)
}

async function reconcileSidebarWindow(
  context: ReconcileContext,
  windowId: string,
  window: SidebarWindow,
) {
  context.signal?.throwIfAborted()
  const width = sidebarWidth(window, context.fallbackWidth)
  let [helper, ...duplicates] = window.helpers
  await removeSidebarPanes(context, windowId, duplicates)
  if (!window.hasContent) {
    if (helper) await removeSidebarPanes(context, windowId, [helper])
    return false
  }

  const mode: SidebarMode = window.containsHost ? "app" : "tmux"
  if (helper) {
    const ownership = await resolveSidebarOwner(context, window, helper, mode)
    if (ownership === "defer") return false
    if (ownership === "replace") {
      await removeSidebarPanes(context, windowId, [helper])
      helper = undefined
    }
  }

  if (!helper) {
    const createdPane = await createSidebar(context, windowId, width, mode)
    if (!createdPane) return false
    await prepareNewSidebar(context, createdPane)
    return window.containsHost
  }
  await ensurePinnedSidebarFocusHook(context.socket, helper.paneId, context.signal).catch(
    () => undefined,
  )
  if (helper.paneWidth !== Number(width))
    await mutateSidebarWindow(context.socket, windowId, context.signal, () =>
      runTmux(
        ["-S", context.socket, "resize-pane", "-x", width, "-t", helper.paneId],
        context.signal,
      ),
    ).catch(() => undefined)
  return window.containsHost
}

export async function reconcilePinnedTmuxSidebars(
  endpoint: string,
  width: number,
  signal?: AbortSignal,
  masterKey: TerminalMasterKey = "Ctrl+B",
) {
  const socket = inheritedSocket()
  const hostPane = process.env.TMUX_PANE
  if (!socket || !hostPane || !/^%\d+$/.test(hostPane)) return
  if (!installedTerminalSidebarCommand([socket, hostPane, "tmux", endpoint])) return
  await runTmux(["-S", socket, "set-option", "-gq", ENABLED_OPTION, "1"], signal)
  await ensurePinnedSidebarMouse(socket, signal).catch(() => undefined)
  if (masterKey === "Ctrl+B") await ensurePinnedCtrlBBridge(socket, signal).catch(() => undefined)
  else await restorePinnedCtrlBBridge(socket, signal)
  const context: ReconcileContext = {
    socket,
    endpoint,
    appPane: hostPane,
    fallbackWidth: width,
    signal,
  }
  const windows = collectSidebarWindows(await panes(socket, signal), hostPane)
  let hostReady = false
  for (const [windowId, window] of windows) {
    if (await reconcileSidebarWindow(context, windowId, window)) hostReady = true
  }
  return hostReady
}

export async function focusPinnedTmuxSidebar() {
  const socket = inheritedSocket()
  const hostPane = process.env.TMUX_PANE
  if (!socket || !/^%\d+$/.test(hostPane ?? "")) return false
  try {
    const current = await panes(socket)
    const host = current.find((pane) => pane.paneId === hostPane)
    const helper = host
      ? current.find((pane) => pane.windowId === host.windowId && pane.sidebar)
      : undefined
    if (!helper) return false
    await runAttachedTmux(["-S", socket, "select-pane", "-t", helper.paneId])
    return true
  } catch {
    return false
  }
}
