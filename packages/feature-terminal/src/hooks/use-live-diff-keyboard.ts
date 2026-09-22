import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { RefObject } from "react"

type RenderableRef<T> = RefObject<T | null>

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function previewScrollDelta(name: string, height: number) {
  if (name === "k" || name === "up") return -1
  if (name === "j" || name === "down") return 1
  const halfPage = Math.max(1, Math.floor(height / 2))
  if (name === "h" || name === "left") return -halfPage
  if (name === "l" || name === "right") return halfPage
  return null
}

function handlePreviewKey(
  key: KeyEvent,
  preview: ScrollBoxRenderable | null,
  onActivateDiffAuto: () => void,
) {
  if (key.name === "escape") {
    consume(key)
    onActivateDiffAuto()
    return
  }
  if (!preview) return
  const delta = previewScrollDelta(key.name, preview.height)
  if (delta === null) return
  consume(key)
  preview.scrollBy(delta)
}

function handleFileKey(
  key: KeyEvent,
  preview: ScrollBoxRenderable | null,
  selected: boolean,
  onReturnTerminal: () => void,
  onAddProject: () => void,
  toggleProject: () => void,
  selectProjectRelative: (delta: number) => void,
  selectRelative: (delta: number) => void,
) {
  if (key.name === "escape") {
    consume(key)
    onReturnTerminal()
  } else if ((key.name === "enter" || key.name === "return") && selected) {
    consume(key)
    preview?.focus()
  } else if (key.name === "n") {
    consume(key)
    toggleProject()
  } else if (key.name === "a") {
    consume(key)
    onAddProject()
  } else if (["h", "left", "l", "right"].includes(key.name)) {
    consume(key)
    selectProjectRelative(key.name === "h" || key.name === "left" ? -1 : 1)
  } else if (["j", "down", "k", "up"].includes(key.name)) {
    consume(key)
    selectRelative(key.name === "j" || key.name === "down" ? 1 : -1)
  }
}

export function useLiveDiffKeyboard({
  active,
  panel,
  preview,
  selected,
  onReturnTerminal,
  onClose,
  onAddProject,
  toggleProject,
  selectProjectRelative,
  onActivateDiffAuto,
  selectRelative,
}: {
  active: boolean
  panel: RenderableRef<BoxRenderable>
  preview: RenderableRef<ScrollBoxRenderable>
  selected: boolean
  onReturnTerminal: () => void
  onClose: () => void
  onAddProject: () => void
  toggleProject: () => void
  selectProjectRelative: (delta: number) => void
  onActivateDiffAuto: () => void
  selectRelative: (delta: number) => void
}) {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (!active || key.defaultPrevented || key.ctrl || key.meta || key.option || key.super) return
    let focused = renderer.currentFocusedRenderable
    let inPreview = false
    while (focused && focused !== panel.current) {
      if (focused === preview.current) inPreview = true
      focused = focused.parent
    }
    if (!focused) return
    if (key.name === "x") {
      consume(key)
      onClose()
      return
    }
    if (inPreview) handlePreviewKey(key, preview.current, onActivateDiffAuto)
    else
      handleFileKey(
        key,
        preview.current,
        selected,
        onReturnTerminal,
        onAddProject,
        toggleProject,
        selectProjectRelative,
        selectRelative,
      )
  })
}
