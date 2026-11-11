import type { BoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"

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
  const width = Math.max(1, Math.min(78, terminalWidth - 2))
  useEffect(() => {
    const timer = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  return (
    <HttpDialog
      fitContent
      scrollContent
      id="http-insecure-tls-modal"
      title="CONFIRMAR TLS INSEGURO"
      width={width}
      height={terminalHeight - 2}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      dialogRef={modalRef}
      accent={COLORS.danger}
      zIndex={140}
      closeLabel="[Esc] Cancelar"
      onClose={onClose}
      actions={[
        {
          id: "http-insecure-tls-confirm",
          label: "[I] Autorizar nesta sessão",
          accent: COLORS.danger,
          onPress: onConfirm,
        },
      ]}
    >
      <HttpDialogSection title="DESTINO" accent={COLORS.danger}>
        <text
          content={approval.target}
          wrapMode="word"
          style={{ fg: COLORS.text, flexShrink: 0 }}
        />
        <text
          content={`${translateUi("AMBIENTE")}  ${approval.environmentName ?? translateUi("Sem ambiente")}`}
          style={{ fg: COLORS.muted }}
        />
      </HttpDialogSection>
      <box style={{ flexShrink: 0, gap: 1, marginTop: 1 }}>
        <HttpDialogNotice
          text="A identidade do servidor não será verificada neste destino."
          warning
        />
        <HttpDialogNotice text="A autorização vale somente para este destino e esta sessão." />
      </box>
    </HttpDialog>
  )
}
