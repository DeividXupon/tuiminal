import type { KeyEvent } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import {
  getUiSettings,
  matchesTerminalMasterKey,
  terminalMasterKeyBytes,
} from "@xupon/tuiminal-core/settings/theme"
import type { RefObject } from "react"
import type { visibleTerminalShortcutTargets } from "../model/sessions"
import { terminalActionKey } from "../ui/TerminalActions"
import type { useTerminalSessions } from "./use-terminal-sessions"

function terminalLeaderNavigationKey(key: KeyEvent, agentTabsActive: boolean) {
  if (["up", "down", "left", "right", "tab", "enter", "return"].includes(key.name)) return true
  if (key.ctrl || key.meta || key.option || key.shift || key.super) return false
  const name = key.name.toLowerCase()
  return ["h", "j", "k", "l"].includes(name) || (agentTabsActive && ["z", "v"].includes(name))
}

type Options = Pick<
  ReturnType<typeof useTerminalSessions>,
  "processHandles" | "activeSessionRef"
> & {
  leaderRef: RefObject<boolean>
  setLeader: (open: boolean) => void
  restoreFocus: () => void
  rememberBoxFocusOrigin: () => void
  runAction: (key: string) => void
  masterKeyTargets: ReturnType<typeof visibleTerminalShortcutTargets>
  selectSession: (id: string) => void
  isBlocked: () => boolean
}

export function useTerminalWorkspaceKeyboard({
  leaderRef,
  processHandles,
  activeSessionRef,
  setLeader,
  restoreFocus,
  rememberBoxFocusOrigin,
  runAction,
  masterKeyTargets,
  selectSession,
  isBlocked,
}: Options) {
  const renderer = useRenderer()
  const handleMasterKey = (key: KeyEvent) => {
    const configuredKey = getUiSettings().terminalMasterKey
    if (!matchesTerminalMasterKey(key, configuredKey)) return false
    key.preventDefault()
    key.stopPropagation()
    if (leaderRef.current) {
      processHandles.current
        .get(activeSessionRef.current ?? "")
        ?.write(terminalMasterKeyBytes(configuredKey))
      setLeader(false)
      restoreFocus()
    } else {
      rememberBoxFocusOrigin()
      setLeader(true)
    }
    return true
  }

  const handleLeaderKey = (key: KeyEvent) => {
    if (!leaderRef.current) return false
    if (renderer.currentFocusedRenderable?.id === "terminal-action-search") return true
    if (key.name === "/" || key.sequence === "/" || key.raw === "/") {
      key.preventDefault()
      key.stopPropagation()
      renderer.root.findDescendantById("terminal-action-search")?.focus()
      return true
    }
    if (
      terminalLeaderNavigationKey(
        key,
        Boolean(renderer.root.findDescendantById("terminal-agent-panel-active")),
      )
    )
      return true
    key.preventDefault()
    key.stopPropagation()
    const action = terminalActionKey(key)
    if (action?.startsWith("alt+")) {
      runAction(action)
      return true
    }
    if (
      /^[1-9]$/.test(key.name) &&
      !key.ctrl &&
      !key.meta &&
      !key.option &&
      !key.shift &&
      !key.super
    ) {
      const target = masterKeyTargets[Number(key.name) - 1]
      if (target) selectSession(target.id)
      return true
    }
    if (action) runAction(action)
    return true
  }

  useKeyboard((key) => {
    if (isBlocked() || key.defaultPrevented) return
    if (handleMasterKey(key)) return
    handleLeaderKey(key)
  })
}
