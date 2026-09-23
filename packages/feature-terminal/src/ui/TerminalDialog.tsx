import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

export type TerminalDialogKind = "command" | "rename"
const TITLES = {
  command: "Novo comando",
  rename: "Renomear terminal",
}
export function TerminalDialog({
  kind,
  initialValue,
  onSave,
  onClose,
}: {
  kind: TerminalDialogKind
  initialValue: string
  onSave: (value: string) => void
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const ref = useRef<InputRenderable | null>(null)
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const submit = () => {
    if (value.trim()) onSave(value.trim())
  }
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    }
  })
  return (
    <ModalSurface
      dialogRef={dialogRef}
      id="terminal-dialog"
      width={Math.max(1, Math.min(64, dimensions.width - 2))}
      height={Math.min(dimensions.height, 7)}
      borderColor={COLORS.terminal}
      zIndex={800}
      onBackdropPress={onClose}
    >
      <text content={translateUi(TITLES[kind])} style={{ height: 1, fg: COLORS.terminal }} />
      <input
        ref={ref}
        id="terminal-command-input"
        value={value}
        onInput={setValue}
        onSubmit={submit}
        onMouseDown={() => ref.current?.focus()}
        width="100%"
        style={{
          backgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      <box style={{ height: 1, flexDirection: "row", flexShrink: 0 }}>
        <InlineButton compact label="[Enter] Salvar" onPress={submit} />
        <InlineButton compact label="[Esc] Cancelar" onPress={onClose} />
      </box>
    </ModalSurface>
  )
}
