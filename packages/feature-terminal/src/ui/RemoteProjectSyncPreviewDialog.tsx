import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  RemoteProjectSyncChange,
  RemoteProjectSyncPreview,
} from "../model/remote-project-sync"
import { TerminalInlineButton } from "./TerminalShortcut"

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function changeLabel(change: RemoteProjectSyncChange) {
  if (change.localChanged) return translateUi("Conflito")
  if (change.action === "add") return translateUi("Novo")
  if (change.action === "delete") return translateUi("Removido")
  return translateUi("Alterado")
}

function changeColor(change: RemoteProjectSyncChange) {
  if (change.localChanged) return COLORS.danger
  if (change.action === "add") return COLORS.success
  if (change.action === "delete") return COLORS.danger
  return COLORS.warning
}

function displayPath(path: string, width: number) {
  return truncateDisplay(path.replace(/[\p{Cc}\p{Cf}]/gu, ""), width)
}

export function RemoteProjectSyncPreviewDialog({
  preview,
  onConfirm,
  onClose,
}: {
  preview: RemoteProjectSyncPreview
  onConfirm: () => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(24, Math.min(96, dimensions.width - 2))
  const height = Math.max(8, Math.min(28, dimensions.height - 2))
  const [listWidth, setListWidth] = useState(width - 4)
  const counts = useMemo(
    () => ({
      add: preview.changes.filter((change) => change.action === "add").length,
      update: preview.changes.filter((change) => change.action === "update").length,
      delete: preview.changes.filter((change) => change.action === "delete").length,
      conflict: preview.changes.filter((change) => change.localChanged).length,
    }),
    [preview.changes],
  )
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    const name = key.name.toLowerCase()
    if (name === "escape") {
      consume(key)
      onClose()
    } else if (name === "enter" || name === "return") {
      consume(key)
      onConfirm()
    } else if (["up", "down", "j", "k"].includes(name)) {
      consume(key)
      list.current?.scrollBy(name === "up" || name === "k" ? -1 : 1)
    }
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-project-sync-preview"
      width={width}
      height={height}
      borderColor={preview.hasLocalChanges ? COLORS.warning : COLORS.terminal}
      zIndex={830}
      onBackdropPress={onClose}
    >
      <text
        content={`◆ ${translateUi("ITENS FORA DE SINCRONIA")}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <text
        content={`${translateUi("Novo")}: ${counts.add} · ${translateUi("Alterado")}: ${counts.update} · ${translateUi("Removido")}: ${counts.delete} · ${translateUi("Conflito")}: ${counts.conflict}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <text
        content={truncateDisplay(preview.localPath, Math.max(1, width - 4))}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
      />
      {preview.hasLocalChanges && (
        <text
          content={translateUi(
            "As alterações locais destacadas serão substituídas pelo projeto remoto.",
          )}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
        />
      )}
      <scrollbox
        ref={list}
        id="terminal-project-sync-changes"
        scrollY
        viewportCulling
        onSizeChange={function (this: BoxRenderable) {
          setListWidth((current) => (current === this.width ? current : this.width))
        }}
        style={{ flexGrow: 1, minHeight: 1, border: ["top", "bottom"], borderColor: COLORS.border }}
      >
        {preview.changes.map((change, index) => {
          const label = changeLabel(change)
          const statusWidth = 12
          return (
            <box
              key={`${change.path}\0${change.action}`}
              id={`terminal-project-sync-change-${index}`}
              style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
            >
              <text
                content={label.padEnd(statusWidth)}
                wrapMode="none"
                style={{ width: statusWidth, flexShrink: 0, fg: changeColor(change) }}
              />
              <text
                content={displayPath(change.path, Math.max(1, listWidth - statusWidth))}
                wrapMode="none"
                style={{ flexGrow: 1, fg: COLORS.text }}
              />
            </box>
          )
        })}
      </scrollbox>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton
          id="terminal-project-sync-confirm-changes"
          compact
          label={
            preview.hasLocalChanges ? "[Enter] Substituir e sincronizar" : "[Enter] Sincronizar"
          }
          onPress={onConfirm}
        />
        <TerminalInlineButton
          id="terminal-project-sync-cancel-changes"
          compact
          label="[Esc] Cancelar"
          onPress={onClose}
        />
      </box>
    </ModalSurface>
  )
}
