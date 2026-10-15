import type { KeyEvent } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { FocusSelectionOverlay } from "@xupon/tuiminal-core/ui/FocusSelectionOverlay"
import { focusDirectionForKey, nextFocusTarget } from "@xupon/tuiminal-core/ui/focus-navigation"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { paletteAction } from "@xupon/tuiminal-core/ui/use-action-palette"
import { useEffect, useRef, useState } from "react"

type Target = { id: string; onFocus: () => void }

function plain(key: KeyEvent) {
  return !key.ctrl && !key.meta && !key.option && !key.shift && !key.super
}

export function useDatabaseBoxSelection({
  id = "database-box-selection",
  buttonLabel = "[M] Escolher box",
  active,
  current,
  targets,
  blocked = [],
}: {
  id?: string
  buttonLabel?: string
  active: boolean
  current: string
  targets: Record<string, Target>
  blocked?: unknown[]
}) {
  active = active && !blocked.some(Boolean)
  const targetList = Object.values(targets)
  const renderer = useRenderer()
  const [selected, setSelected] = useState<string | null>(null)
  const restore = useRef<(() => void) | undefined>(undefined)
  const rects = () =>
    targetList.flatMap((target) => {
      const node = renderer.root.findDescendantById(target.id)
      if (!node?.visible || node.width <= 0 || node.height <= 0) return []
      return [
        {
          key: target.id,
          left: node.screenX,
          top: node.screenY,
          width: node.width,
          height: node.height,
        },
      ]
    })
  const close = () => {
    renderer.root.findDescendantById(id)?.blur()
    setSelected(null)
  }
  const focus = (target: string) => {
    close()
    targetList.find(({ id }) => id === target)?.onFocus()
  }
  const openSelection = () => {
    const visible = rects()
    const initial = visible.find(({ key }) => key === targets[current]?.id) ?? visible[0]
    if (!initial) return
    restore.current = targetList.find(({ id }) => id === initial.key)?.onFocus
    setSelected(initial.key)
  }

  useEffect(() => {
    if (!active) {
      renderer.root.findDescendantById(id)?.blur()
      setSelected(null)
    }
  }, [active, id, renderer])
  useEffect(() => {
    if (selected && active) renderer.root.findDescendantById(id)?.focus()
  }, [active, id, renderer, selected])
  useEffect(() => {
    if (selected && !rects().some(({ key }) => key === selected)) {
      setSelected(rects()[0]?.key ?? null)
    }
  })

  const handleSelectionKey = (key: KeyEvent) => {
    if (!active || !selected || key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    const direction = plain(key) ? focusDirectionForKey(key.name) : null
    if (direction) setSelected(nextFocusTarget(rects(), selected, direction))
    else if (plain(key) && ["return", "enter", "linefeed"].includes(key.name)) focus(selected)
    else if (key.name === "escape" || (plain(key) && key.name === "m")) {
      close()
      restore.current?.()
    }
  }

  const open = active && selected !== null
  return {
    open,
    blocked: !active,
    openSelection,
    button: (
      <InlineButton
        id={`${id}-open`}
        label={buttonLabel}
        accent={COLORS.database}
        onPress={openSelection}
      />
    ),
    handleOpeningKey: (key: KeyEvent) => {
      if (!plain(key) || key.name !== "m") return false
      key.preventDefault()
      key.stopPropagation()
      openSelection()
      return true
    },
    action: {
      ...paletteAction(
        "choose-box",
        "[M]",
        "Escolher box",
        "Navega visualmente entre os boxes abertos.",
        "NAVEGAÇÃO",
        openSelection,
      ),
      key: { name: "m" },
    },
    overlay: (target: string) =>
      open ? (
        <FocusSelectionOverlay
          id={target}
          selected={selected === target}
          onFocus={() => focus(target)}
        />
      ) : null,
    focusNode: open ? <SelectionFocus id={id} onKey={handleSelectionKey} /> : null,
  }
}

export function databaseTableBoxTargets(
  gridId: string,
  focus: (pane: "catalog" | "grid" | "inspector") => void,
) {
  return {
    catalog: { id: "tutorial-db-catalog", onFocus: () => focus("catalog") },
    grid: { id: gridId, onFocus: () => focus("grid") },
    inspector: { id: "tutorial-db-inspector", onFocus: () => focus("inspector") },
  }
}

export function databaseQueryBoxTargets(
  id: (part: string) => string,
  editor: () => void,
  focus: (pane: "grid" | "inspector") => void,
) {
  return {
    editor: { id: id("editor-box"), onFocus: editor },
    grid: { id: id("result-box"), onFocus: () => focus("grid") },
    inspector: { id: id("inspector"), onFocus: () => focus("inspector") },
  }
}

function SelectionFocus({ id, onKey }: { id: string; onKey: (key: KeyEvent) => void }) {
  useKeyboard(onKey)
  return <box id={id} focusable position="absolute" top={0} left={0} width={1} height={1} />
}
