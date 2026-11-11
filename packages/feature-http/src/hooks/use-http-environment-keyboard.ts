import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import type { HttpEnvironmentDocument } from "../model/environment-documents"

type Cell = { row: number; field: "name" | "value" }
const paneId = "http-environment-pane"
const nameId = "http-environment-name"
export const environmentCellId = (cell: Cell) =>
  cell.row < 0 ? nameId : `http-environment-cell-${cell.row}-${cell.field}`

export function useHttpEnvironmentKeyboard({
  active,
  document,
  rowCount,
  unavailable,
  onBack,
  onDeleteRow,
}: {
  active: boolean
  document: HttpEnvironmentDocument
  rowCount: number
  unavailable: boolean
  onBack: () => void
  onDeleteRow: (index: number) => void
}) {
  const renderer = useRenderer()
  const [cell, setCell] = useState<Cell>({ row: document.fresh ? -1 : 0, field: "name" })
  const cellRef = useRef(cell)
  const [viewportSize, setViewportSize] = useState("")
  function selectCell(next: Cell) {
    cellRef.current = next
    setCell(next)
  }
  const [focusId, setFocusId] = useState(paneId)
  const selected = { ...cell, row: Math.min(cell.row, rowCount - 1) }
  const fields = [
    ...(document.key === "@globals" ? [] : ["http-environment-name"]),
    ...Array.from({ length: rowCount }, (_, row) => [
      environmentCellId({ row, field: "name" }),
      environmentCellId({ row, field: "value" }),
    ]).flat(),
  ]
  const controls = environmentControls(document, unavailable)
  function focus(id: string) {
    renderer.root.findDescendantById(id)?.focus()
    const scroll = renderer.root.findDescendantById("http-environment-table") as
      | ScrollBoxRenderable
      | undefined
    scroll?.scrollChildIntoView(id)
    const match = id.match(/^http-environment-cell-(\d+)-(name|value)$/)
    if (match) selectCell({ row: Number(match[1]), field: match[2] as Cell["field"] })
    else if (id === nameId) selectCell({ ...cellRef.current, row: -1 })
    setFocusId(id)
  }
  const entryFocus = useRef(() => {})
  entryFocus.current = () => {
    const previous = renderer.currentFocusedRenderable
    let node = previous
    while (node && node.id !== paneId) node = node.parent
    if (node && previous) setFocusId(previous.id)
    else focus(paneId)
  }
  useEffect(() => {
    if (!active) return
    if (document.loading) {
      renderer.root.findDescendantById(paneId)?.focus()
      setFocusId(paneId)
      return
    }
    const timer = setTimeout(() => entryFocus.current(), 0)
    return () => clearTimeout(timer)
  }, [active, document.loading, renderer])
  useEffect(() => {
    if (!active || !viewportSize) return
    const timer = setTimeout(() => {
      const scroll = renderer.root.findDescendantById("http-environment-table") as
        | ScrollBoxRenderable
        | undefined
      scroll?.scrollChildIntoView(environmentCellId(cellRef.current))
    }, 0)
    return () => clearTimeout(timer)
  }, [active, viewportSize, renderer])
  function browse(next: Cell) {
    selectCell(next)
    focus(paneId)
    const scroll = renderer.root.findDescendantById("http-environment-table") as
      | ScrollBoxRenderable
      | undefined
    scroll?.scrollChildIntoView(environmentCellId(next))
  }
  function cycle(focused: string, shift: boolean) {
    if (fields.includes(focused)) {
      const next = fields.indexOf(focused) + (shift ? -1 : 1)
      focus(fields[next] ?? paneId)
    } else {
      const index = controls.indexOf(focused)
      const next = controls[(index + (shift ? -1 : 1) + controls.length) % controls.length]
      if (next === nameId) browse({ ...cellRef.current, row: -1 })
      else focus(next ?? paneId)
    }
  }
  function back() {
    renderer.currentFocusedRenderable?.blur()
    onBack()
  }
  function moveFromName(name: string) {
    if (["down", "j", "home", "end"].includes(name))
      browse({ ...cellRef.current, row: name === "end" ? rowCount - 1 : 0 })
  }
  function move(name: string) {
    const selected = { ...cellRef.current, row: Math.min(cellRef.current.row, rowCount - 1) }
    if (["left", "h"].includes(name) && (selected.row < 0 || selected.field === "name")) {
      back()
      return
    }
    if (selected.row < 0) {
      moveFromName(name)
      return
    }
    if (["up", "k"].includes(name) && selected.row === 0 && document.key !== "@globals") {
      browse({ ...selected, row: -1 })
      return
    }
    moveCell(name, selected)
  }
  function moveCell(name: string, selected: Cell) {
    const row = Math.max(
      0,
      Math.min(rowCount - 1, selected.row + (name === "up" || name === "k" ? -1 : 1)),
    )
    if (["up", "down", "j", "k"].includes(name)) browse({ ...selected, row })
    else if (name === "home" || name === "end")
      browse({ ...selected, row: name === "home" ? 0 : rowCount - 1 })
    else browse({ ...selected, field: name === "left" || name === "h" ? "name" : "value" })
  }
  function gridKey(name: string) {
    if (unavailable) return false
    const selected = { ...cellRef.current, row: Math.min(cellRef.current.row, rowCount - 1) }
    if (["up", "down", "left", "right", "j", "k", "h", "l", "home", "end"].includes(name))
      move(name)
    else if (name === "enter" || name === "return") focus(environmentCellId(selected))
    else if (name === "n") browse({ row: rowCount - 1, field: "name" })
    else if (name === "delete" && selected.row >= 0 && selected.row < document.rows.length)
      onDeleteRow(selected.row)
    else return false
    return true
  }
  useKeyboard((key) => {
    if (!active || key.defaultPrevented || key.ctrl || key.meta || key.option) return
    const focused = renderer.currentFocusedRenderable?.id ?? ""
    const inField = fields.includes(focused)
    if (key.name === "escape") {
      if (focused === paneId) back()
      else focus(paneId)
    } else if (key.name === "tab") cycle(focused, Boolean(key.shift))
    else if (key.name === "down" && focused === "http-environment-name")
      browse({ row: 0, field: cellRef.current.field })
    else if (["up", "down"].includes(key.name) && inField && focused !== "http-environment-name")
      move(key.name)
    else if (inField && ["enter", "return"].includes(key.name)) focus(paneId)
    else if (focused !== paneId || !gridKey(key.name)) return
    key.preventDefault()
    key.stopPropagation()
  })
  return {
    selected,
    setViewportSize,
    editing: fields.includes(focusId),
    editingName: focusId === "http-environment-name",
    nameSelected: selected.row < 0,
    actions: focusId !== paneId && !fields.includes(focusId),
    selectName: () => {
      selectCell({ ...cellRef.current, row: -1 })
      setFocusId(nameId)
    },
    selectCell: (row: number, field: Cell["field"]) => {
      selectCell({ row, field })
      setFocusId(environmentCellId({ row, field }))
    },
  }
}

function environmentControls(document: HttpEnvironmentDocument, unavailable: boolean) {
  return unavailable
    ? [
        paneId,
        ...(document.error && !document.loading && !document.busy
          ? ["http-environment-retry"]
          : []),
      ]
    : [
        paneId,
        "http-environment-save",
        ...(document.key !== "@globals" && !document.fresh
          ? ["http-environment-activate", "http-environment-delete"]
          : []),
        ...(document.key !== "@globals" ? ["http-environment-name"] : []),
      ]
}
