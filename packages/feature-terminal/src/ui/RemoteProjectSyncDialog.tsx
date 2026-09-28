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
  const width = Math.max(1, Math.min(78, dimensions.width - 2))
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
      height={Math.max(1, Math.min(9, dimensions.height - 2))}
      borderColor={kind === "replace" ? COLORS.warning : COLORS.terminal}
      zIndex={830}
      onBackdropPress={onClose}
    >
      <text
        content={`◆ ${translateUi(kind === "replace" ? "SUBSTITUIR CÓPIA LOCAL?" : "SINCRONIZAR PROJETO REMOTO?")}`}
        style={{
          height: 1,
          flexShrink: 0,
          fg: kind === "replace" ? COLORS.warning : COLORS.terminal,
        }}
      />
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
        content={truncateDisplay(localPath, Math.max(1, width - 4))}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalInlineButton
          compact
          label={kind === "replace" ? "[Enter] Substituir" : "[Enter] Sincronizar"}
          onPress={onConfirm}
        />
        <TerminalInlineButton compact label="[Esc] Cancelar" onPress={onClose} />
      </box>
    </ModalSurface>
  )
}
