import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { DatabaseColumn } from "../model/types"
import { coerceDatabaseCellValue } from "../services/database"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"

type DatabaseCellEditorProps = {
  open: boolean
  tableName: string
  column: DatabaseColumn | null
  value: unknown
  isNewRow: boolean
  batchRowCount?: number
  onClose: () => void
  onApply: (value: unknown) => void
}

function inputValue(value: unknown) {
  if (value === null || value === undefined) return ""
  if (value === "<mascarado>" || String(value).startsWith("<binário ")) return ""
  if (typeof value !== "object") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function DatabaseCellEditor({
  open,
  tableName,
  column,
  value,
  isNewRow,
  batchRowCount = 0,
  onClose,
  onApply,
}: DatabaseCellEditorProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const inputRef = useRef<InputRenderable | null>(null)
  const textRef = useRef(inputValue(value))
  const nullRef = useRef(value === null)
  const [text, setText] = useState(() => inputValue(value))
  const [isNull, setIsNull] = useState(value === null)
  const [validationError, setValidationError] = useState("")
  const batchEditing = batchRowCount > 0

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    const nextText = batchEditing ? "" : inputValue(value)
    const nextNull = !batchEditing && value === null
    textRef.current = nextText
    nullRef.current = nextNull
    setText(nextText)
    setIsNull(nextNull)
    setValidationError("")
    const timeout = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [batchEditing, open, renderer, value])

  useEffect(() => {
    if (!open) return
    return () => {
      if (renderer.currentFocusedRenderable?.id === "database-cell-editor-value") {
        renderer.currentFocusedRenderable.blur()
      }
    }
  }, [open, renderer])

  const apply = useCallback(() => {
    if (!column) return
    try {
      const nextValue = nullRef.current ? null : coerceDatabaseCellValue(column, textRef.current)
      setValidationError("")
      onApply(nextValue)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Valor inválido.")
    }
  }, [column, onApply])

  const toggleNull = useCallback(() => {
    if (!column?.nullable) return
    const next = !nullRef.current
    nullRef.current = next
    setIsNull(next)
  }, [column?.nullable])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    if (key.ctrl && key.name === "n" && column?.nullable) {
      key.preventDefault()
      toggleNull()
    }
  })

  if (!open || !column) return null
  const width = Math.max(1, Math.min(76, terminal.width - 2))
  const compact = width < 62
  const height = Math.max(1, Math.min(14, terminal.height))
  const masked =
    !batchEditing && (value === "<mascarado>" || String(value ?? "").startsWith("<binário "))

  return (
    <ModalSurface
      id="database-cell-editor-modal"
      width={width}
      height={height}
      zIndex={950}
      borderColor={isNewRow ? COLORS.runner : COLORS.warning}
      backdropOpacity={0.9}
      horizontalPadding={2}
      dialogFocusable={false}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 3,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text
          content={
            batchEditing
              ? `◆ EDITAR ${batchRowCount} LINHA(S)`
              : isNewRow
                ? "+ EDITAR NOVA LINHA"
                : "◆ EDITAR CÉLULA"
          }
          style={{ fg: isNewRow ? COLORS.runner : COLORS.warning }}
        />
        <text
          content={truncateDisplay(tableName, Math.max(6, width - 28))}
          style={{ fg: COLORS.muted }}
        />
      </box>

      <text
        content={`${column.field}  ·  ${column.type}`}
        style={{ fg: COLORS.database, marginTop: 1 }}
      />
      <text
        content={`${translateUi(column.nullable ? "aceita NULL" : "NOT NULL")}${column.key === "PRI" ? `  ·  ${translateUi("chave primária")}` : ""}`}
        style={{ fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
        <text content="Valor" style={{ width: 8, flexShrink: 0, fg: COLORS.muted }} />
        <input
          ref={inputRef}
          id="database-cell-editor-value"
          value={text}
          placeholder={
            batchEditing
              ? "digite o novo valor para todas"
              : masked
                ? "mascarado — digite para substituir"
                : isNull
                  ? "NULL"
                  : "digite o valor"
          }
          width={Math.max(4, width - 14)}
          maxLength={4096}
          onMouseDown={() => inputRef.current?.focus()}
          onInput={(nextValue) => {
            textRef.current = nextValue
            nullRef.current = false
            setText(nextValue)
            setIsNull(false)
            setValidationError("")
          }}
          onSubmit={apply}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.warning,
            placeholderColor: COLORS.muted,
          }}
        />
      </box>

      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "column",
          border: ["top"],
          borderColor: COLORS.border,
          marginTop: 1,
        }}
      >
        <ShortcutText
          content={
            validationError ||
            (compact
              ? "[Enter] aplicar · [Esc] cancelar · [Ctrl+N] NULL"
              : "[Enter] aplica localmente · [Esc] cancela · [Ctrl+N] NULL")
          }
          style={{
            height: 1,
            flexShrink: 0,
            fg: validationError ? COLORS.danger : COLORS.muted,
          }}
        />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
          <InlineButton
            label={isNull ? "[Ctrl+N] ◆ NULL" : "[Ctrl+N] ◇ NULL"}
            accent={COLORS.warning}
            active={isNull}
            disabled={!column.nullable}
            onPress={toggleNull}
          />
          <InlineButton
            label="[Enter] Aplicar"
            accent={isNewRow ? COLORS.runner : COLORS.warning}
            onPress={apply}
          />
        </box>
      </box>
    </ModalSurface>
  )
}
