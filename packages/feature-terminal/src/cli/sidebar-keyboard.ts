import type { KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import {
  matchesTerminalMasterKey,
  type TerminalMasterKey,
} from "@xupon/tuiminal-core/settings/theme"
import { terminalActionKey } from "../ui/TerminalActions"

type SidebarKeyboardOptions = {
  masterKey: TerminalMasterKey
  leaderActive: boolean
  masterTargetDigits: { current: string }
  masterKeyTargets: readonly { id: string }[]
  focusSidebar: () => void
  setLeaderActive: (active: boolean) => void
  runAction: (key: string) => Promise<void>
  activate: (id: string) => Promise<void>
  onExit: () => void
}

function consumeKey(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function handleLeaderDigit(key: KeyEvent, options: SidebarKeyboardOptions) {
  if (!/^\d$/.test(key.name) || key.ctrl || key.meta || key.option || key.shift || key.super)
    return false
  const digits = `${options.masterTargetDigits.current}${key.name}`
  options.masterTargetDigits.current = digits
  if (digits.length === 2) {
    options.masterTargetDigits.current = ""
    const target = options.masterKeyTargets[Number(digits) - 1]
    if (target) {
      options.setLeaderActive(false)
      void options.activate(target.id)
    }
  }
  return true
}

function handleLeaderKey(key: KeyEvent, options: SidebarKeyboardOptions) {
  consumeKey(key)
  if (key.name === "escape") {
    options.focusSidebar()
    return
  }
  const action = terminalActionKey(key)
  if (action?.startsWith("alt+")) {
    void options.runAction(action)
    return
  }
  if (handleLeaderDigit(key, options)) return
  options.masterTargetDigits.current = ""
  if (action) void options.runAction(action)
}

export function useSidebarKeyboard(options: SidebarKeyboardOptions) {
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    if (matchesTerminalMasterKey(key, options.masterKey)) {
      consumeKey(key)
      if (options.leaderActive) options.focusSidebar()
      else {
        options.masterTargetDigits.current = ""
        options.setLeaderActive(true)
      }
      return
    }
    if (options.leaderActive) {
      handleLeaderKey(key, options)
      return
    }
    if ((key.ctrl && key.name === "c") || key.name === "q") options.onExit()
  })
}
