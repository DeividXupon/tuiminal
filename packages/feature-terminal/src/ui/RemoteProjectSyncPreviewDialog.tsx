import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import type { RemoteProjectSyncChange, RemoteProjectSyncReview } from "../model/remote-project-sync"
import { RemoteProjectSyncAutomaticControl } from "./RemoteProjectSyncAutomaticControl"
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
  automatic,
  onToggleAutomatic,
  onPage,
  onConfirm,
  onClose,
}: {
  review: RemoteProjectSyncReview
  automatic: boolean
  onToggleAutomatic: () => void
  onPage: (offset: number) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(88, dimensions.width - 6))
  const height = Math.max(1, Math.min(24, dimensions.height - 4))
  const [listWidth, setListWidth] = useState(Math.max(1, width - 4))
  const previousOffset = Math.max(0, review.offset - review.pageSize)
  const pageEnd = review.offset + review.changes.length
  const nextOffset = review.offset + review.pageSize
  const hasPrevious = review.offset > 0
  const hasNext = pageEnd < review.changeCount
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    const name = key.name.toLowerCase()
    if (name === "a") {
      consume(key)
      onToggleAutomatic()
    } else if (name === "escape") {
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
      <box
        style={{
          height: 2,
          flexShrink: 0,
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text
          content={`◆ ${translateUi("ITENS FORA DE SINCRONIA")}`}
          style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
        />
        <text wrapMode="none" style={{ height: 1, flexShrink: 0 }}>
          <span fg={COLORS.success}>{`${translateUi("Novo")}: ${review.counts.add}`}</span>
          <span fg={COLORS.muted}> · </span>
          <span fg={COLORS.warning}>{`${translateUi("Alterado")}: ${review.counts.update}`}</span>
          <span fg={COLORS.muted}> · </span>
          <span fg={COLORS.danger}>{`${translateUi("Removido")}: ${review.counts.delete}`}</span>
          <span fg={COLORS.muted}> · </span>
          <span fg={COLORS.danger}>{`${translateUi("Conflito")}: ${review.counts.conflict}`}</span>
        </text>
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          backgroundColor: COLORS.panel,
        }}
      >
        <text
          content={`› ${truncateDisplay(review.localPath, Math.max(1, width - 6))}`}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
        />
      </box>
      {review.hasLocalChanges && (
        <box
          style={{
            height: 2,
            flexShrink: 0,
            backgroundColor: COLORS.diffModifiedBg,
          }}
        >
          <text
            content={`! ${translateUi(
              "As alterações locais destacadas serão substituídas pelo projeto remoto.",
            )}`}
            wrapMode="word"
            style={{ height: 2, flexShrink: 0, fg: COLORS.warning }}
          />
        </box>
      )}
      <scrollbox
        ref={list}
        id="terminal-project-sync-changes"
        scrollY
        viewportCulling
        onSizeChange={function (this: BoxRenderable) {
          setListWidth((current) => (current === this.width ? current : this.width))
        }}
        style={{
          flexGrow: 1,
          minHeight: 3,
          border: true,
          borderColor: COLORS.border,
          backgroundColor: COLORS.canvas,
        }}
      >
        {review.changes.map((change, index) => {
          const label = changeLabel(change)
          const statusWidth = 11
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
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={`${review.offset + 1}–${Math.min(pageEnd, review.changeCount)} / ${review.changeCount}`}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row", gap: 1 }}>
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
        </box>
      </box>
      <RemoteProjectSyncAutomaticControl automatic={automatic} onToggle={onToggleAutomatic} />
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <TerminalInlineButton
          id="terminal-project-sync-confirm-changes"
          compact
          accent={review.hasLocalChanges ? COLORS.warning : COLORS.terminal}
          label={
            review.hasLocalChanges ? "[Enter] Substituir e sincronizar" : "[Enter] Sincronizar"
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
