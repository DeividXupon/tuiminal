import { MouseButton, type MouseEvent } from "@opentui/core"
import type { HttpCollectionMenuTarget } from "../hooks/use-http-collection-menu"

export function handleCollectionContextMenu(event: MouseEvent, open: (() => void) | undefined) {
  if (event.button !== MouseButton.RIGHT || !open) return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget?.focus()
  open()
}

export function collectionRowControlId(row: HttpCollectionMenuTarget) {
  if (row.kind === "workspace") return "http-collection-workspace-heading"
  if (row.kind === "request") return `http-navigation-project-${row.item.request.id}`
  if (row.kind === "folder") return `http-collection-folder-${row.path}:${row.folderId}`
  return `http-collection-${row.kind}-${row.path}`
}
