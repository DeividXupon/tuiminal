import { type BoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"

export function HttpInsecureTlsModal({
  approval,
  terminalWidth,
  terminalHeight,
  onConfirm,
  onClose,
}: {
  approval: HttpInsecureTlsApproval
  terminalWidth: number
  terminalHeight: number
  onConfirm: () => void
  onClose: () => void
}) {
  const modalRef = useRef<BoxRenderable | null>(null)
  const width = Math.min(78, Math.max(42, terminalWidth - 6))
  const height = 10
  useEffect(() => {
    const timer = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  return (
    <box
      ref={modalRef}
      id="http-insecure-tls-modal"
      focusable
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 140,
        ...panelBorder(COLORS.danger),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("CONFIRMAR TLS INSEGURO")} style={{ fg: COLORS.danger }} />
        <InlineButton label="[Esc] Cancelar" accent={COLORS.http} onPress={onClose} />
      </box>
      <text content={truncateDisplay(approval.target, width - 4)} style={{ fg: COLORS.text }} />
      <text
        content={`${translateUi("AMBIENTE")}  ${approval.environmentName ?? translateUi("Sem ambiente")}`}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={translateUi("A identidade do servidor não será verificada neste destino.")}
        style={{ fg: COLORS.warning }}
      />
      <text
        content={translateUi("A autorização vale somente para este destino e esta sessão.")}
        style={{ fg: COLORS.warning }}
      />
      <box style={{ flexGrow: 1 }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton
          id="http-insecure-tls-confirm"
          label="[I] Autorizar nesta sessão"
          accent={COLORS.danger}
          onPress={onConfirm}
        />
      </box>
    </box>
  )
}
