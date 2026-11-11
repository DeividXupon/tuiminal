import { CliRenderEvents, type BoxRenderable } from "@opentui/core"
import { createPortal, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { collectionRowControlId } from "./http-collection-context-menu"
import type {
  HttpCollectionMenuTarget,
  HttpCollectionMenuAction,
} from "../hooks/use-http-collection-menu"

const branchItems = [
  { action: "create-request", label: "Adicionar chamada" },
  { action: "create-folder", label: "Adicionar pasta" },
  { action: "rename", label: "Renomear" },
  { action: "duplicate", label: "Duplicar" },
] as const

function menuItems(
  row: HttpCollectionMenuTarget,
  settingsEnabled: boolean,
): { action: HttpCollectionMenuAction; label: string }[] {
  if (row.kind === "workspace")
    return row.source === "local"
      ? [
          { action: "create-collection", label: "Nova coleção" },
          { action: "create-folder", label: "Nova pasta" },
          { action: "import-collection", label: "Importar coleção" },
        ]
      : [
          { action: "create-collection", label: "Nova coleção" },
          { action: "select-workspace", label: "Selecionar workspace" },
          { action: "create-workspace", label: "Novo workspace" },
        ]
  if (row.kind === "request")
    return [
      { action: "rename", label: "Renomear" },
      { action: "delete", label: "Deletar" },
      { action: "duplicate", label: "Duplicar" },
    ]
  return [
    ...(settingsEnabled ? [{ action: "settings" as const, label: "Configurações" }] : []),
    ...branchItems,
    ...(row.kind === "file"
      ? [{ action: "run-collection" as const, label: "Executar coleção" }]
      : []),
    ...(row.kind === "directory"
      ? [{ action: "create-collection" as const, label: "Nova coleção" }]
      : []),
    { action: "delete", label: "Deletar" },
  ]
}

export function HttpCollectionMenu({
  row,
  settingsEnabled = false,
  onSelect,
  onClose,
}: {
  row: HttpCollectionMenuTarget
  settingsEnabled?: boolean
  onSelect: (action: HttpCollectionMenuAction) => void
  onClose: () => void
}) {
  const items = menuItems(row, settingsEnabled)
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const ref = useRef<BoxRenderable | null>(null)
  const [index, setIndex] = useState(0)
  const anchor = useMenuAnchor(row)
  const width = Math.min(
    terminal.width,
    Math.max(24, ...items.map((item) => displayWidth(translateUi(item.label)) + 6)),
  )
  const height = Math.min(terminal.height, items.length + 4)
  const right = (anchor?.screenX ?? 0) + (anchor?.width ?? 0)
  const left = right + width <= terminal.width ? right : Math.max(0, (anchor?.screenX ?? 0) - width)
  const top = Math.max(0, Math.min(anchor?.screenY ?? 0, terminal.height - height))
  useWorkspaceRepaint(`http-collection-menu:${row.id}`)
  useEffect(() => {
    const previous = renderer.currentFocusedRenderable
    ref.current?.focus()
    return () => {
      const focused = renderer.currentFocusedRenderable
      if ((!focused || focused.id.startsWith("http-collection-menu")) && !previous?.isDestroyed)
        previous?.focus()
    }
  }, [renderer])
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape" || key.name === "a") return onClose()
    if (["down", "j", "tab"].includes(key.name) && !key.shift)
      setIndex((value) => (value + 1) % items.length)
    else if (["up", "k"].includes(key.name) || (key.name === "tab" && key.shift))
      setIndex((value) => (value + items.length - 1) % items.length)
    else if (key.name === "return" || key.name === "enter")
      onSelect(items[index]?.action ?? "create-request")
  })
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI overlay consumes outside clicks; the menu owns keyboard focus.
    <box
      id="http-collection-menu-layer"
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      zIndex={200}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.target?.id === "http-collection-menu-layer") onClose()
      }}
    >
      <box
        id="http-collection-menu"
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
        <text
          content={truncateDisplay(
            row.kind === "request" ? row.item.request.name : row.name,
            width - 4,
          )}
          fg={COLORS.muted}
          height={1}
        />
        {items.map((item, candidate) => (
          <InlineButton
            key={item.action}
            id={`http-collection-menu-${item.action}`}
            label={item.label}
            selected={index === candidate}
            accent={COLORS.http}
            onPress={() => onSelect(item.action)}
          />
        ))}
        <InlineButton label="[Esc] Fechar" accent={COLORS.muted} onPress={onClose} />
      </box>
    </box>,
    renderer.root,
    null,
    "http-collection-menu",
  )
}

function useMenuAnchor(row: HttpCollectionMenuTarget) {
  const renderer = useRenderer()
  const actionId = `http-collection-actions-${row.id}`
  const controlId = collectionRowControlId(row)
  const read = useCallback(() => {
    const target =
      renderer.root.findDescendantById(actionId) ?? renderer.root.findDescendantById(controlId)
    return {
      screenX: target?.screenX ?? 0,
      screenY: target?.screenY ?? 0,
      width: target?.width ?? 0,
    }
  }, [actionId, controlId, renderer])
  const [anchor, setAnchor] = useState(read)
  useEffect(() => {
    const update = () => {
      const next = read()
      setAnchor((previous) =>
        previous.screenX === next.screenX &&
        previous.screenY === next.screenY &&
        previous.width === next.width
          ? previous
          : next,
      )
    }
    renderer.on(CliRenderEvents.FRAME, update)
    return () => {
      renderer.off(CliRenderEvents.FRAME, update)
    }
  }, [read, renderer])
  return anchor
}
