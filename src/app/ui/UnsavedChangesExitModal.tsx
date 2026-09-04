import { COLORS, panelBorder } from "../../core/settings/theme"
import { translateUi } from "../../shared/i18n/index"
import { InlineButton } from "../../shared/ui/InlineButton"
import type { BoxRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"

export function UnsavedChangesExitModal({
  open,
  terminalWidth,
  terminalHeight,
  onConfirm,
  onClose,
}: {
  open: boolean
  terminalWidth: number
  terminalHeight: number
  onConfirm: () => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const modalRef = useRef<BoxRenderable | null>(null)
  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    const timer = setTimeout(() => modalRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open, renderer])
  if (!open) return null
  const width = Math.min(72, Math.max(40, terminalWidth - 6))
  const height = 8
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI has no dialog role and this focusable box owns modal keyboard input.
    <box
      ref={modalRef}
      id="unsaved-changes-exit-modal"
      focusable
      onKeyDown={(key) => {
        key.preventDefault()
        key.stopPropagation()
        const name = key.name.toLowerCase()
        if (name === "escape") onClose()
        else if (name === "q") onConfirm()
      }}
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 300,
        ...panelBorder(COLORS.danger),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        content={translateUi("SAIR COM ALTERAÇÕES NÃO SALVAS?")}
        style={{ fg: COLORS.danger }}
      />
      <text
        content={translateUi("Há requests HTTP modificados. Se sair agora, eles serão perdidos.")}
        style={{ fg: COLORS.warning }}
      />
      <box style={{ flexGrow: 1 }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton label="[Esc] Continuar editando" accent={COLORS.http} onPress={onClose} />
        <InlineButton label="[Q] Sair sem salvar" accent={COLORS.danger} onPress={onConfirm} />
      </box>
    </box>
  )
}
