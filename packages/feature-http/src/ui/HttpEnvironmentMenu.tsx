import { CliRenderEvents, type BoxRenderable } from "@opentui/core"
import { createPortal, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import type { HttpEnvironmentEntry } from "../services/environment-editor"

export function HttpEnvironmentMenu({
  entry,
  anchorId,
  onSelect,
  onClose,
}: {
  entry: HttpEnvironmentEntry
  anchorId: string
  onSelect: (action: "activate" | "delete") => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const ref = useRef<BoxRenderable | null>(null)
  const [selection, setSelection] = useState(0)
  const selected = useRef(0)
  const readAnchor = useCallback(() => {
    const node = renderer.root.findDescendantById(anchorId)
    return { x: node?.screenX ?? 0, y: node?.screenY ?? 0, width: node?.width ?? 0 }
  }, [anchorId, renderer])
  const [anchor, setAnchor] = useState(readAnchor)
  useEffect(() => {
    const update = () => {
      const next = readAnchor()
      setAnchor((old) =>
        old.x === next.x && old.y === next.y && old.width === next.width ? old : next,
      )
    }
    renderer.on(CliRenderEvents.FRAME, update)
    return () => {
      renderer.off(CliRenderEvents.FRAME, update)
    }
  }, [readAnchor, renderer])
  useEffect(() => {
    const previous = renderer.currentFocusedRenderable
    ref.current?.focus()
    return () => {
      if (!previous?.isDestroyed) previous?.focus()
    }
  }, [renderer])
  useWorkspaceRepaint(`http-environment-menu:${entry.key}`)
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape" || key.name === "a") onClose()
    else if (["up", "down", "j", "k", "tab"].includes(key.name)) {
      selected.current = 1 - selected.current
      setSelection(selected.current)
    } else if (["enter", "return"].includes(key.name))
      onSelect(selected.current === 0 ? "activate" : "delete")
  })
  const width = Math.min(28, terminal.width)
  const height = Math.min(5, terminal.height)
  const left = Math.max(0, Math.min(anchor.x + anchor.width, terminal.width - width))
  const top = Math.max(0, Math.min(anchor.y, terminal.height - height))
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: Native terminal overlay consumes outside clicks; the menu owns keyboard focus.
    <box
      id="http-environment-menu-layer"
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      zIndex={200}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.target?.id === "http-environment-menu-layer") onClose()
      }}
    >
      <box
        id="http-environment-menu"
        ref={ref}
        focusable
        position="absolute"
        left={left}
        top={top}
        width={width}
        height={height}
        border
        borderStyle="rounded"
        borderColor={COLORS.http}
        backgroundColor={COLORS.panel}
        paddingLeft={1}
        paddingRight={1}
      >
        <text content={truncateDisplay(entry.name, width - 4)} fg={COLORS.muted} height={1} />
        <InlineButton
          id="http-environment-menu-activate"
          label="Usar ambiente"
          selected={selection === 0}
          accent={COLORS.http}
          onPress={() => onSelect("activate")}
        />
        <InlineButton
          id="http-environment-menu-delete"
          label="Excluir"
          selected={selection === 1}
          accent={COLORS.danger}
          onPress={() => onSelect("delete")}
        />
      </box>
    </box>,
    renderer.root,
    null,
    "http-environment-menu",
  )
}
