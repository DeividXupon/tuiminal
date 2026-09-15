import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export function HttpDiscardDocumentModal({
  requestName,
  terminalWidth,
  terminalHeight,
  onConfirm,
  onClose,
}: {
  requestName: string
  terminalWidth: number
  terminalHeight: number
  onConfirm: () => void
  onClose: () => void
}) {
  const width = Math.min(68, Math.max(38, terminalWidth - 6))
  const height = 8
  return (
    <box
      id="http-discard-document-modal"
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 110,
        ...panelBorder(COLORS.danger),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("DESCARTAR ALTERAÇÕES?")} style={{ fg: COLORS.danger }} />
        <InlineButton label="[Esc] Voltar" accent={COLORS.http} onPress={onClose} />
      </box>
      <text content={truncateDisplay(requestName, width - 4)} style={{ fg: COLORS.text }} />
      <text
        content={translateUi("As alterações não salvas desta tab serão perdidas.")}
        style={{ fg: COLORS.warning }}
      />
      <box style={{ flexGrow: 1 }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton label="[D] Descartar e fechar" accent={COLORS.danger} onPress={onConfirm} />
      </box>
    </box>
  )
}
