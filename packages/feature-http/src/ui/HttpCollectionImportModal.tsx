import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpCollectionImportPreview } from "../services/collection-import"
import { HttpImportSourcePicker } from "./HttpImportSourcePicker"

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
      <text content={translateUi(summary)} style={{ height: 1, flexShrink: 0, fg: COLORS.http }} />
      <text
        content={`${translateUi("FORMATO DETECTADO")}  ${preview.format.toUpperCase()}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <text
        content={`${translateUi("DESTINO")}  ${truncateDisplay(preview.plannedPath, contentWidth - 9)}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
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
  const width = Math.min(82, Math.max(42, terminalWidth - 4))
  const height = preview
    ? Math.min(22, Math.max(12, terminalHeight - 4))
    : Math.min(27, Math.max(12, terminalHeight - 2))
  const compact = terminalHeight < 26
  const tiny = terminalHeight < 18
  const contentWidth = width - 4

  return (
    <box
      id="http-collection-import-modal"
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
        width,
        height,
        zIndex: 110,
        border: true,
        borderStyle: "rounded",
        borderColor: COLORS.http,
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
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        {preview ? (
          <InlineButton
            id="http-collection-import-back"
            label="[B] Voltar"
            accent={COLORS.http}
            onPress={onBack}
          />
        ) : null}
        <InlineButton
          id="http-collection-import-apply"
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
