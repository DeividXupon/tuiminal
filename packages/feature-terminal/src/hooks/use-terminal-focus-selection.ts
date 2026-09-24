import type { BoxRenderable, KeyEvent, Renderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import {
  nextTerminalFocusTarget,
  parseTerminalFocusTargetKey,
  TERMINAL_SIDEBAR_FOCUS_TARGET,
  type TerminalFocusDirection,
  type TerminalFocusTargetKey,
  terminalFocusTargetKey,
  terminalFocusTargetRenderableId,
} from "../model/focus-selection"

function focusTargetFromRenderable(renderable: Renderable | null) {
  for (let current = renderable; current; current = current.parent) {
    if (current.id === "terminal-sidebar") return TERMINAL_SIDEBAR_FOCUS_TARGET
    for (const kind of ["terminal", "history", "live-diff"] as const) {
      const prefix = `terminal-focus-target-${kind}-`
      if (current.id?.startsWith(prefix))
        return terminalFocusTargetKey(kind, current.id.slice(prefix.length))
    }
  }
  return null
}

function focusSelectionDirection(name: string): TerminalFocusDirection | null {
  if (name === "h" || name === "left") return "left"
  if (name === "j" || name === "down") return "down"
  if (name === "k" || name === "up") return "up"
  if (name === "l" || name === "right") return "right"
  return null
}

type FocusSelectionKeyAction =
  | { type: "move"; direction: TerminalFocusDirection }
  | { type: "focus" }
  | { type: "cancel" }
  | { type: "ignore" }

function focusSelectionKeyAction(key: KeyEvent): FocusSelectionKeyAction {
  const direction =
    key.ctrl || key.meta || key.option || key.shift || key.super
      ? null
      : focusSelectionDirection(key.name.toLowerCase())
  if (direction) return { type: "move", direction }
  if (key.name === "enter" || key.name === "return") return { type: "focus" }
  if (key.name === "escape") return { type: "cancel" }
  return { type: "ignore" }
}

function focusTargetRects(
  targets: readonly TerminalFocusTargetKey[],
  findRenderable: (id: string) => Renderable | null | undefined,
) {
  return targets.flatMap((target) => {
    const renderable = findRenderable(terminalFocusTargetRenderableId(target))
    return renderable
      ? [
          {
            key: target,
            left: renderable.screenX,
            top: renderable.screenY,
            width: renderable.width,
            height: renderable.height,
          },
        ]
      : []
  })
}

export function useTerminalFocusSelection({
  active,
  activeSessionId,
  targets,
  workspaceRef,
  focusTerminal,
  onActivateRef,
}: {
  active: boolean
  activeSessionId: string | null
  targets: readonly TerminalFocusTargetKey[]
  workspaceRef: RefObject<BoxRenderable | null>
  focusTerminal: (id: string | null) => void
  onActivateRef: RefObject<(target: TerminalFocusTargetKey) => void>
}) {
  const renderer = useRenderer()
  const originRef = useRef<TerminalFocusTargetKey | null>(null)
  const pendingRef = useRef<TerminalFocusTargetKey | null>(null)
  const busyRef = useRef(false)
  const [selectedTarget, setSelectedTarget] = useState<TerminalFocusTargetKey | null>(null)
  busyRef.current = Boolean(selectedTarget || pendingRef.current)

  const rememberOrigin = useCallback(() => {
    originRef.current =
      focusTargetFromRenderable(renderer.currentFocusedRenderable) ??
      (activeSessionId ? terminalFocusTargetKey("terminal", activeSessionId) : null)
  }, [activeSessionId, renderer])

  const focus = useCallback(
    (target: TerminalFocusTargetKey) => {
      pendingRef.current = target
      setSelectedTarget(null)
      onActivateRef.current(target)
    },
    [onActivateRef],
  )

  const open = useCallback(
    (invokedFromLeader: boolean) => {
      if (!invokedFromLeader)
        originRef.current = activeSessionId
          ? terminalFocusTargetKey("terminal", activeSessionId)
          : null
      const fallback = activeSessionId
        ? terminalFocusTargetKey("terminal", activeSessionId)
        : targets[0]
      const target =
        (originRef.current && targets.includes(originRef.current) ? originRef.current : fallback) ??
        null
      if (!target) {
        if (activeSessionId) focusTerminal(activeSessionId)
        else queueMicrotask(() => workspaceRef.current?.focus())
        return
      }
      setSelectedTarget(target)
      queueMicrotask(() => workspaceRef.current?.focus())
    },
    [activeSessionId, focusTerminal, targets, workspaceRef],
  )

  useEffect(() => {
    if (active) return
    pendingRef.current = null
    setSelectedTarget(null)
  }, [active])

  useEffect(() => {
    if (!selectedTarget || targets.includes(selectedTarget)) return
    const fallback = activeSessionId
      ? terminalFocusTargetKey("terminal", activeSessionId)
      : targets[0]
    setSelectedTarget(fallback ?? null)
  }, [activeSessionId, selectedTarget, targets])

  useEffect(() => {
    if (selectedTarget) return
    const target = pendingRef.current
    if (!target) return
    pendingRef.current = null
    const { kind, sessionId } = parseTerminalFocusTargetKey(target)
    queueMicrotask(() => {
      if (kind === "sidebar") renderer.root.findDescendantById("terminal-sidebar")?.focus()
      else if (kind === "terminal") focusTerminal(sessionId)
      else
        renderer.root
          .findDescendantById(
            kind === "history" ? `agent-message-history-${sessionId}` : `live-diff-${sessionId}`,
          )
          ?.focus()
    })
  }, [focusTerminal, renderer, selectedTarget])

  useKeyboard((key: KeyEvent) => {
    if (!active || !selectedTarget || key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    const action = focusSelectionKeyAction(key)
    if (action.type === "move") {
      const rects = focusTargetRects(targets, (id) => renderer.root.findDescendantById(id))
      setSelectedTarget(nextTerminalFocusTarget(rects, selectedTarget, action.direction))
    } else if (action.type === "focus") {
      focus(selectedTarget)
    } else if (action.type === "cancel") {
      const origin = originRef.current
      if (origin && targets.includes(origin)) focus(origin)
      else {
        setSelectedTarget(null)
        if (activeSessionId) focusTerminal(activeSessionId)
        else queueMicrotask(() => workspaceRef.current?.focus())
      }
    }
  })

  return { busyRef, focus, open, rememberOrigin, selectedTarget }
}
