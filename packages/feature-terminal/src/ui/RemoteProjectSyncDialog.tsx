import type { BoxRenderable, KeyEvent } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef } from "react"
import { TerminalInlineButton } from "./TerminalShortcut"

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

export function RemoteProjectSyncDialog({
  kind,
  localPath,
  onConfirm,
  onClose,
}: {
  kind: "destination" | "replace"
  localPath: string
  onConfirm: () => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(68, dimensions.width - 6))
  const height = Math.max(1, Math.min(10, dimensions.height - 4))
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    if (key.name === "escape") {
      consume(key)
      onClose()
    } else if (key.name === "enter" || key.name === "return") {
      consume(key)
      onConfirm()
    }
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-project-sync-confirm"
      width={width}
      height={height}
      borderColor={kind === "replace" ? COLORS.warning : COLORS.terminal}
      zIndex={830}
      onBackdropPress={onClose}
    >
      <box style={{ height: 1, flexShrink: 0, backgroundColor: COLORS.panelRaised }}>
        <text
          content={`◆ ${translateUi(kind === "replace" ? "SUBSTITUIR CÓPIA LOCAL?" : "SINCRONIZAR PROJETO REMOTO?")}`}
          style={{
            height: 1,
            flexShrink: 0,
            fg: kind === "replace" ? COLORS.warning : COLORS.terminal,
          }}
        />
      </box>
      <box style={{ flexGrow: 1, minHeight: 3 }}>
        <text
          content={translateUi(
            kind === "replace"
              ? "A cópia local possui alterações. O remoto substituirá todo o conteúdo local."
              : "O projeto remoto será copiado integralmente para esta pasta:",
          )}
          wrapMode="word"
          style={{ height: 2, flexShrink: 0, fg: COLORS.text }}
        />
        <text
          content={`› ${truncateDisplay(localPath, Math.max(1, width - 6))}`}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
        />
      </box>
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
          id="terminal-project-sync-confirm-action"
          compact
          accent={kind === "replace" ? COLORS.warning : COLORS.terminal}
          label={kind === "replace" ? "[Enter] Substituir" : "[Enter] Sincronizar"}
          onPress={onConfirm}
        />
        <TerminalInlineButton
          id="terminal-project-sync-cancel-confirm"
          compact
          label="[Esc] Cancelar"
          onPress={onClose}
        />
      </box>
    </ModalSurface>
  )
}
