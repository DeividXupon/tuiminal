import { useRenderer } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import {
  createHttpKeyValueEntry,
  createHttpMultipartPart,
  httpHeaderSensitivity,
} from "../model/key-value"
import type { HttpKey } from "../model/keyboard-types"
import { httpParameterSectionForKey } from "../model/parameter-navigation"
import type {
  HttpKeyValue,
  HttpMultipartPart,
  HttpRequestDefinition,
  HttpRequestView,
} from "../model/types"

export type HttpRequestTableSection = "query" | "path" | "header" | "form" | "multipart"
export type HttpRequestTableMode = "block" | "table" | "cell"
export type HttpRequestTableColumn = -2 | -1 | 0 | 1 | 2
export type HttpRequestTableKey = HttpKey & {
  preventDefault(): void
  stopPropagation(): void
}

export function consumeHttpRequestTableKey(
  key: HttpRequestTableKey,
  handleKey: (key: HttpKey) => boolean,
) {
  if (!handleKey(key)) return false
  key.preventDefault()
  key.stopPropagation()
  return true
}
export type HttpRequestTableNavigation<T> = {
  active: boolean
  mode: HttpRequestTableMode
  row: number
  column: HttpRequestTableColumn
  draft: T
  onDraftInput: (field: "name" | "value", value: string) => void
  onFocusBlock: () => void
  onEnter: () => void
  onFocusCell: (row: number, column: 0 | 1) => void
}

type Selection = {
  section: HttpRequestTableSection | null
  mode: HttpRequestTableMode
  row: number
  column: HttpRequestTableColumn
}
type Changes = {
  query: (rows: HttpKeyValue[]) => void
  path: (rows: HttpKeyValue[]) => void
  header: (rows: HttpKeyValue[]) => void
  form: (rows: HttpKeyValue[]) => void
  multipart: (rows: HttpMultipartPart[]) => void
}

const BLOCK: Selection = { section: null, mode: "block", row: 0, column: 0 }

function sectionFor(
  view: HttpRequestView,
  kind: HttpRequestDefinition["body"]["kind"],
  parameter: "query" | "path",
) {
  if (view === "params") return parameter
  if (view === "headers") return "header"
  if (view === "body" && (kind === "form" || kind === "multipart")) return kind
  return null
}

function prefix(requestId: string, section: HttpRequestTableSection) {
  return `${requestId}-${section}`
}

function keyValueRows(
  request: HttpRequestDefinition,
  section: Exclude<HttpRequestTableSection, "multipart">,
) {
  if (section === "query") return request.query
  if (section === "path") return request.path
  if (section === "header") return request.headers
  return request.body.form
}

