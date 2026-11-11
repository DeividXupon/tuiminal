import type { TextareaRenderable } from "@opentui/core"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useMemo, useRef } from "react"
import { importCurl } from "../importing/curl"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"

function curlPreview(command: string) {
  if (!command.trim())
    return { text: "Cole um comando cURL para visualizar o preview.", error: false, fixed: true }
  try {
    const request = importCurl(command, "http-curl-preview")
    return {
      text: `${request.method} ${request.url}\n${request.headers.length} headers · ${request.body.kind}`,
      error: false,
      fixed: false,
    }
  } catch (error) {
    return {
      text: error instanceof Error ? error.message : String(error),
      error: true,
      fixed: true,
    }
  }
}

function CurlImportContent({
  command,
  onCommandChange,
  onApply,
  preview,
  compact,
}: {
  command: string
  onCommandChange: (command: string) => void
  onApply: () => void
  preview: ReturnType<typeof curlPreview>
  compact: boolean
}) {
  const editorRef = useRef<TextareaRenderable | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => editorRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <text content="cURL" style={{ height: 1, flexShrink: 0, fg: COLORS.muted }} />
      <textarea
        ref={editorRef}
        id="http-curl-import-editor"
        initialValue={command}
        placeholder="curl https://api.exemplo.com/users"
        onContentChange={() => onCommandChange(editorRef.current?.plainText ?? "")}
        onSubmit={onApply}
        style={{
          flexGrow: 1,
          minHeight: compact ? 1 : 2,
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.canvas,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.http,
          wrapMode: "word",
        }}
      />
      <box style={{ flexShrink: 0, marginTop: compact ? 0 : 1 }}>
        <HttpDialogSection title="PREVIEW" accent={preview.error ? COLORS.danger : COLORS.http}>
          <text
            id="http-curl-import-preview"
            content={preview.fixed ? translateUi(preview.text) : preview.text}
            wrapMode="word"
            style={{
              maxHeight: compact ? 1 : 3,
              flexShrink: 0,
              fg: preview.error ? COLORS.danger : COLORS.text,
            }}
          />
        </HttpDialogSection>
      </box>
    </>
  )
}

export function HttpCurlModal({
  mode,
  curl,
  command,
  onCommandChange,
  terminalWidth,
  terminalHeight,
  onApplyImport,
  onCopy,
  onClose,
}: {
  mode: "curl-import" | "curl-export"
  curl: string
  command: string
  onCommandChange: (command: string) => void
  terminalWidth: number
  terminalHeight: number
  onApplyImport: (command: string) => void
  onCopy: () => void
  onClose: () => void
}) {
  const width = Math.max(1, Math.min(86, terminalWidth - 2))
  const preview = useMemo(() => curlPreview(command), [command])
  const contentRows = (mode === "curl-import" ? command : curl)
    .split("\n")
    .reduce(
      (rows, line) => rows + Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, width - 5))),
      0,
    )
  const height = Math.max(
    1,
    Math.min(
      22,
      terminalHeight - 2,
      mode === "curl-import" ? 12 + Math.max(2, contentRows) : 8 + contentRows,
    ),
  )
  return (
    <HttpDialog
      id="http-curl-modal"
      title={mode === "curl-import" ? "IMPORTAR cURL" : "EXPORTAR cURL"}
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      actions={
        mode === "curl-import"
          ? [
              {
                id: "http-curl-import-apply",
                label: "[Ctrl+Enter] Importar em nova tab",
                shortLabel: "[Ctrl+Enter] Importar",
                disabled: preview.error || !command.trim(),
                onPress: () => onApplyImport(command),
              },
            ]
          : [{ id: "http-curl-export-copy", label: "[C] Copiar cURL redigido", onPress: onCopy }]
      }
    >
      {mode === "curl-import" ? (
        <CurlImportContent
          command={command}
          onCommandChange={onCommandChange}
          onApply={() => onApplyImport(command)}
          preview={preview}
          compact={terminalHeight < 18}
        />
      ) : (
        <>
          <HttpDialogNotice text="SEGREDOS REDIGIDOS POR PADRÃO" />
          <scrollbox scrollX scrollY style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
            <text content={curl} style={{ fg: COLORS.text }} />
          </scrollbox>
        </>
      )}
    </HttpDialog>
  )
}
