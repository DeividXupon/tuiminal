import type { BoxRenderable } from "@opentui/core"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"

export function HttpDiscardDocumentModal({
  title = "DESCARTAR ALTERAÇÕES?",
  description = "As alterações não salvas desta tab serão perdidas.",
  confirmDisabled = false,
  confirmLabel = "[D] Descartar e fechar",
  requestName,
  terminalWidth,
  terminalHeight,
  onConfirm,
  onClose,
}: {
  title?: string
  description?: string
  confirmDisabled?: boolean
  confirmLabel?: string
  requestName: string
  terminalWidth: number
  terminalHeight: number
  onConfirm: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<BoxRenderable | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  const width = Math.max(1, Math.min(72, terminalWidth - 2))
  return (
    <HttpDialog
      fitContent
      scrollContent
      id="http-discard-document-modal"
      dialogRef={dialogRef}
      title={title}
      width={width}
      height={terminalHeight < 20 ? 10 : terminalHeight - 2}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      closeLabel="[Esc] Voltar"
      accent={COLORS.danger}
      actions={[
        {
          id: "http-discard-document-confirm",
          label: confirmLabel,
          disabled: confirmDisabled,
          accent: COLORS.danger,
          onPress: onConfirm,
        },
      ]}
    >
      <box style={{ flexShrink: 0, gap: 1 }}>
        <HttpDialogSection accent={COLORS.danger}>
          <text
            content={truncateDisplay(requestName, width - 7)}
            wrapMode="none"
            style={{ height: 1, fg: COLORS.text }}
          />
        </HttpDialogSection>
        <HttpDialogNotice text={description} warning />
      </box>
    </HttpDialog>
  )
}
