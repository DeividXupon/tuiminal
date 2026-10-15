import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { FEATURE_PRESENTATIONS } from "./presentation"
import type { FeatureId } from "./model"

export function FeatureUninstallModal({
  id,
  onConfirm,
  onClose,
}: {
  id: FeatureId
  onConfirm: () => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const dispatched = useRef(false)
  const confirm = () => {
    if (dispatched.current) return
    dispatched.current = true
    onConfirm()
  }
  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    dialog.current?.focus()
  }, [renderer])
  useKeyboard((key) => {
    if (key.defaultPrevented) return
    key.preventDefault()
    key.stopPropagation()
    if (key.ctrl || key.meta || key.option || key.shift || key.repeated) return
    if (key.name === "escape") onClose()
    else if (key.name === "y") confirm()
  })
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Native terminal overlay consumes backdrop mouse events.
    <box
      id="feature-uninstall-overlay"
      onMouseDown={(event) => {
        event.stopPropagation()
        if (event.target?.id === "feature-uninstall-overlay") onClose()
      }}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        zIndex: 200,
        backgroundColor: "#00000099",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <box
        ref={dialog}
        id="feature-uninstall-dialog"
        focusable
        style={{
          width: Math.min(62, terminal.width - 4),
          border: true,
          borderColor: COLORS.danger,
          backgroundColor: COLORS.panelRaised,
          padding: 1,
          gap: 1,
        }}
      >
        <text
          content={`${translateUi("Desinstalar ferramenta")} · ${FEATURE_PRESENTATIONS[id].title}`}
          style={{ fg: COLORS.danger }}
        />
        <text
          content={translateUi(
            "As sessões desta ferramenta serão encerradas e alterações não salvas serão perdidas. Projetos e configurações serão mantidos.",
          )}
          style={{ fg: COLORS.text }}
        />
        <box style={{ flexDirection: "row", justifyContent: "flex-end", height: 1 }}>
          <InlineButton id="feature-uninstall-cancel" label="[Esc] Cancelar" onPress={onClose} />
          <InlineButton
            id="feature-uninstall-confirm"
            label="[Y] Desinstalar"
            accent={COLORS.danger}
            onPress={confirm}
          />
        </box>
      </box>
    </box>
  )
}
