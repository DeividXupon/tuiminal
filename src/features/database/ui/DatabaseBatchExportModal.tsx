import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  serializeDatabaseBatchRows,
  type DatabaseBatchExportFormat,
  type DatabaseBatchSelectedRow,
} from "../model/batch"
import { saveDatabaseBatchExport } from "../storage/batch-export"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { useNotificationFromValue } from "../../../shared/notifications/index"

const FORMAT_LABEL: Record<DatabaseBatchExportFormat, string> = {
  csv: "CSV",
  tsv: "TSV",
  json: "JSON",
}

export function DatabaseBatchExportModal({
  open,
  tableName,
  columns,
  rows,
  onClose,
}: {
  open: boolean
  tableName: string
  columns: string[]
  rows: DatabaseBatchSelectedRow[]
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const formatRef = useRef<DatabaseBatchExportFormat>("csv")
  const [format, setFormat] = useState<DatabaseBatchExportFormat>("csv")
  const [notice, setNotice] = useState("")
  useNotificationFromValue(notice, { source: "Banco · Exportação" })
  const content = useMemo(
    () => serializeDatabaseBatchRows(rows, columns, format),
    [columns, format, rows],
  )

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    formatRef.current = "csv"
    setFormat("csv")
    setNotice("")
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, renderer])

  const close = useCallback(() => {
    if (renderer.currentFocusedRenderable?.id === "database-batch-export-modal") {
      renderer.currentFocusedRenderable.blur()
    }
    onClose()
  }, [onClose, renderer])

  const copy = useCallback(() => {
    const activeFormat = formatRef.current
    const activeContent = serializeDatabaseBatchRows(rows, columns, activeFormat)
    const copied = renderer.copyToClipboardOSC52(activeContent)
    setNotice(
      copied
        ? `${rows.length} linha(s) copiadas como ${FORMAT_LABEL[activeFormat]}.`
        : "O terminal não permitiu copiar. Use [S] para salvar em arquivo.",
    )
  }, [columns, renderer, rows])

  const save = useCallback(() => {
    try {
      const activeFormat = formatRef.current
      const activeContent = serializeDatabaseBatchRows(rows, columns, activeFormat)
      const path = saveDatabaseBatchExport({
        directory: process.env.TUIMINAL_WORKDIR ?? process.cwd(),
        tableName,
        format: activeFormat,
        content: activeContent,
      })
      setNotice(`Arquivo salvo em ${path}`)
    } catch (error) {
      setNotice(`Erro: ${error instanceof Error ? error.message : "não foi possível salvar"}`)
    }
  }, [columns, rows, tableName])

  const selectFormat = useCallback((nextFormat: DatabaseBatchExportFormat) => {
    formatRef.current = nextFormat
    setFormat(nextFormat)
    setNotice("")
  }, [])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      close()
      return
    }
    if (key.name === "1" || key.name === "2" || key.name === "3") {
      key.preventDefault()
      key.stopPropagation()
      selectFormat(key.name === "1" ? "csv" : key.name === "2" ? "tsv" : "json")
      return
    }
    if (key.name === "c" || key.name === "enter" || key.name === "return") {
      key.preventDefault()
      key.stopPropagation()
      copy()
      return
    }
    if (key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      save()
    }
  })

  if (!open) return null
  const width = Math.max(1, Math.min(96, terminal.width - 2))
  const height = Math.max(1, Math.min(23, terminal.height - 2))
  const previewWidth = Math.max(10, width - 6)
  const lineOccurrences = new Map<string, number>()
  let firstLine = true
  const previewLines = content
    .split("\n")
    .slice(0, Math.max(2, height - 10))
    .map((line) => {
      const occurrence = lineOccurrences.get(line) ?? 0
      lineOccurrences.set(line, occurrence + 1)
      const previewLine = { key: `${line}\u0000${occurrence}`, line, header: firstLine }
      firstLine = false
      return previewLine
    })

  return (
    <>
      <Button
        onPress={close}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={970}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 971,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          ref={dialogRef}
          id="database-batch-export-modal"
          focusable
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.database,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 3,
              flexShrink: 0,
              border: ["bottom"],
              borderColor: COLORS.border,
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
              <text content="◆ EXPORTAR SELEÇÃO" style={{ fg: COLORS.database }} />
              <text content={`${rows.length} linha(s)`} style={{ fg: COLORS.text }} />
            </box>
            <text content={truncateDisplay(tableName, previewWidth)} style={{ fg: COLORS.muted }} />
          </box>

          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            {(["csv", "tsv", "json"] as const).map((option, index) => (
              <InlineButton
                key={option}
                label={`[${index + 1}] ${FORMAT_LABEL[option]}`}
                accent={COLORS.database}
                active={format === option}
                onPress={() => {
                  selectFormat(option)
                }}
              />
            ))}
          </box>

          <box style={{ flexGrow: 1, backgroundColor: COLORS.panel, paddingLeft: 1 }}>
            {previewLines.map((previewLine) => (
              <text
                key={previewLine.key}
                content={truncateDisplay(previewLine.line, previewWidth)}
                style={{
                  height: 1,
                  flexShrink: 0,
                  fg: previewLine.header ? COLORS.database : COLORS.muted,
                }}
              />
            ))}
          </box>

          <box
            style={{
              height: 3,
              flexShrink: 0,
              border: ["top"],
              borderColor: COLORS.border,
            }}
          >
            <text
              content={translateUi(
                notice || "Exporte somente as linhas marcadas e as colunas do resultado atual.",
              )}
              style={{
                height: 1,
                flexShrink: 0,
                fg: notice.startsWith("Erro")
                  ? COLORS.danger
                  : notice
                    ? COLORS.success
                    : COLORS.muted,
              }}
            />
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <InlineButton label="[Esc] Fechar" accent={COLORS.muted} onPress={close} />
              <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                <InlineButton label="[C/Enter] Copiar" accent={COLORS.database} onPress={copy} />
                <InlineButton label="[S] Salvar arquivo" accent={COLORS.success} onPress={save} />
              </box>
            </box>
          </box>
        </box>
      </box>
    </>
  )
}
