import type { BoxRenderable, KeyEvent } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef } from "react"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import { RemoteProjectSyncAutomaticControl } from "./RemoteProjectSyncAutomaticControl"
import { TerminalInlineButton } from "./TerminalShortcut"

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function phaseLabel(status: RemoteProjectSyncStatus | undefined) {
  if (status?.kind === "cancelling") return translateUi("Cancelando e restaurando a cópia local…")
  if (status?.kind === "checking") {
    if (status.phase === "local") return translateUi("Verificando a cópia local…")
    if (status.phase === "comparing") return translateUi("Comparando os arquivos…")
    return translateUi("Verificando o projeto remoto…")
  }
  if (status?.kind === "syncing") {
    if (status.phase === "applying") return translateUi("Aplicando as alterações…")
    if (status.phase === "verifying") return translateUi("Validando a cópia sincronizada…")
    if (status.phase === "rolling-back") return translateUi("Restaurando a cópia local…")
    return translateUi("Transferindo os arquivos alterados…")
  }
  return translateUi("Preparando a sincronização…")
}

export function RemoteProjectSyncProgressDialog({
  localPath,
  status,
  automatic,
  onToggleAutomatic,
  onCancel,
}: {
  localPath: string
  status?: RemoteProjectSyncStatus | undefined
  automatic: boolean
  onToggleAutomatic: () => void
  onCancel: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(68, dimensions.width - 6))
  const height = Math.max(1, Math.min(12, dimensions.height - 4))
  const progress = status?.kind === "syncing" ? status.progress : null
  const cancelling = status?.kind === "cancelling"
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    const name = key.name.toLowerCase()
    if (name === "a") {
      consume(key)
      onToggleAutomatic()
    } else if (name === "escape") {
      consume(key)
      if (!cancelling) onCancel()
    }
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-project-sync-progress"
      width={width}
      height={height}
      borderColor={cancelling ? COLORS.warning : COLORS.terminal}
      zIndex={830}
      onBackdropPress={() => {
        if (!cancelling) onCancel()
      }}
    >
      <box style={{ height: 1, flexShrink: 0, backgroundColor: COLORS.panelRaised }}>
        <text
          content={`◆ ${translateUi("SINCRONIZAÇÃO DO PROJETO")}`}
          style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
        />
      </box>
      <box style={{ flexGrow: 1, minHeight: 4 }}>
        <text
          content={phaseLabel(status)}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
        />
        <text
          content={`› ${truncateDisplay(localPath, Math.max(1, width - 6))}`}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
        />
        <box
          style={{
            position: "relative",
            height: 1,
            flexShrink: 0,
            backgroundColor: COLORS.panelRaised,
            overflow: "hidden",
          }}
        >
          <box
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: Math.max(1, Math.round((progress ?? 0.08) * Math.max(1, width - 4))),
              height: 1,
              backgroundColor: COLORS.terminal,
              opacity: 0.35,
            }}
          />
          <text
            content={progress === null ? " …" : ` ${Math.round(progress * 100)}%`}
            wrapMode="none"
            style={{ position: "absolute", left: 0, top: 0, height: 1, fg: COLORS.text }}
          />
        </box>
      </box>
      <RemoteProjectSyncAutomaticControl automatic={automatic} onToggle={onToggleAutomatic} />
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "flex-end",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <TerminalInlineButton
          id="terminal-project-sync-cancel-progress"
          compact
          disabled={cancelling}
          label={cancelling ? "Cancelando…" : "[Esc] Cancelar"}
          onPress={onCancel}
        />
      </box>
    </ModalSurface>
  )
}
