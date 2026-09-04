import type { TextareaRenderable } from "@opentui/core"
import { useEffect, useMemo, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { importCurl } from "../importing/curl"

function CurlImportContent({
  command,
  onCommandChange,
  onApply,
}: {
  command: string
  onCommandChange: (command: string) => void
  onApply: () => void
}) {
  const editorRef = useRef<TextareaRenderable | null>(null)
  const preview = useMemo(() => {
    if (!command.trim())
      return { text: "Cole um comando cURL para visualizar o preview.", error: false }
    try {
      const request = importCurl(command, "http-curl-preview")
      return {
        text: `${request.method} ${request.url} · ${request.headers.length} headers · ${request.body.kind}`,
        error: false,
      }
    } catch (error) {
      return { text: error instanceof Error ? error.message : String(error), error: true }
    }
  }, [command])
  useEffect(() => {
    const timer = setTimeout(() => editorRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <textarea
        ref={editorRef}
        id="http-curl-import-editor"
        initialValue={command}
        placeholder="curl https://api.exemplo.com/users"
        onContentChange={() => onCommandChange(editorRef.current?.plainText ?? "")}
        onSubmit={onApply}
        style={{
          height: 6,
          flexShrink: 0,
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.canvas,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.http,
          wrapMode: "word",
        }}
      />
      <text content={translateUi("PREVIEW")} style={{ fg: COLORS.muted }} />
      <text
        content={translateUi(preview.text)}
        style={{ flexGrow: 1, fg: preview.error ? COLORS.danger : COLORS.text }}
      />
      <InlineButton
        label="[Ctrl+Enter] Importar em nova tab"
        accent={COLORS.http}
        disabled={preview.error || !command.trim()}
        onPress={onApply}
      />
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
  const width = Math.min(82, Math.max(40, terminalWidth - 4))
  const height = Math.min(16, Math.max(10, terminalHeight - 4))
  return (
    <box
      id="http-curl-modal"
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
        top: Math.max(1, Math.floor((terminalHeight - height) / 2) - 1),
        width,
        height,
        zIndex: 100,
        ...panelBorder(COLORS.http),
        backgroundColor: COLORS.panelRaised,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text
          content={translateUi(mode === "curl-import" ? "IMPORTAR cURL" : "EXPORTAR cURL")}
          style={{ fg: COLORS.http }}
        />
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
      {mode === "curl-import" ? (
        <CurlImportContent
          command={command}
          onCommandChange={onCommandChange}
          onApply={() => onApplyImport(command)}
        />
      ) : (
        <>
          <text
            content={translateUi("SEGREDOS REDIGIDOS POR PADRÃO")}
            style={{ fg: COLORS.warning }}
          />
          <scrollbox scrollX scrollY style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
            <text content={curl} style={{ fg: COLORS.text }} />
          </scrollbox>
          <InlineButton label="[C] Copiar cURL redigido" accent={COLORS.http} onPress={onCopy} />
        </>
      )}
    </box>
  )
}
