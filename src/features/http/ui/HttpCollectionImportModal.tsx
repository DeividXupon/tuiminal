import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef, type RefObject } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type {
  HttpCollectionImportFormat,
  HttpCollectionImportPreview,
} from "../services/collection-import"

function ImportInput({
  id,
  value,
  placeholder,
  inputRef,
  onChange,
  onSubmit,
}: {
  id: string
  value: string
  placeholder: string
  inputRef?: RefObject<InputRenderable | null>
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <input
      {...(inputRef ? { ref: inputRef } : {})}
      id={id}
      value={value}
      placeholder={translateUi(placeholder)}
      onInput={onChange}
      onSubmit={onSubmit}
      onMouseDown={() => inputRef?.current?.focus()}
      style={{
        backgroundColor: COLORS.canvas,
        focusedBackgroundColor: COLORS.panelRaised,
      }}
    />
  )
}

function ImportPreview({
  preview,
  contentWidth,
}: {
  preview: HttpCollectionImportPreview
  contentWidth: number
}) {
  const summary = `IMPORTADOS ${preview.report.requests.length} · IGNORADOS ${preview.report.ignored.length} · AVISOS ${preview.report.warnings.length} · CONFLITOS ${preview.conflicts}`
  const warnings = [...new Set(preview.report.warnings)]
  const ignored = [...new Set(preview.report.ignored)]
  const details = [
    ...preview.report.requests.slice(0, 6).map((request) => ({
      key: `request-${request.id}`,
      kind: "request" as const,
      text: `${request.method} ${request.name}`,
    })),
    ...warnings
      .slice(0, 4)
      .map((warning) => ({ key: `warning-${warning}`, kind: "warning" as const, text: warning })),
    ...ignored
      .slice(0, 3)
      .map((ignored) => ({ key: `ignored-${ignored}`, kind: "ignored" as const, text: ignored })),
  ]
  const hidden =
    preview.report.requests.length -
    Math.min(6, preview.report.requests.length) +
    warnings.length -
    Math.min(4, warnings.length) +
    ignored.length -
    Math.min(3, ignored.length)
  return (
    <>
      <text content={translateUi(summary)} style={{ fg: COLORS.http }} />
      <text
        content={`${translateUi("DESTINO")}  ${truncateDisplay(preview.plannedPath, contentWidth - 9)}`}
        style={{ fg: COLORS.muted }}
      />
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, paddingTop: 1 }}>
        {details.map((detail) => (
          <text
            key={detail.key}
            content={truncateDisplay(
              `${detail.kind === "warning" ? "⚠ " : detail.kind === "ignored" ? "× " : ""}${
                detail.kind === "request" ? detail.text : translateUi(detail.text)
              }`,
              contentWidth,
            )}
            style={{ fg: detail.kind === "request" ? COLORS.text : COLORS.warning }}
          />
        ))}
        {hidden ? (
          <text content={translateUi(`… mais ${hidden} item(ns)`)} style={{ fg: COLORS.muted }} />
        ) : null}
      </scrollbox>
    </>
  )
}

export function HttpCollectionImportModal({
  format,
  sourcePath,
  outputDirectory,
  preview,
  busy,
  error,
  terminalWidth,
  terminalHeight,
  onFormatChange,
  onSourcePathChange,
  onOutputDirectoryChange,
  onApply,
  onBack,
  onClose,
}: {
  format: HttpCollectionImportFormat
  sourcePath: string
  outputDirectory: string
  preview: HttpCollectionImportPreview | null
  busy: boolean
  error: string
  terminalWidth: number
  terminalHeight: number
  onFormatChange: (format: HttpCollectionImportFormat) => void
  onSourcePathChange: (path: string) => void
  onOutputDirectoryChange: (path: string) => void
  onApply: () => void
  onBack: () => void
  onClose: () => void
}) {
  const sourceRef = useRef<InputRenderable | null>(null)
  const outputRef = useRef<InputRenderable | null>(null)
  const width = Math.min(82, Math.max(42, terminalWidth - 4))
  const height = Math.min(22, Math.max(12, terminalHeight - 4))
  const contentWidth = width - 4
  useEffect(() => {
    if (preview) return
    const timer = setTimeout(() => sourceRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [preview])

  return (
    <box
      id="http-collection-import-modal"
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 110,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={translateUi("IMPORTAR COLEÇÃO")} style={{ fg: COLORS.http }} />
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
      {preview ? (
        <ImportPreview preview={preview} contentWidth={contentWidth} />
      ) : (
        <box style={{ flexGrow: 1, gap: 1 }}>
          <InlineButton
            label={`[F] Formato: ${format === "postman" ? "POSTMAN" : "OPENAPI"}`}
            accent={COLORS.http}
            active
            onPress={() => onFormatChange(format === "postman" ? "openapi" : "postman")}
          />
          <text content={translateUi("ARQUIVO NO PROJETO")} style={{ fg: COLORS.muted }} />
          <ImportInput
            id="http-collection-import-source"
            value={sourcePath}
            placeholder={format === "postman" ? "collection.json" : "openapi.yaml"}
            inputRef={sourceRef}
            onChange={onSourcePathChange}
            onSubmit={onApply}
          />
          <text content={translateUi("PASTA DE DESTINO NO PROJETO")} style={{ fg: COLORS.muted }} />
          <ImportInput
            id="http-collection-import-output"
            value={outputDirectory}
            placeholder=".tuiminal/http/imported"
            inputRef={outputRef}
            onChange={onOutputDirectoryChange}
            onSubmit={onApply}
          />
          <text
            content={translateUi("A prévia analisa compatibilidade e não grava arquivos.")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        {preview ? <InlineButton label="[B] Voltar" accent={COLORS.http} onPress={onBack} /> : null}
        <InlineButton
          label={
            busy
              ? "PROCESSANDO…"
              : preview
                ? "[Ctrl+Enter] Confirmar importação"
                : "[Ctrl+Enter] Gerar prévia"
          }
          accent={busy ? COLORS.warning : COLORS.http}
          disabled={busy}
          onPress={onApply}
        />
      </box>
    </box>
  )
}
