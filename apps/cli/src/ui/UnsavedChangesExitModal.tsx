import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
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
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={300}
      alignItems="center"
      justifyContent="center"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI has no dialog role and this focusable box owns modal keyboard input. */}
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
          width,
          maxHeight: Math.max(1, terminalHeight - 2),
          zIndex: 300,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          content={translateUi("SAIR COM ALTERAÇÕES NÃO SALVAS?")}
          style={{ fg: COLORS.text }}
        />
        <text
          content={translateUi("Há requests HTTP modificados. Se sair agora, eles serão perdidos.")}
          style={{ fg: COLORS.muted }}
        />
        <box style={{ flexGrow: 1 }} />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
          <InlineButton label="[Esc] Continuar editando" accent={COLORS.http} onPress={onClose} />
          <InlineButton label="[Q] Sair sem salvar" accent={COLORS.danger} onPress={onConfirm} />
        </box>
      </box>
    </box>
  )
}
