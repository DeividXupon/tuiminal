import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef } from "react"
import {
  type RemoteCodexCompatibilityReport,
  remoteCodexCompatibilityMessage,
} from "../model/remote-codex"

export function RemoteCodexCompatibilityModal({
  report,
  profileName,
  onCancel,
  onOpenGuide,
}: {
  report: RemoteCodexCompatibilityReport
  profileName?: string
  onCancel: () => void
  onOpenGuide: () => void
}) {
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    if (key.name !== "escape" && key.name !== "enter" && key.name !== "return") return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onCancel()
    else onOpenGuide()
  })
  const version = (value: string | null) => value ?? translateUi("não detectada")
  const openCode = report.providerId === "opencode"
  const claude = report.providerId === "claude"
  const reason = remoteCodexCompatibilityMessage(report)
  const title = claude
    ? "◆ CLAUDE CODE INCOMPATÍVEL"
    : openCode
      ? "◆ OPENCODE INCOMPATÍVEL"
      : "◆ CODEX INCOMPATÍVEL"
  const detail = claude
    ? "A integração requer Claude Code 2.1.63 ou superior."
    : openCode && profileName
      ? "A API do OpenCode depende da versão usada nas duas máquinas."
      : openCode
        ? "A integração requer uma versão válida do OpenCode."
        : "O protocolo do app-server é experimental e depende da versão."
  return (
    <ModalSurface
      dialogRef={dialog}
      id="remote-codex-compatibility-modal"
      width={Math.max(1, Math.min(72, dimensions.width - 2))}
      height={Math.max(1, Math.min(11, dimensions.height - 2))}
      zIndex={950}
      borderColor={COLORS.warning}
      onBackdropPress={onCancel}
      positionRelative
    >
      <text content={translateUi(title)} style={{ fg: COLORS.warning }} />
      <text content={translateUi(reason)} style={{ fg: COLORS.text }} />
      <text
        content={`${translateUi("Local")} · ${version(report.localVersion)}`}
        style={{ fg: COLORS.muted }}
      />
      {profileName && (
        <text
          content={`${translateUi("Remoto")} · ${profileName} · ${version(report.remoteVersion)}`}
          style={{ fg: COLORS.muted }}
        />
      )}
      <text content={translateUi(detail)} style={{ fg: COLORS.muted }} />
      <box style={{ flexGrow: 1 }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="remote-codex-compatibility-cancel"
          label="[Esc] Cancelar"
          accent={COLORS.terminal}
          onPress={onCancel}
        />
        <InlineButton
          id="remote-codex-compatibility-guide"
          label="[Enter] Abrir guia de atualização"
          accent={COLORS.warning}
          onPress={onOpenGuide}
        />
      </box>
    </ModalSurface>
  )
}
