import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import type { RemoteProjectSyncChange, RemoteProjectSyncReview } from "../model/remote-project-sync"
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
  review,
  onPage,
  onConfirm,
  onClose,
}: {
  review: RemoteProjectSyncReview
  onPage: (offset: number) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(24, Math.min(96, dimensions.width - 2))
  const height = Math.max(8, Math.min(28, dimensions.height - 2))
  const [listWidth, setListWidth] = useState(width - 4)
  const previousOffset = Math.max(0, review.offset - review.pageSize)
  const pageEnd = review.offset + review.changes.length
  const nextOffset = review.offset + review.pageSize
  const hasPrevious = review.offset > 0
  const hasNext = pageEnd < review.changeCount
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
    } else if (["left", "pageup"].includes(name) && hasPrevious) {
      consume(key)
      onPage(previousOffset)
    } else if (["right", "pagedown"].includes(name) && hasNext) {
      consume(key)
      onPage(nextOffset)
    }
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-project-sync-preview"
      width={width}
      height={height}
      borderColor={review.hasLocalChanges ? COLORS.warning : COLORS.terminal}
      zIndex={830}
      onBackdropPress={onClose}
    >
      <text
        content={`◆ ${translateUi("ITENS FORA DE SINCRONIA")}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <text
        content={`${translateUi("Novo")}: ${review.counts.add} · ${translateUi("Alterado")}: ${review.counts.update} · ${translateUi("Removido")}: ${review.counts.delete} · ${translateUi("Conflito")}: ${review.counts.conflict}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <text
        content={truncateDisplay(review.localPath, Math.max(1, width - 4))}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
      />
      {review.hasLocalChanges && (
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
        {review.changes.map((change, index) => {
          const label = changeLabel(change)
          const statusWidth = 12
          return (
            <box
              key={`${change.path}\0${change.action}`}
              id={`terminal-project-sync-change-${review.offset + index}`}
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
      <text
        content={`${review.offset + 1}–${Math.min(pageEnd, review.changeCount)} / ${review.changeCount}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton
          id="terminal-project-sync-confirm-changes"
          compact
          label={
            review.hasLocalChanges ? "[Enter] Substituir e sincronizar" : "[Enter] Sincronizar"
          }
          onPress={onConfirm}
        />
        {hasPrevious && (
          <TerminalInlineButton
            id="terminal-project-sync-previous-page"
            compact
            label="[←] Anterior"
            onPress={() => onPage(previousOffset)}
          />
        )}
        {hasNext && (
          <TerminalInlineButton
            id="terminal-project-sync-next-page"
            compact
            label="[→] Próxima"
            onPress={() => onPage(nextOffset)}
          />
        )}
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
