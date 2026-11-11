import { RenderableEvents, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createHttpExtractionDraft } from "../model/automation"
import type { HttpKey } from "../model/keyboard-types"
import type { HttpChainExtraction, HttpRequestDefinition } from "../model/types"
import { consumeHttpRequestTableKey } from "./use-http-request-tables"

export type HttpChainingKeyRef = { current: ((key: HttpKey) => boolean) | null }
type Chain = NonNullable<HttpRequestDefinition["chain"]>
const VERTICAL: Record<string, number> = { j: 1, down: 1, k: -1, up: -1 }
const HORIZONTAL: Record<string, number> = { h: -1, left: -1, l: 1, right: 1 }

export function useHttpChainingNavigation({
  requestId,
  chain,
  focused,
  keyRef,
  onChange,
  onFocus,
}: {
  requestId: string
  chain: Chain
  focused: boolean
  keyRef: HttpChainingKeyRef
  onChange: (chain: Chain) => void
  onFocus: () => void
}) {
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const [row, setRow] = useState(-1)
  const [column, setColumn] = useState(0)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewport, setViewport] = useState("")
  const previousCount = useRef(chain.extract.length)
  const latest = useRef({ chain, onChange })
  latest.current = { chain, onChange }
  const selectionId = `http-chaining-selection-${requestId}`
  const inputId = useCallback(
    (row: number, column: number) =>
      `http-automation-extraction-${column ? "path" : "name"}-${requestId}-${row}`,
    [requestId],
  )
  const select = (nextRow: number, nextColumn = column, edit = false) => {
    onFocus()
    setRow(nextRow)
    setColumn(nextColumn)
    renderer.root.findDescendantById(edit ? inputId(nextRow, nextColumn) : selectionId)?.focus()
    setEditing(edit)
  }
  useEffect(() => {
    const input = renderer.currentFocusedRenderable
    const clicked =
      focused &&
      input?.id.startsWith("http-automation-extraction-") &&
      scroll.current?.findDescendantById(input.id) === input
    if (!clicked) {
      setEditing(false)
      if (focused) renderer.root.findDescendantById(selectionId)?.focus()
    }
  }, [focused, renderer, selectionId])
  useEffect(() => {
    if (focused && chain.extract.length > previousCount.current) {
      const index = chain.extract.length - 1
      setRow(index)
      setColumn(0)
      setEditing(true)
      renderer.root.findDescendantById(inputId(index, 0))?.focus()
    }
    previousCount.current = chain.extract.length
  }, [chain.extract.length, focused, renderer, inputId])
  useEffect(() => {
    if (!editing) return
    const input = renderer.root.findDescendantById(inputId(row, column))
    const blur = () => setEditing(false)
    input?.on(RenderableEvents.BLURRED, blur)
    return () => {
      input?.off(RenderableEvents.BLURRED, blur)
    }
  }, [editing, row, column, renderer, inputId])
  useEffect(() => {
    if (!focused || !viewport) return
    const timer = setTimeout(() => {
      const view = scroll.current
      const target = renderer.root.findDescendantById(
        row < 0 ? `http-chain-dependency-${requestId}` : `http-extraction-row-${requestId}-${row}`,
      )
      if (!view || !target) return
      const top = target.screenY - view.viewport.screenY
      const bottom = top + Math.min(target.height, view.viewport.height) - view.viewport.height
      if (top < 0) view.scrollBy(top)
      else if (bottom > 0) view.scrollBy(bottom)
    }, 0)
    return () => clearTimeout(timer)
  }, [focused, viewport, row, requestId, renderer])
  const patch = (index: number, patch: Partial<HttpChainExtraction>) => {
    // Controlled input updates can emit through the previous render's callback.
    const { chain: current, onChange: change } = latest.current
    const item = current.extract[index]
    if (
      !item ||
      Object.entries(patch).every(
        ([key, value]) => item[key as keyof HttpChainExtraction] === value,
      )
    )
      return
    const next = {
      ...current,
      extract: current.extract.map((item, candidate) =>
        candidate === index ? { ...item, ...patch } : item,
      ),
    }
    latest.current.chain = next
    change(next)
  }
  const add = () => {
    onFocus()
    onChange({
      ...chain,
      extract: [
        ...chain.extract,
        createHttpExtractionDraft(
          requestId,
          chain.extract.map((item) => item.name),
        ),
      ],
    })
  }
  const remove = (index: number) => {
    select(Math.min(index, chain.extract.length - 2), 0)
    onChange({ ...chain, extract: chain.extract.filter((_, candidate) => candidate !== index) })
  }
  const cycleSource = (index: number) => {
    const item = chain.extract[index]
    if (!item) return
    const source =
      item.source === "header" ? "status" : item.source === "status" ? "jsonpath" : "header"
    patch(index, {
      source,
      jsonPath: source === "header" ? "Location" : source === "jsonpath" ? "$.value" : "",
    })
  }
  const activate = () => {
    const item = chain.extract[row]
    if (row < 0) setPickerOpen(true)
    else if (!item) return
    else if (column < 2) select(row, item.source === "status" ? 0 : column, true)
    else if (column === 2) cycleSource(row)
    else if (column === 3) patch(row, { secret: !item.secret })
    else if (column === 4) patch(row, { enabled: item.enabled === false })
    else remove(row)
  }
  const inputKey = (key: HttpKey) => {
    if (["escape", "return", "enter"].includes(key.name)) {
      select(row)
      return true
    }
    if (key.name !== "tab") return false
    const hasPath = chain.extract[row]?.source !== "status"
    if (hasPath && column === (key.shift ? 1 : 0)) select(row, key.shift ? 0 : 1, true)
    else select(Math.max(-1, Math.min(chain.extract.length - 1, row + (key.shift ? -1 : 1))), 0)
    return true
  }
  const selectionKey = (key: HttpKey) => {
    if (key.name === "n") {
      add()
      return true
    }
    if (key.shift) return false
    if (["return", "enter", "space"].includes(key.name)) {
      activate()
      return true
    }
    const vertical = VERTICAL[key.name] ?? 0
    const horizontal = HORIZONTAL[key.name] ?? 0
    if (vertical) {
      select(Math.max(-1, Math.min(chain.extract.length - 1, row + vertical)), 0)
      return true
    }
    if (horizontal) {
      select(row, Math.max(0, Math.min(5, column + horizontal)))
      return true
    }
    return false
  }
  const handleKey = (key: HttpKey) => {
    if (!focused || pickerOpen || key.meta || key.option) return false
    const id = renderer.currentFocusedRenderable?.id
    if (id && id !== selectionId && id !== inputId(row, column)) return false
    if (key.ctrl) {
      if (key.name !== "d" || row < 0) return false
      remove(row)
      return true
    }
    return editing ? inputKey(key) : selectionKey(key)
  }
  keyRef.current = handleKey
  const keyDown = (key: KeyEvent) => {
    if (!key.defaultPrevented) consumeHttpRequestTableKey(key, handleKey)
  }
  const closePicker = () => {
    setPickerOpen(false)
    select(-1, 0)
  }
  return {
    row,
    column,
    editing,
    pickerOpen,
    setPickerOpen,
    closePicker,
    selectionId,
    inputId,
    scroll,
    setViewport,
    select,
    patch,
    add,
    remove,
    cycleSource,
    keyDown,
  }
}
export type HttpChainingNavigation = ReturnType<typeof useHttpChainingNavigation>
