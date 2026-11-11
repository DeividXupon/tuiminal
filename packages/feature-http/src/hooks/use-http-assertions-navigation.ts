import { RenderableEvents, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createHttpAssertionDraft } from "../model/automation"
import type { HttpKey } from "../model/keyboard-types"
import type { HttpAssertionDefinition } from "../model/types"

export type HttpAssertionsKeyRef = { current: ((key: HttpKey) => boolean) | null }

const inputId = (id: string) => `http-automation-assertion-${id}`
const DIRECTIONS: Record<string, number> = { j: 1, down: 1, k: -1, up: -1 }

export function useHttpAssertionsNavigation({
  requestId,
  assertions,
  focused,
  keyRef,
  onFocus,
  onChange,
}: {
  requestId: string
  assertions: HttpAssertionDefinition[]
  focused: boolean
  keyRef: HttpAssertionsKeyRef
  onFocus: () => void
  onChange: (assertions: HttpAssertionDefinition[]) => void
}) {
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const previousCount = useRef(assertions.length)
  const [selected, setSelected] = useState(assertions[0]?.id)
  const [editing, setEditing] = useState(false)
  const [viewportSize, setViewportSize] = useState("")
  const selectedId = assertions.find((item) => item.id === selected)?.id ?? assertions[0]?.id
  const selectionId = `http-assertions-selection-${requestId}`

  const reveal = useCallback(() => {
    const view = scroll.current
    const row = renderer.root.findDescendantById(`http-assertion-row-${selectedId}`)
    if (!focused || !view || !row) return
    const top = row.screenY - view.viewport.screenY
    const bottom = top + Math.min(row.height, view.viewport.height) - view.viewport.height
    if (top < 0) view.scrollBy(top)
    else if (bottom > 0) view.scrollBy(bottom)
  }, [focused, renderer, selectedId])

  const select = (id: string | undefined, edit = false) => {
    onFocus()
    setSelected(id)
    renderer.root.findDescendantById(edit && id ? inputId(id) : selectionId)?.focus()
    setEditing(edit && id !== undefined)
  }
  useEffect(() => {
    const input = renderer.currentFocusedRenderable
    const clickedInput =
      focused &&
      input?.id.startsWith("http-automation-assertion-") &&
      scroll.current?.findDescendantById(input.id) === input
    setEditing(Boolean(clickedInput))
    if (clickedInput) setSelected(input.id.slice("http-automation-assertion-".length))
    else if (focused) renderer.root.findDescendantById(selectionId)?.focus()
  }, [focused, renderer, selectionId])
  useEffect(() => {
    if (focused && assertions.length > previousCount.current) {
      const id = assertions.at(-1)?.id
      setSelected(id)
      if (id) renderer.root.findDescendantById(inputId(id))?.focus()
      setEditing(true)
    }
    previousCount.current = assertions.length
  }, [assertions, focused, renderer])
  useEffect(() => {
    if (!viewportSize) return
    const timer = setTimeout(reveal, 0)
    return () => clearTimeout(timer)
  }, [reveal, viewportSize])
  useEffect(() => {
    if (!editing || !selectedId) return
    const input = renderer.root.findDescendantById(inputId(selectedId))
    const blur = () => setEditing(false)
    input?.on(RenderableEvents.BLURRED, blur)
    return () => {
      input?.off(RenderableEvents.BLURRED, blur)
    }
  }, [editing, selectedId, renderer])

  const add = () => {
    onFocus()
    onChange([...assertions, createHttpAssertionDraft(requestId)])
  }
  const remove = (id: string) => {
    const index = assertions.findIndex((item) => item.id === id)
    select(id === selectedId ? (assertions[index + 1] ?? assertions[index - 1])?.id : selectedId)
    onChange(assertions.filter((item) => item.id !== id))
  }
  const leaveInput = (key: HttpKey, input: HttpAssertionDefinition) => {
    if (!["escape", "return", "enter", "tab"].includes(key.name)) return false
    const index = assertions.indexOf(input)
    const next = (index + (key.shift ? -1 : 1) + assertions.length) % assertions.length
    select(key.name === "tab" ? assertions[next]?.id : input.id)
    return true
  }
  const selectionKey = (key: HttpKey) => {
    if (key.name === "n") {
      add()
      return true
    }
    if (key.shift) return false
    if (["return", "enter"].includes(key.name)) {
      select(selectedId, true)
      return true
    }
    const direction = DIRECTIONS[key.name]
    if (!direction) return false
    const index = assertions.findIndex((item) => item.id === selectedId)
    select(assertions[Math.max(0, Math.min(assertions.length - 1, index + direction))]?.id)
    return true
  }
  const handleKey = (key: HttpKey) => {
    if (!focused || key.meta || key.option) return false
    const focusedId = renderer.currentFocusedRenderable?.id
    const input = assertions.find((item) => inputId(item.id) === focusedId)
    if (focusedId && focusedId !== selectionId && !input) return false
    if (key.ctrl) {
      if (key.name !== "d" || !selectedId) return false
      remove(selectedId)
      return true
    }
    return input ? leaveInput(key, input) : selectionKey(key)
  }
  keyRef.current = handleKey
  return {
    selectionId,
    selectedId,
    editing,
    scroll,
    setViewportSize,
    select,
    add,
    remove,
    handleKey,
  }
}
