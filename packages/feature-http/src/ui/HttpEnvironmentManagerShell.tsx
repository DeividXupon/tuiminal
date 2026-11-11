import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { ReactNode } from "react"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"
import { HttpDialogFooter, httpDialogActionRows } from "./HttpDialogFooter"

export function HttpEnvironmentManagerShell({
  terminalWidth,
  terminalHeight,
  width,
  height,
  onClose,
  closeLabel,
  children,
}: {
  terminalWidth: number
  terminalHeight: number
  width: number
  height: number
  onClose: () => void
  closeLabel: string
  children: ReactNode
}) {
  return (
    <HttpDialog
      id="http-environment-manager-modal"
      title="AMBIENTES HTTP"
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      zIndex={125}
      onClose={onClose}
      closeLabel={closeLabel}
      closeId="http-environment-close"
    >
      {children}
    </HttpDialog>
  )
}

export function HttpEnvironmentDeleteConfirm({
  name,
  error,
  busy,
  width,
  onCancel,
  onConfirm,
}: {
  name: string
  error: string
  busy: boolean
  width: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <box style={{ flexGrow: 1, minHeight: 0 }}>
      <scrollbox scrollY style={{ flexGrow: 1, minHeight: 0 }}>
        <box style={{ flexShrink: 0, gap: 1 }}>
          <HttpDialogSection accent={COLORS.danger}>
            <text
              content={translateUi("Excluir o ambiente {name}?").replace("{name}", name)}
              style={{ fg: COLORS.danger }}
            />
          </HttpDialogSection>
          <HttpDialogNotice text="O ambiente e suas variáveis serão excluídos." warning />
          {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
        </box>
      </scrollbox>
      <HttpDialogFooter
        id="http-environment-delete"
        closeId="http-environment-delete-cancel"
        rows={httpDialogActionRows(width, [
          { id: "http-environment-delete-cancel", label: "[Esc] Cancelar", onPress: onCancel },
          {
            id: "http-environment-delete-confirm",
            label: "[Y] Excluir",
            accent: COLORS.danger,
            disabled: busy,
            onPress: onConfirm,
          },
        ])}
      />
    </box>
  )
}
