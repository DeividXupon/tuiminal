import { dirname, join } from "node:path"
import type { HttpCollectionTreeRow } from "./collection-tree"
import type { HttpKey } from "./keyboard-types"

export type HttpCollectionTreeCommand =
  | { kind: "noop" }
  | { kind: "select"; id: string }
  | { kind: "toggle"; id: string }
  | { kind: "open"; row: Extract<HttpCollectionTreeRow, { kind: "request" }> }
  | { kind: "confirm-delete" | "cancel-delete" }
  | { kind: "workspace-menu" }

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

export function resolveHttpCollectionTreeCommand(
  key: HttpKey,
  rows: HttpCollectionTreeRow[],
  selection: string | null,
  deleting: boolean,
  workspaceId?: string,
): HttpCollectionTreeCommand | null {
  if (key.ctrl || key.meta || key.option) return null
  if (deleting) {
    if (key.name === "escape") return { kind: "cancel-delete" }
    if (key.name === "return" || key.name === "enter") return { kind: "confirm-delete" }
    return null
  }
  const index = rows.findIndex((row) => row.id === selection)
  return (
    workspaceCommand(key, rows, selection, workspaceId) ??
    cursorCommand(key, rows, index) ??
    branchCommand(key, rows, index)
  )
}

function workspaceCommand(
  key: HttpKey,
  rows: HttpCollectionTreeRow[],
  selection: string | null,
  workspaceId?: string,
): HttpCollectionTreeCommand | null {
  if (!workspaceId) return null
  const first = rows[0]
  const current = rows.find((row) => row.id === selection)
  if (key.name === "home" || (!selection && ["down", "j", "up", "k"].includes(key.name)))
    return { kind: "select", id: workspaceId }
  if (selection === first?.id && ["up", "k"].includes(key.name))
    return { kind: "select", id: workspaceId }
  if (
    key.name === "left" &&
    current?.depth === 0 &&
    (current.kind === "request" || !current.expanded)
  )
    return { kind: "select", id: workspaceId }
  if (selection !== workspaceId) return null
  if (["enter", "return", "space"].includes(key.name)) return { kind: "workspace-menu" }
  if (["down", "j", "right", "end"].includes(key.name))
    return { kind: "select", id: (key.name === "end" ? rows.at(-1)?.id : first?.id) ?? workspaceId }
  if (["up", "k", "left"].includes(key.name)) return { kind: "noop" }
  return null
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
  action:
    | "create-folder"
    | "create-collection"
    | "create-request"
    | "rename"
    | "delete"
    | "duplicate",
  row: HttpCollectionTreeRow | null,
  name: string,
  root = "",
): string | null {
  if (action === "delete") return selectionAfterDelete(row)
  if (action === "create-request" && row?.kind !== "directory" && row) {
    return row.kind === "folder" ? row.id : `file:${row.path}`
  }
  if (action === "duplicate") return row?.id ?? null
  if (action === "rename") return renamedSelection(row, name)
  if (action === "create-folder" && row?.kind === "folder") return row.id
  if (action === "create-folder" && row?.kind === "file") return row.id
  const parent = row?.kind === "directory" ? row.path : row ? dirname(row.path) : root
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
