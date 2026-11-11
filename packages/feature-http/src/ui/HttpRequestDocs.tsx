import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { useHttpRequestDocumentation } from "../hooks/use-http-request-documentation"
import type { HttpRequestDefinition } from "../model/types"
import { HttpDocsEditor } from "./HttpDocsEditor"

const DOCS_SYNTAX = createUiSyntaxStyle()
const MAX_RENDERED_CHARACTERS = 50_000

export function HttpRequestDocs({
  request,
  visible,
  focused,
  onFocus,
  onChange,
}: {
  request: HttpRequestDefinition
  visible: boolean
  focused: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const docs = useHttpRequestDocumentation(request, visible)
  const [editing, setEditing] = useState(false)
  const editable = !docs.loading && !docs.error
  const edit = () => {
    if (!editable) return
    onFocus()
    setEditing(true)
  }
  useWorkspaceRepaint(
    JSON.stringify([request.id, docs.loading, Boolean(docs.error), editing]),
    visible,
  )
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    if (!visible || !focused || editing) return
    const scroll = scrollRef.current
    scroll?.focus()
    return () => scroll?.blur()
  }, [visible, focused, editing])
  return (
    <box visible={visible} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      <InlineButton
        id={`http-request-docs-${editing ? "preview" : "edit"}-${request.id}`}
        label={editing ? "[Esc] Visualizar" : "[Enter] Editar"}
        accent={COLORS.http}
        disabled={!editing && !editable}
        onPress={editing ? () => setEditing(false) : edit}
      />
      {editing ? (
        <HttpDocsEditor
          requestId={request.id}
          value={docs.text}
          active={visible && focused}
          onChange={onChange}
          onPreview={() => setEditing(false)}
          onFocus={onFocus}
        />
      ) : null}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: native scroll pane owns mouse and keyboard scrolling. */}
      <scrollbox
        id={`http-request-docs-${request.id}`}
        visible={!editing}
        ref={scrollRef}
        scrollY
        scrollX={false}
        viewportCulling={false}
        onMouseDown={() => {
          onFocus()
          scrollRef.current?.focus()
        }}
        onKeyDown={(key) => {
          if (!key.ctrl && !key.meta && !key.option && ["enter", "return"].includes(key.name)) {
            key.preventDefault()
            key.stopPropagation()
            edit()
          }
          if (docs.error && key.name === "r" && !key.ctrl && !key.meta && !key.option) {
            key.preventDefault()
            key.stopPropagation()
            docs.retry()
          }
        }}
        style={{ flexGrow: 1, minHeight: 0, backgroundColor: COLORS.canvas }}
      >
        {docs.loading ? (
          <text
            content={translateUi("Carregando documentação do Postman…")}
            style={{ fg: COLORS.muted }}
          />
        ) : docs.error ? (
          <text content={translateUi(docs.error)} style={{ fg: COLORS.warning }} />
        ) : !editing && docs.text.trim() ? (
          <markdown
            content={docs.text.slice(0, MAX_RENDERED_CHARACTERS)}
            syntaxStyle={DOCS_SYNTAX}
            fg={COLORS.text}
            bg={COLORS.canvas}
            style={{ width: "100%", flexShrink: 0 }}
          />
        ) : (
          <text
            content={translateUi("Esta requisição não possui documentação.")}
            style={{ fg: COLORS.muted }}
          />
        )}
        {docs.text.length > MAX_RENDERED_CHARACTERS ? (
          <text
            content={translateUi("Documentação limitada a 50.000 caracteres.")}
            style={{ fg: COLORS.muted }}
          />
        ) : null}
      </scrollbox>
      {docs.error ? (
        <InlineButton
          id={`http-request-docs-retry-${request.id}`}
          label="[R] Tentar novamente"
          onPress={docs.retry}
          accent={COLORS.http}
        />
      ) : null}
      <ShortcutText
        content={translateUi(editing ? "[Ctrl+S] Salvar" : "[↑/↓] Rolar · mouse")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
