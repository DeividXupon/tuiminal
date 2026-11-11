import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef } from "react"
import type { RemoteCodexTarget } from "../model/sessions"
import { RemoteProjectSyncActions, syncActionsStacked } from "./RemoteProjectSyncActions"
import { RemoteProjectSyncRoute } from "./RemoteProjectSyncRoute"

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

export function RemoteProjectSyncDialog({
  kind,
  localPath,
  remote,
  onConfirm,
  onClose,
}: {
  kind: "destination" | "replace"
  localPath: string
  remote?: RemoteCodexTarget | undefined
  onConfirm: () => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const details = useRef<ScrollBoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(76, dimensions.width - 2))
  const contentWidth = Math.max(1, width - 4)
  const label = kind === "replace" ? "[Enter] Substituir" : "[Enter] Sincronizar"
  const compact = dimensions.height < 18
  const height = Math.max(
    1,
    Math.min(
      dimensions.height - 2,
      compact
        ? 9 + Number(!!remote) + Number(syncActionsStacked(contentWidth, label))
        : dimensions.height - 2,
    ),
  )
  const content = (
    <>
      <text
        content={translateUi(
          kind === "replace"
            ? "A cópia local possui alterações. O remoto substituirá todo o conteúdo local."
            : "O projeto remoto será copiado integralmente para esta pasta:",
        )}
        wrapMode="word"
        style={{
          marginBottom: 1,
          flexShrink: 0,
          fg: kind === "replace" ? COLORS.warning : COLORS.muted,
        }}
      />
      <RemoteProjectSyncRoute
        localPath={localPath}
        remote={remote}
        width={contentWidth - Number(compact)}
      />
    </>
  )
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    if (key.name === "escape") {
      consume(key)
      onClose()
    } else if (key.name === "enter" || key.name === "return") {
      consume(key)
      onConfirm()
    } else if (["up", "down", "j", "k"].includes(key.name)) {
      consume(key)
      details.current?.scrollBy(key.name === "up" || key.name === "k" ? -1 : 1)
    }
  })
  return (
    <ModalSurface
      fitContent={!compact}
      dialogRef={dialog}
      id="terminal-project-sync-confirm"
      width={width}
      height={height}
      borderColor={kind === "replace" ? COLORS.warning : COLORS.border}
      zIndex={830}
      onBackdropPress={onClose}
    >
      <box id="terminal-project-sync-confirm-header" style={{ height: 1, flexShrink: 0 }}>
        <text
          content={translateUi(
            kind === "replace" ? "SUBSTITUIR CÓPIA LOCAL?" : "SINCRONIZAR PROJETO REMOTO?",
          )}
          wrapMode="none"
          style={{
            height: 1,
            flexShrink: 0,
            fg: kind === "replace" ? COLORS.warning : COLORS.text,
          }}
        />
      </box>
      {compact ? (
        <scrollbox ref={details} scrollY style={{ flexGrow: 1, minHeight: 0 }}>
          {content}
        </scrollbox>
      ) : (
        <box style={{ flexShrink: 0, marginTop: 1, marginBottom: 1 }}>{content}</box>
      )}
      <RemoteProjectSyncActions
        id="terminal-project-sync-confirm-actions"
        confirmId="terminal-project-sync-confirm-action"
        cancelId="terminal-project-sync-cancel-confirm"
        label={label}
        width={contentWidth}
        warning={kind === "replace"}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </ModalSurface>
  )
}
