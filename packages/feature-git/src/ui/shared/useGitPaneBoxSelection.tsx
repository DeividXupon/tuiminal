import type { KeyEvent, Renderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { focusedRenderableId, ownsKeyboardFocus } from "@xupon/tuiminal-core/keyboard/scope"
import { FocusSelectionOverlay } from "@xupon/tuiminal-core/ui/FocusSelectionOverlay"
import { focusDirectionForKey, nextFocusTarget } from "@xupon/tuiminal-core/ui/focus-navigation"
import { useCallback, useEffect, useState } from "react"
import { GIT_BOX_SELECTION_ID } from "../../hooks/use-git-base-action-palette"
import { gitKeyboardScope } from "../../keyboard"

export type GitPaneBox = "list" | "preview"

export type GitPaneBoxes = {
  /** Renderable ids of the visible list and preview panels. */
  ids: Readonly<Record<GitPaneBox, string>>
  /** The pane that currently owns workspace focus. */
  current: GitPaneBox
  onFocus: (box: GitPaneBox) => void
}

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function plainKey(key: KeyEvent) {
  return !key.ctrl && !key.meta && !key.option && !key.shift && !key.super
}

function paneRects(
  ids: Readonly<Record<GitPaneBox, string>>,
  find: (id: string) => Renderable | null | undefined,
) {
  return (Object.keys(ids) as GitPaneBox[]).flatMap((key) => {
    const renderable = find(ids[key])
    if (!renderable?.visible || renderable.width <= 0 || renderable.height <= 0) return []
    return [
      {
        key,
        left: renderable.screenX,
        top: renderable.screenY,
        width: renderable.width,
        height: renderable.height,
      },
    ]
  })
}

/**
 * `[M]` "choose a box" for the GitHub tabs, matching Diffs and Term Agents: the selected pane
 * is tinted, `[H/J/K/L]`/arrows move spatially, `[Enter]` or a click focuses it, and
 * `[Esc]`/`[M]` cancel. Workspace keys must stay blocked while `open` is true.
 */
export function useGitPaneBoxSelection({
  active,
  paletteOpen,
  boxes,
}: {
  active: boolean
  paletteOpen: boolean
  boxes?: GitPaneBoxes | undefined
}) {
  const renderer = useRenderer()
  const [selected, setSelected] = useState<GitPaneBox | null>(null)
  const open = Boolean(selected && active && boxes)

  useEffect(() => {
    if (!active) setSelected(null)
  }, [active])

  const close = useCallback(() => {
    setSelected(null)
    const focused = renderer.currentFocusedRenderable
    if (focused?.id === GIT_BOX_SELECTION_ID) focused.blur()
  }, [renderer])

  const openSelection = useCallback(() => {
    if (!boxes) return
    const rects = paneRects(boxes.ids, (id) => renderer.root.findDescendantById(id))
    const origin = rects.find((rect) => rect.key === boxes.current) ?? rects[0]
    if (!origin) return
    setSelected(origin.key)
    setTimeout(() => renderer.root.findDescendantById(GIT_BOX_SELECTION_ID)?.focus(), 0)
  }, [boxes, renderer])

  const focusBox = (box: GitPaneBox) => {
    close()
    boxes?.onFocus(box)
  }

  const handleSelectionKey = (key: KeyEvent, current: GitPaneBox) => {
    consume(key)
    const direction = plainKey(key) ? focusDirectionForKey(key.name.toLowerCase()) : null
    if (direction && boxes) {
      const rects = paneRects(boxes.ids, (id) => renderer.root.findDescendantById(id))
      setSelected(nextFocusTarget(rects, current, direction))
    } else if (key.name === "return" || key.name === "enter" || key.name === "linefeed") {
      focusBox(current)
    } else if (key.name === "escape" || (plainKey(key) && key.name === "m")) close()
  }

  useKeyboard((key) => {
    if (!active || !boxes || paletteOpen || key.defaultPrevented) return
    if (selected) {
      handleSelectionKey(key, selected)
      return
    }
    if (!plainKey(key) || key.name !== "m") return
    if (ownsKeyboardFocus(gitKeyboardScope, focusedRenderableId(renderer.currentFocusedRenderable)))
      return
    consume(key)
    openSelection()
  })

  const overlay = (box: GitPaneBox) =>
    open ? (
      <FocusSelectionOverlay
        id={`git-box-${box}`}
        selected={selected === box}
        onFocus={() => focusBox(box)}
      />
    ) : null

  const focusNode = open ? (
    <box
      id={GIT_BOX_SELECTION_ID}
      focusable
      position="absolute"
      top={0}
      left={0}
      width={1}
      height={1}
    />
  ) : null

  return { open, openSelection, overlay, focusNode }
}
