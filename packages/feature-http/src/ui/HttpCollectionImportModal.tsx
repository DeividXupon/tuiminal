import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { HttpCollectionImportPreview } from "../services/collection-import"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"
import { HttpImportSourcePicker } from "./HttpImportSourcePicker"

function ImportPreview({
  preview,
  contentWidth,
}: {
  preview: HttpCollectionImportPreview
  contentWidth: number
}) {
  const summary = [
    { label: "IMPORTADOS", count: preview.report.requests.length, color: COLORS.success },
    { label: "IGNORADOS", count: preview.report.ignored.length, color: COLORS.muted },
    { label: "AVISOS", count: preview.report.warnings.length, color: COLORS.warning },
    { label: "CONFLITOS", count: preview.conflicts, color: COLORS.danger },
  ]
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
    <scrollbox scrollY viewportCulling style={{ flexGrow: 1, minHeight: 0 }}>
      <box style={{ flexShrink: 0, flexDirection: "row", flexWrap: "wrap", marginBottom: 1 }}>
        {summary.map((item) => (
          <text
            key={item.label}
            content={`${translateUi(item.label)} ${item.count}`}
            wrapMode="none"
            style={{
              height: 1,
              width: contentWidth >= 72 ? "25%" : "50%",
              fg: item.count ? item.color : COLORS.muted,
            }}
          />
        ))}
      </box>
      <HttpDialogSection title="DESTINO">
        <text
          content={truncateDisplay(preview.plannedPath, contentWidth - 3)}
          wrapMode="none"
          style={{ height: 1, fg: COLORS.text }}
        />
        <text
          content={`${translateUi("FORMATO DETECTADO")}  ${preview.format.toUpperCase()}`}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      </HttpDialogSection>
      <box style={{ flexShrink: 0, marginTop: 1 }}>
        {details.map((detail, index) => (
          <text
            key={detail.key}
            content={truncateDisplay(
              `${detail.kind === "warning" ? "⚠ " : detail.kind === "ignored" ? "× " : ""}${
                detail.kind === "request" ? detail.text : translateUi(detail.text)
              }`,
              contentWidth - 1,
            )}
            wrapMode="none"
            style={{
              height: 1,
              flexShrink: 0,
              fg: detail.kind === "request" ? COLORS.text : COLORS.warning,
              bg: index % 2 ? COLORS.panel : COLORS.canvas,
            }}
          />
        ))}
        {hidden ? (
          <text content={translateUi(`… mais ${hidden} item(ns)`)} style={{ fg: COLORS.muted }} />
        ) : null}
      </box>
      <HttpDialogNotice text="Nada foi salvo ainda. Revise o destino e confirme." />
    </scrollbox>
  )
}

export function HttpCollectionImportModal({
  sourcePath,
  preview,
  busy,
  error,
  terminalWidth,
  terminalHeight,
  onSourcePathChange,
  onApply,
  onBack,
  onClose,
}: {
  sourcePath: string
  preview: HttpCollectionImportPreview | null
  busy: boolean
  error: string
  terminalWidth: number
  terminalHeight: number
  onSourcePathChange: (path: string) => void
  onApply: () => void
  onBack: () => void
  onClose: () => void
}) {
  const width = Math.max(1, Math.min(86, terminalWidth - 2))
  const height = preview
    ? Math.min(22, Math.max(12, terminalHeight - 4))
    : Math.min(27, Math.max(12, terminalHeight - 2))
  const compact = terminalHeight < 26
  const tiny = terminalHeight < 18
  const contentWidth = width - 4

  return (
    <HttpDialog
      fitContent={!preview}
      id="http-collection-import-modal"
      title={"IMPORTAR COLEÇÃO"}
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      actions={[
        ...(preview
          ? [{ id: "http-collection-import-back", label: "[B] Voltar", onPress: onBack }]
          : []),
        {
          id: "http-collection-import-apply",
          label: busy
            ? "PROCESSANDO…"
            : preview
              ? "[Ctrl+Enter] Confirmar importação"
              : "[Ctrl+Enter] Gerar prévia",
          shortLabel: preview ? "[Ctrl+Enter] Confirmar" : "[Ctrl+Enter] Prévia",
          accent: busy ? COLORS.warning : COLORS.http,
          disabled: busy || !sourcePath.trim(),
          onPress: onApply,
        },
      ]}
    >
      <text
        content={translateUi(preview ? "2 · Revisar importação" : "1 · Escolher arquivo")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      {preview ? (
        <ImportPreview preview={preview} contentWidth={contentWidth} />
      ) : (
        <box
          style={{
            flexGrow: 1,
            overflow: "hidden",
            gap: tiny ? 0 : 1,
            paddingTop: tiny ? 0 : 1,
            paddingBottom: tiny ? 0 : 1,
          }}
        >
          <HttpImportSourcePicker
            sourcePath={sourcePath}
            compact={compact}
            tiny={tiny}
            onSourcePathChange={onSourcePathChange}
            onSubmit={onApply}
          />
        </box>
      )}
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
    </HttpDialog>
  )
}
