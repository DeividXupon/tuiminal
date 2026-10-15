import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { DatabaseTable } from "../model/types"

import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"

export function DatabaseTableSearchModal({
  open,
  table,
  initialValue,
  onClose,
  onApply,
}: {
  open: boolean
  table: DatabaseTable
  initialValue: string
  onClose: () => void
  onApply: (value: string) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const modalRef = useRef<BoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const valueRef = useRef(initialValue)
  const [value, setValue] = useState(initialValue)
  const width = Math.max(1, Math.min(72, terminal.width - 4))

  const apply = useCallback(() => {
    onApply(valueRef.current.trim())
  }, [onApply])

  const clear = useCallback(() => {
    valueRef.current = ""
    setValue("")
    onApply("")
  }, [onApply])

  useEffect(() => {
    if (!open) return
    valueRef.current = initialValue
    setValue(initialValue)
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [initialValue, open, renderer])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "database-table-search-value") {
        inputRef.current?.blur()
        modalRef.current?.focus()
      } else {
        onClose()
      }
      return
    }
    if (key.ctrl && key.name === "l") {
      key.preventDefault()
      key.stopPropagation()
      clear()
      return
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      apply()
      return
    }
    if (
      (key.name === "enter" || key.name === "return") &&
      renderer.currentFocusedRenderable?.id !== "database-table-search-value"
    ) {
      key.preventDefault()
      key.stopPropagation()
      inputRef.current?.focus()
    }
  })

  if (!open) return null

  return (
    <ModalSurface
      id="database-table-search-modal"
      dialogRef={modalRef}
      width={width}
      height={7}
      zIndex={980}
      borderColor={COLORS.database}
      backdropOpacity={0.9}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text content={translateUi("◆ BUSCAR NA TABELA")} style={{ fg: COLORS.database }} />
        <text
          content={truncateDisplay(
            `${table.schema}.${table.name}`,
            Math.max(8, Math.floor(width * 0.4)),
          )}
          style={{ fg: COLORS.muted }}
        />
      </box>
      <text
        content={translateUi("Busca similar em todas as colunas")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content=" ≈ " style={{ fg: COLORS.database }} />
        <input
          ref={inputRef}
          id="database-table-search-value"
          value={value}
          placeholder={translateUi("Digite para buscar…")}
          maxLength={240}
          width={Math.max(8, width - 8)}
          onMouseDown={() => inputRef.current?.focus()}
          onInput={(nextValue) => {
            valueRef.current = nextValue
            setValue(nextValue)
          }}
          onSubmit={apply}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.database,
            placeholderColor: COLORS.muted,
          }}
        />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton label="[Esc] Cancelar" accent={COLORS.muted} onPress={onClose} />
          <InlineButton label="[Ctrl+L] Limpar" accent={COLORS.warning} onPress={clear} />
        </box>
        <InlineButton label="[Enter] Buscar" accent={COLORS.success} onPress={apply} />
      </box>
    </ModalSurface>
  )
}
