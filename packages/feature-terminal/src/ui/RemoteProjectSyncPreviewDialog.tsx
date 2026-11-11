import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import type { RemoteProjectSyncChange, RemoteProjectSyncReview } from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import { RemoteProjectSyncActions, syncActionsStacked } from "./RemoteProjectSyncActions"
import {
  RemoteProjectSyncAutomaticControl,
  RemoteProjectSyncAutomaticHint,
} from "./RemoteProjectSyncAutomaticControl"
import { RemoteProjectSyncRoute } from "./RemoteProjectSyncRoute"
import { TerminalInlineButton, TerminalShortcutText } from "./TerminalShortcut"

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
  if (change.action === "delete") return COLORS.warning
  return COLORS.terminal
}

function displayPath(path: string, width: number) {
  return truncateDisplay(path.replace(/[\p{Cc}\p{Cf}]/gu, ""), width)
}

export function RemoteProjectSyncPreviewDialog({
  review,
  remote,
  automatic,
  onToggleAutomatic,
  onPage,
  onConfirm,
  onClose,
  inactive = false,
}: {
  review: RemoteProjectSyncReview
  remote?: RemoteCodexTarget | undefined
  automatic: boolean
  onToggleAutomatic: () => void
  onPage: (offset: number) => void
  onConfirm: () => void
  onClose: () => void
  /** Renders without taking focus or keyboard input, as in simulated tutorials. */
  inactive?: boolean
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(88, dimensions.width - 2))
  const contentWidth = Math.max(1, width - 4)
  const compact = dimensions.height < 22
  const label = review.hasLocalChanges ? "[Enter] Substituir e sincronizar" : "[Enter] Sincronizar"
  const stacked = syncActionsStacked(contentWidth, label)
  const counts = [
    { label: "Novo", value: review.counts.add, color: COLORS.success },
    { label: "Alterado", value: review.counts.update, color: COLORS.terminal },
    { label: "Removido", value: review.counts.delete, color: COLORS.warning },
    { label: "Conflito", value: review.counts.conflict, color: COLORS.danger },
  ]
  const countWidth =
    Math.max(...counts.map((item) => displayWidth(`${translateUi(item.label)} ${item.value}`))) + 2
  const countRows = countWidth * 4 > contentWidth - 1 ? 2 : 1
  const statusWidth =
    Math.max(
      ...["Novo", "Alterado", "Removido", "Conflito"].map((label) =>
        displayWidth(translateUi(label)),
      ),
    ) + 2
  const height = Math.max(
    1,
    Math.min(
      26,
      dimensions.height - 2,
      13 +
        Number(!!remote) +
        countRows +
        Number(stacked) +
        Math.max(1, review.changes.length) +
        (review.hasLocalChanges ? 2 : 0),
    ),
  )
  const [listWidth, setListWidth] = useState(Math.max(1, width - 4))
  const previousOffset = Math.max(0, review.offset - review.pageSize)
  const pageEnd = review.offset + review.changes.length
  const nextOffset = review.offset + review.pageSize
  const hasPrevious = review.offset > 0
  const hasNext = pageEnd < review.changeCount
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  // biome-ignore lint/correctness/useExhaustiveDependencies: each fetched page begins at its first row.
  useEffect(() => {
    list.current?.scrollTo(0)
  }, [review.offset])
  const handleKey = (key: Parameters<Parameters<typeof useKeyboard>[0]>[0]) => {
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
  }
  useKeyboard((key) => {
    if (!inactive) handleKey(key)
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-project-sync-preview"
      width={width}
      height={height}
      borderColor={review.hasLocalChanges ? COLORS.warning : COLORS.border}
      zIndex={830}
      onBackdropPress={() => {
        if (!inactive) onClose()
      }}
    >
      <box
        id="terminal-project-sync-preview-header"
        style={{
          height: 1,
          flexShrink: 0,
        }}
      >
        <text
          content={translateUi("ITENS FORA DE SINCRONIA")}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
        />
      </box>
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
          minHeight: 1,
          marginTop: compact ? 0 : 1,
        }}
      >
        {review.hasLocalChanges && (
          <box
            id="terminal-project-sync-preview-warning"
            style={{ flexShrink: 0, marginBottom: compact ? 0 : 1 }}
          >
            <text
              content={translateUi(
                "As alterações locais destacadas serão substituídas pelo projeto remoto.",
              )}
              wrapMode="word"
              style={{ flexShrink: 0, fg: COLORS.warning }}
            />
          </box>
        )}
        <box
          id="terminal-project-sync-preview-path"
          style={{ flexShrink: 0, marginBottom: compact ? 0 : 1 }}
        >
          <RemoteProjectSyncRoute
            localPath={review.localPath}
            remote={remote}
            width={listWidth - 1}
          />
        </box>
        <box id="terminal-project-sync-counts" style={{ height: countRows, flexShrink: 0 }}>
          {(countRows === 1 ? [counts] : [counts.slice(0, 2), counts.slice(2)]).map((row) => (
            <box
              key={row.map((item) => item.label).join("-")}
              style={{ height: 1, flexDirection: "row" }}
            >
              {row.map((item) => (
                <text
                  key={item.label}
                  content={`${translateUi(item.label)} ${item.value}`}
                  wrapMode="none"
                  style={{
                    width: countRows === 1 ? "25%" : "50%",
                    fg: item.value ? item.color : COLORS.muted,
                  }}
                />
              ))}
            </box>
          ))}
        </box>
        {compact && automatic && <RemoteProjectSyncAutomaticHint automatic={automatic} />}
        {review.changes.map((change, index) => {
          const label = changeLabel(change)
          return (
            <box
              key={`${change.path}\0${change.action}`}
              id={`terminal-project-sync-change-${review.offset + index}`}
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: index % 2 === 0 ? COLORS.panel : COLORS.canvas,
              }}
            >
              <text
                content={label}
                wrapMode="none"
                style={{ width: statusWidth, flexShrink: 0, fg: changeColor(change) }}
              />
              <text
                content={displayPath(change.path, Math.max(1, listWidth - statusWidth - 1))}
                wrapMode="none"
                style={{ flexGrow: 1, fg: COLORS.text }}
              />
            </box>
          )
        })}
        {compact && !automatic && <RemoteProjectSyncAutomaticHint automatic={automatic} />}
      </scrollbox>
      <box
        id="terminal-project-sync-pagination"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={`${review.changeCount ? review.offset + 1 : 0}–${Math.min(pageEnd, review.changeCount)} / ${review.changeCount}`}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
        <TerminalShortcutText content="[↑/↓]" style={{ fg: COLORS.muted }} />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row", gap: 1 }}>
          {hasPrevious && (
            <TerminalInlineButton
              id="terminal-project-sync-previous-page"
              compact
              label={contentWidth >= 64 ? "[←] Anterior" : "[←]"}
              disabled={inactive}
              onPress={() => onPage(previousOffset)}
            />
          )}
          {hasNext && (
            <TerminalInlineButton
              id="terminal-project-sync-next-page"
              compact
              label={contentWidth >= 64 ? "[→] Próxima" : "[→]"}
              disabled={inactive}
              onPress={() => onPage(nextOffset)}
            />
          )}
        </box>
      </box>
      <box style={{ flexShrink: 0, marginTop: compact ? 0 : 1, marginBottom: compact ? 0 : 1 }}>
        <RemoteProjectSyncAutomaticControl
          automatic={automatic}
          onToggle={onToggleAutomatic}
          compact={compact}
          inactive={inactive}
        />
      </box>
      <RemoteProjectSyncActions
        id="terminal-project-sync-preview-actions"
        confirmId="terminal-project-sync-confirm-changes"
        cancelId="terminal-project-sync-cancel-changes"
        label={label}
        width={contentWidth}
        warning={review.hasLocalChanges}
        inactive={inactive}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </ModalSurface>
  )
}
