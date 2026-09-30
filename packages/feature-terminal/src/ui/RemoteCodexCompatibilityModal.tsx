import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef } from "react"
import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"

const REASON_MESSAGES = {
  localCodexMissing: "O Codex não está instalado nesta máquina.",
  localVersionInvalid: "A versão local do Codex não pôde ser identificada.",
  remoteCodexMissing: "O Codex não está instalado no servidor remoto.",
  remoteVersionInvalid: "A versão remota do Codex não pôde ser identificada.",
  localOpenCodeMissing: "O OpenCode não está instalado nesta máquina.",
  localOpenCodeVersionInvalid: "A versão local do OpenCode não pôde ser identificada.",
  remoteOpenCodeMissing: "O OpenCode não está instalado no servidor remoto.",
  remoteOpenCodeVersionInvalid: "A versão remota do OpenCode não pôde ser identificada.",
  daemonUnavailable: "O Codex remoto não oferece app-server daemon.",
  proxyUnavailable: "O Codex remoto não oferece app-server proxy.",
  versionMismatch: "As versões local e remota do Codex são incompatíveis.",
} as const

export function RemoteCodexCompatibilityModal({
  report,
  profileName,
  onCancel,
  onOpenGuide,
}: {
  report: RemoteCodexCompatibilityReport
  profileName: string
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
  const reason =
    openCode && (report.reason ?? "versionMismatch") === "versionMismatch"
      ? "As versões local e remota do OpenCode são incompatíveis."
      : REASON_MESSAGES[report.reason ?? "versionMismatch"]
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
      <text
        content={translateUi(openCode ? "◆ OPENCODE INCOMPATÍVEL" : "◆ CODEX INCOMPATÍVEL")}
        style={{ fg: COLORS.warning }}
      />
      <text content={translateUi(reason)} style={{ fg: COLORS.text }} />
      <text
        content={`${translateUi("Local")} · ${version(report.localVersion)}`}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={`${translateUi("Remoto")} · ${profileName} · ${version(report.remoteVersion)}`}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={translateUi(
          openCode
            ? "A API do OpenCode depende da versão usada nas duas máquinas."
            : "O protocolo do app-server é experimental e depende da versão.",
        )}
        style={{ fg: COLORS.muted }}
      />
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
