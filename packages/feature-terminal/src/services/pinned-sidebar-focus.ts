import { TMUX_SIDEBAR_OPTION } from "../model/tmux"
import { runTmux, waitForTmux } from "./tmux-command"

const CTRL_B_BRIDGE_OPTION = "@tuiminal_sidebar_ctrl_b_bridge"
const MOUSE_RESTORE_OPTION = "@tuiminal_sidebar_mouse_restore"
const SIDEBAR_FOCUS_HOOK = "after-select-pane"

function focusChannel(paneId: string) {
  return /^%\d+$/.test(paneId) ? `tuiminal-sidebar-focus-${paneId.slice(1)}` : null
}

export function pinnedSidebarFocusHook(paneId: string) {
  const channel = focusChannel(paneId)
  return channel ? `if-shell -F '#{==:#{pane_id},${paneId}}' 'wait-for -S ${channel}' ''` : null
}

export async function waitForPinnedTmuxSidebarFocus(
  socket: string,
  paneId: string,
  signal?: AbortSignal,
) {
  const channel = focusChannel(paneId)
  if (!socket.startsWith("/") || !channel) throw new Error("Invalid pinned sidebar identity")
  await waitForTmux(["-S", socket, "wait-for", channel], signal)
}

export async function ensurePinnedSidebarFocusHook(
  socket: string,
  paneId: string,
  signal?: AbortSignal,
) {
  const command = pinnedSidebarFocusHook(paneId)
  if (!command) return
  await runTmux(["-S", socket, "set-hook", "-p", "-t", paneId, SIDEBAR_FOCUS_HOOK, command], signal)
}

export async function ensurePinnedSidebarMouse(socket: string, signal?: AbortSignal) {
  const restore = (
    await runTmux(["-S", socket, "show-option", "-gqv", MOUSE_RESTORE_OPTION], signal).catch(
      () => "",
    )
  ).trim()
  const mouse = (
    await runTmux(["-S", socket, "show-option", "-gqv", "mouse"], signal).catch(() => "")
  ).trim()
  if (mouse === "on") return
  if (!restore)
    await runTmux(["-S", socket, "set-option", "-gq", MOUSE_RESTORE_OPTION, "off"], signal)
  try {
    await runTmux(["-S", socket, "set-option", "-gq", "mouse", "on"], signal)
  } catch (error) {
    if (!restore)
      await runTmux(["-S", socket, "set-option", "-gu", MOUSE_RESTORE_OPTION]).catch(
        () => undefined,
      )
    throw error
  }
}

export async function restorePinnedSidebarMouse(socket: string, signal?: AbortSignal) {
  const restore = (
    await runTmux(["-S", socket, "show-option", "-gqv", MOUSE_RESTORE_OPTION], signal).catch(
      () => "",
    )
  ).trim()
  if (restore !== "off") return
  await runTmux(["-S", socket, "set-option", "-gq", "mouse", "off"], signal).catch(() => undefined)
  await runTmux(["-S", socket, "set-option", "-gu", MOUSE_RESTORE_OPTION], signal).catch(
    () => undefined,
  )
}

function isDefaultCtrlBBinding(binding: string) {
  return /^bind-key\s+(?:-T\s+root\s+)?C-b\s+switch-client\s+-T\s+prefix$/u.test(binding.trim())
}

function isPinnedCtrlBBridge(binding: string) {
  return (
    binding.includes(TMUX_SIDEBAR_OPTION) &&
    binding.includes("send-keys C-b") &&
    binding.includes("switch-client -T prefix")
  )
}

export async function ensurePinnedCtrlBBridge(socket: string, signal?: AbortSignal) {
  const installed = (
    await runTmux(["-S", socket, "show-option", "-gqv", CTRL_B_BRIDGE_OPTION], signal).catch(
      () => "",
    )
  ).trim()
  const binding = await runTmux(["-S", socket, "list-keys", "-T", "root", "C-b"], signal).catch(
    () => "",
  )
  if (installed === "1" && isPinnedCtrlBBridge(binding)) return
  if (installed === "1")
    await runTmux(["-S", socket, "set-option", "-gu", CTRL_B_BRIDGE_OPTION], signal).catch(
      () => undefined,
    )
  if (!isDefaultCtrlBBinding(binding)) return
  await runTmux(["-S", socket, "set-option", "-gq", CTRL_B_BRIDGE_OPTION, "1"], signal)
  try {
    await runTmux(
      [
        "-S",
        socket,
        "bind-key",
        "-T",
        "root",
        "C-b",
        "if-shell",
        "-F",
        `#{${TMUX_SIDEBAR_OPTION}}`,
        "send-keys C-b",
        "switch-client -T prefix",
      ],
      signal,
    )
  } catch (error) {
    await runTmux(["-S", socket, "set-option", "-gu", CTRL_B_BRIDGE_OPTION]).catch(() => undefined)
    throw error
  }
}

export async function restorePinnedCtrlBBridge(socket: string, signal?: AbortSignal) {
  const installed = (
    await runTmux(["-S", socket, "show-option", "-gqv", CTRL_B_BRIDGE_OPTION], signal).catch(
      () => "",
    )
  ).trim()
  if (installed !== "1") return
  const binding = await runTmux(["-S", socket, "list-keys", "-T", "root", "C-b"], signal).catch(
    () => "",
  )
  if (isPinnedCtrlBBridge(binding)) {
    const prefixes = await Promise.all(
      ["prefix", "prefix2"].map((option) =>
        runTmux(["-S", socket, "show-option", "-gqv", option], signal).catch(() => ""),
      ),
    )
    const restoreDefault = prefixes.some((prefix) => prefix.trim() === "C-b")
    await runTmux(
      restoreDefault
        ? ["-S", socket, "bind-key", "-T", "root", "C-b", "switch-client", "-T", "prefix"]
        : ["-S", socket, "unbind-key", "-T", "root", "C-b"],
      signal,
    ).catch(() => undefined)
  }
  await runTmux(["-S", socket, "set-option", "-gu", CTRL_B_BRIDGE_OPTION], signal).catch(
    () => undefined,
  )
}
