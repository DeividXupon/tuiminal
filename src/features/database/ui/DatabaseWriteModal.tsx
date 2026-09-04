import { ShortcutText } from "../../../shared/ui/ShortcutText"
import type { InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useRef, useState } from "react"
import type { DatabaseColumn } from "../model/types"

import { translateUi } from "../../../shared/i18n/index"
import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"

export type DatabaseWriteMode = "insert" | "update"

type DatabaseWriteModalProps = {
  open: boolean
  mode: DatabaseWriteMode
  tableName: string
  columns: DatabaseColumn[]
  row: Record<string, unknown> | null
  onClose: () => void
  onSubmit: (values: Record<string, unknown>) => Promise<void>
}

function editableValue(value: unknown) {
  if (value === null || value === undefined) return ""
  const text = typeof value === "object" ? JSON.stringify(value) : String(value)
  return text === "<mascarado>" || text.startsWith("<binário ") ? "" : text
}

function initialValues(columns: DatabaseColumn[], row: Record<string, unknown> | null) {
  return Object.fromEntries(
    columns.map((column) => [column.field, editableValue(row?.[column.field])]),
  )
}

export function DatabaseWriteModal({
  open,
  mode,
  tableName,
  columns,
  row,
  onClose,
  onSubmit,
}: DatabaseWriteModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const inputRef = useRef<InputRenderable | null>(null)
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(0)
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(columns, row))
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [nullFields, setNullFields] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    setSelectedColumnIndex(0)
    setValues(initialValues(columns, row))
    setIncluded({})
    setNullFields({})
    setBusy(false)
    setNotice("")
  }, [columns, open, renderer, row])

  useEffect(() => {
    if (!open) return
    return () => {
      if (renderer.currentFocusedRenderable?.id === "database-write-value") {
        renderer.currentFocusedRenderable.blur()
      }
    }
  }, [open, renderer])

  const selectedColumn = columns[selectedColumnIndex]
  const selectedField = selectedColumn?.field ?? ""
  const selectedOriginalValue = row?.[selectedField]
  const maskedOriginal =
    selectedOriginalValue === "<mascarado>" ||
    String(selectedOriginalValue ?? "").startsWith("<binário ")

  const moveColumn = useCallback(
    (delta: number) => {
      setSelectedColumnIndex((current) =>
        Math.max(0, Math.min(Math.max(0, columns.length - 1), current + delta)),
      )
    },
    [columns.length],
  )

  const save = useCallback(async () => {
    const payload = Object.fromEntries(
      columns
        .filter((column) => included[column.field])
        .map((column) => [
          column.field,
          nullFields[column.field] ? null : (values[column.field] ?? ""),
        ]),
    )
    if (!Object.keys(payload).length) {
      setNotice(mode === "insert" ? "Preencha ao menos um campo." : "Nenhuma alteração foi feita.")
      return
    }
    setBusy(true)
    setNotice(mode === "insert" ? "Inserindo registro…" : "Salvando alterações…")
    try {
      await onSubmit(payload)
    } catch (error) {
      setNotice(error instanceof Error ? `Erro: ${error.message}` : "A escrita falhou.")
      setBusy(false)
    }
  }, [columns, included, mode, nullFields, onSubmit, values])

  useKeyboard((key) => {
    if (!open) return
    const editingInput = renderer.currentFocusedRenderable?.id === "database-write-value"
    if (key.name === "escape") {
      key.preventDefault()
      if (editingInput) {
        inputRef.current?.blur()
        return
      }
      onClose()
      return
    }
    if ((key.ctrl && key.name === "s") || key.name === "f2") {
      key.preventDefault()
      void save()
      return
    }
    if (editingInput) return
    if (key.name === "up" || key.name === "k") {
      key.preventDefault()
      moveColumn(-1)
    } else if (key.name === "down" || key.name === "j") {
      key.preventDefault()
      moveColumn(1)
    } else if (key.name === "enter" || key.name === "return" || key.name === "e") {
      key.preventDefault()
      inputRef.current?.focus()
    } else if (key.name === "n" && selectedColumn) {
      key.preventDefault()
      setIncluded((current) => ({ ...current, [selectedField]: true }))
      setNullFields((current) => ({ ...current, [selectedField]: true }))
    }
  })

  if (!open) return null
  const width = Math.max(1, Math.min(94, terminal.width - 2))
  const height = Math.max(1, Math.min(24, terminal.height))
  const compact = width < 72
  const hideColumnList = width < 46
  const listWidth = hideColumnList ? 0 : Math.min(34, Math.max(18, Math.floor(width * 0.34)))
  const valueWidth = Math.max(6, width - listWidth - (hideColumnList ? 8 : 10))
  const changedCount = Object.values(included).filter(Boolean).length

  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={940}
        backgroundColor="#030509"
        opacity={0.9}
      />
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 941,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: mode === "insert" ? COLORS.success : COLORS.warning,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
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
            <text
              content={`${mode === "insert" ? "+ NOVO REGISTRO" : "◆ EDITAR REGISTRO"} · ${tableName}`}
              style={{ fg: mode === "insert" ? COLORS.success : COLORS.warning }}
            />
            <text
              content={`${changedCount} campo${changedCount === 1 ? "" : "s"}`}
              style={{ fg: COLORS.muted }}
            />
          </box>

          <box style={{ flexGrow: 1, flexDirection: "row" }}>
            {hideColumnList ? null : (
              <scrollbox scrollY viewportCulling style={{ width: listWidth, flexShrink: 0 }}>
                {columns.map((column, index) => (
                  <Button
                    key={column.field}
                    onPress={() => setSelectedColumnIndex(index)}
                    height={2}
                    flexShrink={0}
                  >
                    {(state) => (
                      <box
                        style={{
                          height: 2,
                          flexShrink: 0,
                          paddingLeft: 1,
                          backgroundColor:
                            index === selectedColumnIndex || state.focused
                              ? COLORS.panelRaised
                              : COLORS.panel,
                        }}
                      >
                        <text
                          content={`${included[column.field] ? "◆" : "◇"} ${column.field}${column.key === "PRI" ? "  PK" : ""}`}
                          style={{ fg: included[column.field] ? COLORS.warning : COLORS.text }}
                        />
                        <text content={column.type} style={{ fg: COLORS.muted }} />
                      </box>
                    )}
                  </Button>
                ))}
              </scrollbox>
            )}

            <box
              style={{
                flexGrow: 1,
                border: hideColumnList ? false : ["left"],
                borderColor: COLORS.border,
                paddingLeft: hideColumnList ? 1 : 2,
                paddingTop: 1,
              }}
            >
              {selectedColumn ? (
                <>
                  <text
                    content={`${selectedColumn.field}  ·  ${selectedColumn.type}`}
                    style={{ fg: COLORS.database }}
                  />
                  <text
                    content={`${translateUi(selectedColumn.nullable ? "aceita NULL" : "NOT NULL")}${selectedColumn.defaultValue ? `  ·  ${translateUi("padrão")} ${selectedColumn.defaultValue}` : ""}`}
                    style={{ fg: COLORS.muted }}
                  />
                  <box style={{ height: 1, flexShrink: 0, marginTop: 1, flexDirection: "row" }}>
                    <text content="Valor" style={{ width: 8, flexShrink: 0, fg: COLORS.muted }} />
                    <input
                      ref={inputRef}
                      id="database-write-value"
                      value={values[selectedField] ?? ""}
                      placeholder={
                        maskedOriginal
                          ? "mascarado — digite para substituir"
                          : mode === "insert"
                            ? "não enviado"
                            : "novo valor"
                      }
                      width={valueWidth}
                      maxLength={4096}
                      onMouseDown={() => inputRef.current?.focus()}
                      onInput={(value) => {
                        if (renderer.currentFocusedRenderable?.id !== "database-write-value") {
                          return
                        }
                        const baseline =
                          mode === "update" ? editableValue(row?.[selectedField]) : ""
                        setValues((current) => ({ ...current, [selectedField]: value }))
                        setIncluded((current) => ({
                          ...current,
                          [selectedField]: value !== baseline,
                        }))
                        if (value !== baseline) {
                          setNullFields((current) => ({ ...current, [selectedField]: false }))
                        }
                      }}
                      onSubmit={() => void save()}
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
                  <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
                    <InlineButton
                      label={nullFields[selectedField] ? "◆ NULL" : "◇ Definir NULL"}
                      accent={COLORS.warning}
                      active={nullFields[selectedField] ?? false}
                      disabled={!selectedColumn.nullable}
                      onPress={() => {
                        setIncluded((current) => ({ ...current, [selectedField]: true }))
                        setNullFields((current) => ({
                          ...current,
                          [selectedField]: !current[selectedField],
                        }))
                      }}
                    />
                    <InlineButton
                      label="Descartar campo"
                      accent={COLORS.database}
                      disabled={!included[selectedField]}
                      onPress={() => {
                        setIncluded((current) => ({ ...current, [selectedField]: false }))
                        setNullFields((current) => ({ ...current, [selectedField]: false }))
                        setValues((current) => ({
                          ...current,
                          [selectedField]: editableValue(row?.[selectedField]),
                        }))
                      }}
                    />
                  </box>
                  <text
                    content={
                      mode === "update"
                        ? maskedOriginal
                          ? "O valor atual está mascarado. Ele só muda se este campo for marcado."
                          : `Atual: ${editableValue(selectedOriginalValue) || (selectedOriginalValue === null ? "NULL" : translateUi("vazio"))}`
                        : "Campos não marcados usarão o valor padrão definido no banco."
                    }
                    style={{ fg: COLORS.muted, marginTop: 1 }}
                  />
                </>
              ) : null}
            </box>
          </box>

          <box
            style={{
              height: compact ? 3 : 2,
              flexShrink: 0,
              flexDirection: compact ? "column" : "row",
              justifyContent: "space-between",
              border: ["top"],
              borderColor: COLORS.border,
            }}
          >
            <ShortcutText
              content={
                notice ||
                (compact
                  ? "[↑↓] campo · [Enter] editar · [Ctrl+S] salvar"
                  : "[↑↓] campo · [Enter] editar · [N] NULL · [Ctrl+S] salvar")
              }
              style={{ fg: notice.startsWith("Erro") ? COLORS.danger : COLORS.muted }}
            />
            <box style={{ flexDirection: "row" }}>
              <InlineButton
                label="[Esc] Cancelar"
                accent={COLORS.muted}
                disabled={busy}
                onPress={onClose}
              />
              <InlineButton
                label={
                  busy ? "Salvando…" : mode === "insert" ? "[Ctrl+S] Inserir" : "[Ctrl+S] Salvar"
                }
                accent={mode === "insert" ? COLORS.success : COLORS.warning}
                disabled={busy}
                onPress={() => void save()}
              />
            </box>
          </box>
        </box>
      </box>
    </>
  )
}
