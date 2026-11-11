import type { Renderable, ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { HttpKey } from "../model/keyboard-types"

export type HttpOptionsSection = "options" | "identity" | "actions"
export type HttpOptionsKeyRef = { current: ((key: HttpKey) => boolean) | null }
const SECTIONS: HttpOptionsSection[] = ["options", "identity", "actions"]
const VERTICAL: Record<string, number> = { down: 1, j: 1, up: -1, k: -1 }
const HORIZONTAL: Record<string, number> = { right: 1, l: 1, left: -1, h: -1 }

function revealTarget(target: Renderable, view: ScrollBoxRenderable, horizontal: boolean) {
  const start = horizontal
    ? target.screenX - view.viewport.screenX
    : target.screenY - view.viewport.screenY
  const end =
    start + (horizontal ? target.width - view.viewport.width : target.height - view.viewport.height)
  const offset = start < 0 ? start : Math.max(0, end)
  if (offset) view.scrollBy(horizontal ? { x: offset, y: 0 } : offset)
}

export function useHttpOptionsNavigation({
  requestId,
  focused,
  keyRef,
  optionActions,
  actions,
  onFocus,
}: {
  requestId: string
  focused: boolean
  keyRef: HttpOptionsKeyRef
  optionActions: { id: string; run: () => void; reset: () => void }[]
  actions: { id: string; run: () => void }[]
  onFocus: () => void
}) {
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const actionScroll = useRef<ScrollBoxRenderable | null>(null)
  const [selection, setSelection] = useState({
    section: "options" as HttpOptionsSection,
    mode: "block" as "block" | "item" | "input",
    option: 0,
    identity: 0,
    action: 0,
  })
  const { section, mode, option, identity, action } = selection
  const fields = [
    `http-request-proxy-${requestId}`,
    `http-request-name-${requestId}`,
    `http-custom-method-${requestId}`,
  ]
  const sectionId = useCallback(
    (target: HttpOptionsSection) => `http-request-options-${target}-${requestId}`,
    [requestId],
  )
  const selectedId =
    section === "actions"
      ? actions[Math.min(action, actions.length - 1)]?.id
      : mode === "block"
        ? `${sectionId(section)}-heading`
        : section === "identity"
          ? fields[identity + 1]
          : (optionActions[option]?.id ?? fields[0])
  const reveal = useCallback(() => {
    if (!focused || !selectedId) return
    const target = renderer.root
      .findDescendantById(sectionId(section))
      ?.findDescendantById(selectedId)
    const view = section === "actions" ? actionScroll.current : scroll.current
    if (!target || !view) return
    revealTarget(target, view, section === "actions")
  }, [focused, renderer, section, sectionId, selectedId])
  useEffect(() => {
    if (!focused) return
    const target = selection.mode === "input" ? selectedId : sectionId(selection.section)
    renderer.root.findDescendantById(target ?? "")?.focus()
    const timer = setTimeout(reveal, 0)
    return () => clearTimeout(timer)
  }, [focused, selection, renderer, sectionId, selectedId, reveal])

  const select = (target: HttpOptionsSection, index?: number, edit = false) => {
    onFocus()
    setSelection((current) => ({
      ...current,
      section: target,
      mode: edit ? "input" : index === undefined || target === "actions" ? "block" : "item",
      ...(index === undefined
        ? {}
        : {
            [target === "options" ? "option" : target === "identity" ? "identity" : "action"]:
              index,
          }),
    }))
  }
  const activate = () => {
    if (section === "actions") actions[Math.min(action, actions.length - 1)]?.run()
    else if (mode === "block") setSelection({ ...selection, mode: "item" })
    else if (section === "options" && option < optionActions.length) optionActions[option]?.run()
    else setSelection({ ...selection, mode: "input" })
  }
  const inputKey = (key: HttpKey, input: number) => {
    if (["escape", "return", "enter"].includes(key.name)) {
      select(input === 0 ? "options" : "identity", input === 0 ? optionActions.length : input - 1)
      return true
    }
    if (key.name !== "tab") return false
    const next = (input + (key.shift ? 2 : 1)) % fields.length
    select(next === 0 ? "options" : "identity", next === 0 ? optionActions.length : next - 1, true)
    return true
  }
  const navigate = (vertical: number, horizontal: number) => {
    if (vertical && mode === "block") {
      select(SECTIONS[Math.max(0, Math.min(2, SECTIONS.indexOf(section) + vertical))] ?? "options")
    } else if (vertical && section === "options") {
      setSelection({
        ...selection,
        option: Math.max(0, Math.min(optionActions.length, option + vertical)),
      })
    } else if (horizontal && section === "identity" && mode === "item") {
      setSelection({ ...selection, identity: Math.max(0, Math.min(1, identity + horizontal)) })
    } else if (horizontal && section === "actions") {
      setSelection({
        ...selection,
        action: Math.max(0, Math.min(actions.length - 1, action + horizontal)),
      })
    } else return mode !== "block" && Boolean(vertical || horizontal)
    return true
  }
  const resetSelection = () => {
    if (section !== "options" || mode !== "item") return false
    const row = optionActions[option]
    row?.reset()
    return Boolean(row)
  }
  const handleKey = (key: HttpKey) => {
    if (!focused || key.ctrl || key.meta || key.option) return false
    const input = fields.indexOf(renderer.currentFocusedRenderable?.id ?? "")
    if (input >= 0) return inputKey(key, input)
    if (key.shift) return false
    if (key.name === "r") return resetSelection()
    if (["enter", "return"].includes(key.name)) {
      activate()
      return true
    }
    if (key.name === "escape" && mode !== "block") {
      setSelection({ ...selection, mode: "block" })
      return true
    }
    return navigate(VERTICAL[key.name] ?? 0, HORIZONTAL[key.name] ?? 0)
  }
  keyRef.current = handleKey
  return { ...selection, focused, scroll, actionScroll, reveal, sectionId, select, handleKey }
}

export type HttpOptionsNavigation = ReturnType<typeof useHttpOptionsNavigation>
