import { dirname, join } from "node:path"
import type { HttpCollectionTreeRow } from "./collection-tree"
import type { HttpKey } from "./keyboard-types"

export type HttpCollectionTreeCommand =
  | { kind: "noop" }
  | { kind: "select"; id: string }
  | { kind: "toggle"; id: string }
  | { kind: "open"; row: Extract<HttpCollectionTreeRow, { kind: "request" }> }
  | { kind: "create-folder" | "create-collection" | "create-request" | "rename" | "delete" }
  | { kind: "confirm-delete" | "cancel-delete" }
  | { kind: "open-postman" }

function cursorCommand(
  key: HttpKey,
  rows: HttpCollectionTreeRow[],
  index: number,
): HttpCollectionTreeCommand | null {
  if (key.name === "down" || key.name === "j") {
    const row = rows[Math.min(index + 1, rows.length - 1)]
    return row ? { kind: "select", id: row.id } : null
  }
  if (key.name === "up" || key.name === "k") {
    const row = rows[Math.max(0, index - 1)]
    return row ? { kind: "select", id: row.id } : null
  }
  if (key.name === "home") return rows[0] ? { kind: "select", id: rows[0].id } : null
  if (key.name === "end") {
    const last = rows.at(-1)
    return last ? { kind: "select", id: last.id } : null
  }
  return null
}

function leftCommand(
  current: HttpCollectionTreeRow,
  rows: HttpCollectionTreeRow[],
  index: number,
): HttpCollectionTreeCommand {
  if (current.kind !== "request" && current.expanded) return { kind: "toggle", id: current.id }
  const parent = rows
    .slice(0, index)
    .reverse()
    .find((row) => row.depth === current.depth - 1)
  return parent ? { kind: "select", id: parent.id } : { kind: "noop" }
}

function rightCommand(
  current: HttpCollectionTreeRow,
  rows: HttpCollectionTreeRow[],
  index: number,
): HttpCollectionTreeCommand {
  if (current.kind === "request") return { kind: "noop" }
  if (!current.expanded) return { kind: "toggle", id: current.id }
  const child = rows[index + 1]
  return child && child.depth > current.depth ? { kind: "select", id: child.id } : { kind: "noop" }
}

function branchCommand(
  key: HttpKey,
  rows: HttpCollectionTreeRow[],
  index: number,
): HttpCollectionTreeCommand | null {
  const current = rows[index]
  if (!current) {
    if (key.name !== "left" && key.name !== "right") return null
    return rows[0] ? { kind: "select", id: rows[0].id } : { kind: "noop" }
  }
  if (key.name === "left") return leftCommand(current, rows, index)
  if (key.name === "right") return rightCommand(current, rows, index)
  if (key.name === "return" || key.name === "enter" || key.name === "space") {
    return current.kind === "request"
      ? { kind: "open", row: current }
      : { kind: "toggle", id: current.id }
  }
  return null
}

function editCommand(key: HttpKey, selected: boolean): HttpCollectionTreeCommand | null {
  if (key.name === "n") return { kind: key.shift ? "create-collection" : "create-request" }
  if (key.name === "p") return { kind: "create-folder" }
  if (key.name === "o") return { kind: "open-postman" }
  if (key.name === "e" && selected) return { kind: "rename" }
  if (key.name === "d" && selected) return { kind: "delete" }
  return null
}

export function resolveHttpCollectionTreeCommand(
  key: HttpKey,
  rows: HttpCollectionTreeRow[],
  selection: string | null,
  deleting: boolean,
): HttpCollectionTreeCommand | null {
  if (key.ctrl || key.meta || key.option) return null
  if (deleting) {
    if (key.name === "escape") return { kind: "cancel-delete" }
    if (key.name === "return" || key.name === "enter") return { kind: "confirm-delete" }
    return null
  }
  const index = rows.findIndex((row) => row.id === selection)
  return (
    cursorCommand(key, rows, index) ??
    branchCommand(key, rows, index) ??
    editCommand(key, index >= 0)
  )
}

function fileId(path: string) {
  return `file:${/\.(http|rest)$/i.test(path) ? path : `${path}.http`}`
}

function renamedSelection(row: HttpCollectionTreeRow | null, name: string): string | null {
  if (!row) return null
  if (row.kind === "folder") return row.id
  if (row.kind === "request") {
    const slug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-") || "request"
    return `request:${row.path}#${slug}`
  }
  const path = join(dirname(row.path), name.trim())
  return row.kind === "directory" ? `directory:${path}` : fileId(path)
}

function selectionAfterDelete(row: HttpCollectionTreeRow | null) {
  if (!row) return null
  if (row.kind === "request" || row.kind === "folder") return `file:${row.path}`
  const parent = dirname(row.path)
  return parent === "." ? null : `directory:${parent}`
}

export function httpCollectionSelectionAfterAction(
  action: "create-folder" | "create-collection" | "create-request" | "rename" | "delete",
  row: HttpCollectionTreeRow | null,
  name: string,
): string | null {
  if (action === "delete") return selectionAfterDelete(row)
  if (action === "create-request" && row?.kind !== "directory" && row) {
    return row.kind === "folder" ? row.id : `file:${row.path}`
  }
  if (action === "rename") return renamedSelection(row, name)
  if (action === "create-folder" && row?.kind === "folder") return row.id
  if (action === "create-folder" && row?.kind === "file") return row.id
  const parent = row?.kind === "directory" ? row.path : row ? dirname(row.path) : ""
  const path = join(parent, name.trim())
  if (action === "create-folder") return `directory:${path}`
  return fileId(path)
}

export function visibleHttpCollectionSelection(
  rows: HttpCollectionTreeRow[],
  selection: string,
): string | null {
  if (rows.some((row) => row.id === selection)) return selection
  if (selection.startsWith("folder:")) {
    const filePath = selection.slice("folder:".length, selection.lastIndexOf(":"))
    return rows.some((row) => row.id === `file:${filePath}`) ? `file:${filePath}` : null
  }
  const path = selection.startsWith("request:")
    ? (selection.slice("request:".length).split("#")[0] ?? "")
    : selection.startsWith("file:")
      ? selection.slice("file:".length)
      : selection.slice("directory:".length)
  if (selection.startsWith("request:") && rows.some((row) => row.id === `file:${path}`)) {
    return `file:${path}`
  }
  let parent = dirname(path)
  while (parent !== "." && parent !== "") {
    const id = `directory:${parent}`
    if (rows.some((row) => row.id === id)) return id
    parent = dirname(parent)
  }
  return null
}
