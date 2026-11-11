import type { BoxRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef } from "react"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  RemoteProjectSyncAutomaticControl,
  RemoteProjectSyncAutomaticHint,
} from "./RemoteProjectSyncAutomaticControl"
import { RemoteProjectSyncRoute } from "./RemoteProjectSyncRoute"
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
  remote,
  status,
  automatic,
  onToggleAutomatic,
  onCancel,
  inactive = false,
}: {
  localPath: string
  remote?: RemoteCodexTarget | undefined
  status?: RemoteProjectSyncStatus | undefined
  automatic: boolean
  onToggleAutomatic: () => void
  onCancel: () => void
  /** Renders without taking focus or keyboard input, as in simulated tutorials. */
  inactive?: boolean
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const details = useRef<ScrollBoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(76, dimensions.width - 2))
  const compact = dimensions.height < 20
  const height = Math.max(
    1,
    Math.min(dimensions.height - 2, compact ? 13 + Number(!!remote) : dimensions.height - 2),
  )
  const progress = status?.kind === "syncing" ? status.progress : null
  const cancelling = status?.kind === "cancelling"
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  useKeyboard((key) => {
    if (inactive) return
    const name = key.name.toLowerCase()
    if (name === "a") {
      consume(key)
      onToggleAutomatic()
    } else if (name === "escape") {
      consume(key)
      if (!cancelling) onCancel()
    } else if (["up", "down", "j", "k"].includes(name)) {
      consume(key)
      details.current?.scrollBy(name === "up" || name === "k" ? -1 : 1)
    }
  })
  return (
    <ModalSurface
      fitContent={!compact}
      dialogRef={dialog}
      id="terminal-project-sync-progress"
      width={width}
      height={height}
      borderColor={cancelling ? COLORS.warning : COLORS.border}
      zIndex={830}
      onBackdropPress={() => {
        if (!cancelling && !inactive) onCancel()
      }}
    >
      <box id="terminal-project-sync-progress-header" style={{ height: 1, flexShrink: 0 }}>
        <text
          content={translateUi("SINCRONIZAÇÃO DO PROJETO")}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
        />
      </box>
      {compact ? (
        <scrollbox ref={details} scrollY style={{ flexGrow: 1, minHeight: 0 }}>
          <RemoteProjectSyncRoute localPath={localPath} remote={remote} width={width - 5} />
          <RemoteProjectSyncAutomaticHint automatic={automatic} />
        </scrollbox>
      ) : (
        <box style={{ flexShrink: 0, marginTop: 1, marginBottom: 1 }}>
          <RemoteProjectSyncRoute localPath={localPath} remote={remote} width={width - 4} />
        </box>
      )}
      <box
        id="terminal-project-sync-progress-status"
        style={{ flexShrink: 0, marginBottom: compact ? 0 : 1 }}
      >
        <text
          content={phaseLabel(status)}
          wrapMode="word"
          style={{ flexShrink: 0, fg: cancelling ? COLORS.warning : COLORS.text }}
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
              backgroundColor: cancelling ? COLORS.warning : COLORS.terminal,
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
      <RemoteProjectSyncAutomaticControl
        automatic={automatic}
        onToggle={onToggleAutomatic}
        compact={compact}
        inactive={inactive}
      />
      <box
        id="terminal-project-sync-progress-actions"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        <TerminalInlineButton
          id="terminal-project-sync-cancel-progress"
          compact
          disabled={cancelling || inactive}
          label={cancelling ? "Cancelando…" : "[Esc] Cancelar"}
          onPress={onCancel}
        />
      </box>
    </ModalSurface>
  )
}
