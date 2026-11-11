import { useKeyboard, useRenderer } from "@opentui/react"
import type { Renderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { FocusSelectionOverlay } from "@xupon/tuiminal-core/ui/FocusSelectionOverlay"
import {
  type FocusDirection,
  type FocusTargetRect,
  focusDirectionForKey,
  nextFocusTarget,
} from "@xupon/tuiminal-core/ui/focus-navigation"

const FOCUS_ID = "http-box-selection"
type Target = { id: string; onFocus: () => void }

export function useHttpBoxSelection({
  active,
  targets,
  current,
}: {
  active: boolean
  targets: Target[]
  current: string
}) {
  const renderer = useRenderer()
  const [selected, setSelected] = useState<string | null>(null)
  const origin = useRef(current)
  const previousFocus = useRef<Renderable | null>(null)
  const rects = () =>
    targets.flatMap(({ id }) => {
      const node = renderer.root.findDescendantById(id)
      return node?.visible && node.width > 0 && node.height > 0
        ? [
            {
              key: id,
              left: node.screenX,
              top: node.screenY,
              width: node.width,
              height: node.height,
            },
          ]
        : []
    })
  const focus = (id: string) => {
    setSelected(null)
    renderer.root.findDescendantById(FOCUS_ID)?.blur()
    targets.find((target) => target.id === id)?.onFocus()
  }
  const openSelection = () => {
    const visible = rects()
    let focused = renderer.currentFocusedRenderable
    while (focused && !visible.some((target) => target.key === focused?.id))
      focused = focused.parent
    const initial = visible.find((target) => target.key === (focused?.id ?? current)) ?? visible[0]
    if (!initial) return
    previousFocus.current = focused ? renderer.currentFocusedRenderable : null
    origin.current = initial.key
    setSelected(initial.key)
  }

  useEffect(() => {
    if (!active) setSelected(null)
  }, [active])
  useEffect(() => {
    if (selected) renderer.root.findDescendantById(FOCUS_ID)?.focus()
  }, [renderer, selected])
  useEffect(() => {
    if (selected) {
      const visible = rects()
      if (!visible.some((target) => target.key === selected)) setSelected(visible[0]?.key ?? null)
    }
  })

  useKeyboard((key) => {
    if (!active || !selected || key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    const plain = !key.ctrl && !key.meta && !key.option && !key.shift && !key.super
    const direction = plain ? focusDirectionForKey(key.name) : null
    if (direction) setSelected(nextHttpFocusTarget(rects(), selected, direction))
    else if (plain && ["return", "enter", "linefeed"].includes(key.name)) focus(selected)
    else if (key.name === "escape" || (plain && key.name === "m")) {
      focus(origin.current)
      const previous = previousFocus.current
      if (previous && !previous.isDestroyed) previous.focus()
    }
  })

  const open = active && selected !== null
  useWorkspaceRepaint(open ? "http-box-selection" : "http-workspace", active)
  return {
    open,
    openSelection,
    overlay: (id: string) =>
      open ? (
        <FocusSelectionOverlay id={id} selected={selected === id} onFocus={() => focus(id)} />
      ) : null,
    focusNode: open ? (
      <box id={FOCUS_ID} focusable position="absolute" top={0} left={0} width={1} height={1} />
    ) : null,
  }
}

function nextHttpFocusTarget(
  targets: FocusTargetRect[],
  selected: string,
  direction: FocusDirection,
) {
  const current = targets.find((target) => target.key === selected)
  if (!current) return selected
  // Prefer boxes in the same row/column before considering the full-width URL bar.
  const aligned = targets.filter((target) => {
    if (direction === "left" || direction === "right")
      return target.top < current.top + current.height && target.top + target.height > current.top
    return target.left < current.left + current.width && target.left + target.width > current.left
  })
  const next = nextFocusTarget(aligned, selected, direction)
  return next === selected ? nextFocusTarget(targets, selected, direction) : next
}
