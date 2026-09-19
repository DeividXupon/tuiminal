import type { ReactNode } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

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
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the modal layer blocks pointer access to the workspace behind it. */}
      <box
        id="http-environment-manager-backdrop"
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          zIndex: 124,
        }}
      />
      <box
        id="http-environment-manager-modal"
        focusable
        style={{
          position: "absolute",
          left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
          top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
          width,
          height,
          zIndex: 125,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.http,
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text content={translateUi("AMBIENTES HTTP")} style={{ fg: COLORS.http }} />
          <InlineButton
            id="http-environment-close"
            label={closeLabel}
            accent={COLORS.http}
            onPress={onClose}
          />
        </box>
        {children}
      </box>
    </>
  )
}

export function HttpEnvironmentDeleteConfirm({
  name,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string
  error: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <box style={{ flexGrow: 1, justifyContent: "center" }}>
      <text
        content={translateUi("Excluir o ambiente {name}?").replace("{name}", name)}
        style={{ fg: COLORS.danger }}
      />
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box style={{ height: 1, flexDirection: "row" }}>
        <InlineButton
          id="http-environment-delete-cancel"
          label="[Esc] Cancelar"
          accent={COLORS.http}
          onPress={onCancel}
        />
        <InlineButton
          id="http-environment-delete-confirm"
          label="[Y] Excluir"
          accent={COLORS.danger}
          disabled={busy}
          onPress={onConfirm}
        />
      </box>
    </box>
  )
}
