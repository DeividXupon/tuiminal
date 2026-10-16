import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"

export function DatabaseQueryNotice({
  writeConfirmation,
  queryError,
}: {
  writeConfirmation: { command: string } | null
  queryError: string
}) {
  return writeConfirmation ? (
    <box
      style={{
        minHeight: 3,
        flexShrink: 0,
        border: true,
        borderStyle: "rounded",
        borderColor: COLORS.warning,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        content={`⚠ ${translateUi("CONFIRMAR")} ${writeConfirmation.command}`}
        style={{ fg: COLORS.warning }}
      />
      <text
        content={translateUi(
          "Este comando pode alterar o banco. Execute novamente para confirmar.",
        )}
        style={{ fg: COLORS.text }}
      />
    </box>
  ) : queryError ? (
    <box
      style={{
        minHeight: 3,
        flexShrink: 0,
        border: true,
        borderStyle: "rounded",
        borderColor: COLORS.danger,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text content={translateUi("ERRO SQL")} style={{ fg: COLORS.danger }} />
      <text content={translateUi(queryError)} style={{ fg: COLORS.text }} />
    </box>
  ) : null
}