export function useHttpRequestTables({
  request,
  view,
  focused,
  parameterSection,
  onParameterSectionChange,
  onFocus,
  changes,
}: {
  request: HttpRequestDefinition
  view: HttpRequestView
  focused: boolean
  parameterSection: "query" | "path"
  onParameterSectionChange: (section: "query" | "path") => void
  onFocus: () => void
  changes: Changes
}) {
  const renderer = useRenderer()
  const section = sectionFor(view, request.body.kind, parameterSection)
  const [selection, setSelection] = useState<Selection>(BLOCK)
  const previousSection = useRef(section)
  const drafts = useRef(new Map<HttpRequestTableSection, HttpKeyValue | HttpMultipartPart>())
  const draftFor = (target: HttpRequestTableSection) => {
    const existing = drafts.current.get(target)
    if (existing) return existing
    const created =
      target === "multipart"
        ? createHttpMultipartPart(request.id)
        : createHttpKeyValueEntry(prefix(request.id, target))
    drafts.current.set(target, created)
    return created
  }
  const mode = selection.section === section ? selection.mode : "block"
  const row = mode === "block" ? 0 : selection.row
  const column = mode === "block" ? 0 : selection.column
  const rowsFor = (target: HttpRequestTableSection) =>
    target === "multipart" ? (request.body.multipart ?? []) : keyValueRows(request, target)

  useEffect(() => {
    if (previousSection.current === section) return
    previousSection.current = section
    if (renderer.currentFocusedRenderable?.id?.startsWith("http-key-value-")) {
      renderer.currentFocusedRenderable.blur()
    }
    setSelection({ ...BLOCK, section })
  }, [renderer, section])

  const setSection = (target: HttpRequestTableSection) => {
    previousSection.current = target
    renderer.currentFocusedRenderable?.blur()
    if (target === "query" || target === "path") onParameterSectionChange(target)
    setSelection({ ...BLOCK, section: target })
    onFocus()
  }
  const enter = (target: HttpRequestTableSection) => {
    previousSection.current = target
    if (target === "query" || target === "path") onParameterSectionChange(target)
    setSelection({
      section: target,
      mode: rowsFor(target).length ? "table" : "cell",
      row: 0,
      column: 0,
    })
    onFocus()
  }
  const selectCell = (
    target: HttpRequestTableSection,
    selectedRow: number,
    selectedColumn: 0 | 1,
  ) => {
    previousSection.current = target
    if (target === "query" || target === "path") onParameterSectionChange(target)
    setSelection({ section: target, mode: "cell", row: selectedRow, column: selectedColumn })
    onFocus()
  }

  const changeDraft = (
    target: HttpRequestTableSection,
    patch: Partial<HttpKeyValue & HttpMultipartPart>,
  ) => {
    if (patch.name === "" || patch.value === "") return
    const created = {
      ...draftFor(target),
      ...patch,
      ...(target === "header" && patch.name !== undefined
        ? { sensitivity: httpHeaderSensitivity(patch.name) }
        : {}),
    }
    drafts.current.set(
      target,
      target === "multipart"
        ? createHttpMultipartPart(request.id)
        : createHttpKeyValueEntry(prefix(request.id, target)),
    )
    if (target === "multipart") {
      changes.multipart([...(request.body.multipart ?? []), created as HttpMultipartPart])
    } else {
      changes[target]([...keyValueRows(request, target), created as HttpKeyValue])
    }
  }
  const patchExisting = (
    target: HttpRequestTableSection,
    selectedRow: number,
    patch: Partial<HttpKeyValue & HttpMultipartPart>,
  ) => {
    if (target === "multipart") {
      changes.multipart(
        (request.body.multipart ?? []).map((part, index) =>
          index === selectedRow ? { ...part, ...patch } : part,
        ),
      )
      return
    }
    changes[target](
      keyValueRows(request, target).map((item, index) =>
        index === selectedRow
          ? {
              ...item,
              ...patch,
              ...(target === "header" && patch.name !== undefined
                ? { sensitivity: httpHeaderSensitivity(patch.name) }
                : {}),
            }
          : item,
      ),
    )
  }

  const moveCell = (backwards: boolean) => {
    if (!section) return
    const lastRow = rowsFor(section).length
    const step = backwards ? (column === 0 ? -1 : 0) : column === 1 ? 1 : 0
    setSelection((current) => ({
      ...current,
      row: Math.max(0, Math.min(lastRow, current.row + step)),
      column: backwards && current.row === 0 && current.column === 0 ? 0 : column === 0 ? 1 : 0,
    }))
  }
  const handleCellKey = (key: HttpKey) => {
    if (key.name === "escape") {
      renderer.currentFocusedRenderable?.blur()
      setSelection((current) => ({ ...current, mode: "table" }))
      return true
    }
    if (key.name !== "tab") return false
    moveCell(Boolean(key.shift))
    return true
  }
  const navigateTable = (name: string, target: HttpRequestTableSection, lastRow: number) => {
    if (name === "up" || name === "k")
      setSelection((current) => {
        const nextRow = Math.max(0, current.row - 1)
        return { ...current, row: nextRow, column: nextRow === lastRow ? 0 : current.column }
      })
    else if (name === "down" || name === "j")
      setSelection((current) => {
        const nextRow = Math.min(lastRow, current.row + 1)
        return { ...current, row: nextRow, column: nextRow === lastRow ? 0 : current.column }
      })
    else if (name === "left" || name === "h")
      setSelection((current) => ({
        ...current,
        column: Math.max(
          current.row === lastRow ? 0 : target === "multipart" ? -2 : -1,
          current.column - 1,
        ) as HttpRequestTableColumn,
      }))
    else if (name === "right" || name === "l")
      setSelection((current) => ({
        ...current,
        column: Math.min(
          current.row === lastRow ? 1 : 2,
          current.column + 1,
        ) as HttpRequestTableColumn,
      }))
    else return false
    return true
  }
  const deleteTableRow = (target: HttpRequestTableSection) => {
    const remaining = rowsFor(target).filter((_, index) => index !== row)
    if (target === "multipart") changes.multipart(remaining as HttpMultipartPart[])
    else changes[target](remaining as HttpKeyValue[])
    setSelection((current) => ({
      ...current,
      row: Math.min(current.row, remaining.length),
      column: current.row >= remaining.length ? 0 : current.column,
    }))
  }
  const editTableRow = (name: string, target: HttpRequestTableSection) => {
    if (name === "space") {
      const item = rowsFor(target)[row]
      if (item) patchExisting(target, row, { enabled: !item.enabled })
    } else if (name === "d" || name === "delete") {
      deleteTableRow(target)
    } else if (target === "multipart" && (name === "f" || name === "t")) {
      patchExisting(target, row, { kind: name === "f" ? "file" : "text" })
    } else return false
    return true
  }
  const activateTableSelection = (target: HttpRequestTableSection) => {
    const item = rowsFor(target)[row]
    if (!item) {
      setSelection((current) => ({ ...current, mode: "cell" }))
      return
    }
    if (column === 2) {
      deleteTableRow(target)
      return
    }
    if (column === -2 || (column === -1 && target !== "multipart")) {
      patchExisting(target, row, { enabled: !item.enabled })
      return
    }
    if (column === -1 && target === "multipart") {
      patchExisting(target, row, {
        kind: request.body.multipart?.[row]?.kind === "file" ? "text" : "file",
      })
      return
    }
    setSelection((current) => ({ ...current, mode: "cell" }))
  }
  const handleTableKey = (key: HttpKey) => {
    if (!section) return false
    if (key.name === "escape") {
      setSelection((current) => ({ ...current, mode: "block" }))
      return true
    }
    if (navigateTable(key.name, section, rowsFor(section).length)) return true
    if (key.name === "enter" || key.name === "return") {
      activateTableSelection(section)
      return true
    }
    if (row >= rowsFor(section).length) return false
    return editTableRow(key.name, section)
  }
  const handleKey = (key: HttpKey) => {
    if (!focused || !section || key.ctrl || key.option || key.meta) return false
    if (mode === "cell") return handleCellKey(key)
    if (mode === "table") return handleTableKey(key)
    if (key.name === "enter" || key.name === "return") {
      enter(section)
      return true
    }
    if (view !== "params") return false
    const nextSection = httpParameterSectionForKey(key)
    if (!nextSection) return false
    setSection(nextSection)
    return true
  }

  const selectedId = section ? (rowsFor(section)[row] ?? draftFor(section)).id : ""
  useEffect(() => {
    if (!focused || !section || mode === "block") return
    const targetId =
      mode === "table"
        ? `http-key-value-section-${prefix(request.id, section)}`
        : `http-key-value-${column === 0 ? "name" : "value"}-${selectedId}`
    const timer = setTimeout(() => renderer.root.findDescendantById(targetId)?.focus(), 0)
    return () => clearTimeout(timer)
  }, [column, focused, mode, renderer, request.id, section, selectedId])

  const navigation = (target: HttpRequestTableSection) => ({
    active: focused && section === target,
    mode: section === target ? mode : ("block" as HttpRequestTableMode),
    row,
    column,
    onDraftInput: (field: "name" | "value", value: string) =>
      changeDraft(target, { [field]: value }),
    onFocusBlock: () => setSection(target),
    onEnter: () => enter(target),
    onFocusCell: (selectedRow: number, selectedColumn: 0 | 1) =>
      selectCell(target, selectedRow, selectedColumn),
  })
  const keyValueNavigation = (
    target: Exclude<HttpRequestTableSection, "multipart">,
  ): HttpRequestTableNavigation<HttpKeyValue> => ({
    ...navigation(target),
    draft: draftFor(target) as HttpKeyValue,
  })
  const multipartNavigation = (): HttpRequestTableNavigation<HttpMultipartPart> => ({
    ...navigation("multipart"),
    draft: draftFor("multipart") as HttpMultipartPart,
  })
  return { handleKey, keyValueNavigation, multipartNavigation }
}
