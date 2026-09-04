import { RGBA, type InputRenderable, type TextareaRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS, LAYOUT, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type {
  HttpAuth,
  HttpBodyKind,
  HttpDocumentState,
  HttpKeyValue,
  HttpRequestView,
} from "../model/types"
import { COMMON_HTTP_HEADER_NAMES } from "../model/key-value"
import { HttpAuthEditor } from "./HttpAuthEditor"
import { HttpKeyValueEditor } from "./HttpKeyValueEditor"

function requestViewLabel(view: HttpRequestView) {
  switch (view) {
    case "params":
      return "[P] Parâmetros"
    case "headers":
      return "[H] Headers"
    case "body":
      return "[B] Body"
    case "auth":
      return "[A] Autenticação"
    case "more":
      return "[O] Mais"
  }
}

function BodyKindButtons({
  kind,
  onChange,
}: {
  kind: HttpBodyKind
  onChange: (kind: HttpBodyKind) => void
}) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      {(["none", "json", "text", "form"] as const).map((candidate) => (
        <InlineButton
          key={candidate}
          label={candidate === "none" ? "Nenhum" : candidate.toUpperCase()}
          accent={COLORS.http}
          active={kind === candidate}
          onPress={() => onChange(candidate)}
        />
      ))}
    </box>
  )
}

export function HttpRequestPane({
  document,
  visible,
  focused,
  position,
  registerHeaderInput,
  registerBodyEditor,
  onSelectView,
  onQueryChange,
  onPathChange,
  onHeadersChange,
  onAuthChange,
  onBodyChange,
  onBodyFormChange,
  onBodyKindChange,
  onSend,
  onFocus,
}: {
  document: HttpDocumentState
  visible: boolean
  focused: boolean
  position: { left: number; top: number; width: number; height: number }
  registerHeaderInput: (input: InputRenderable | null) => void
  registerBodyEditor: (editor: TextareaRenderable | null) => void
  onSelectView: (view: HttpRequestView) => void
  onQueryChange: (entries: HttpKeyValue[]) => void
  onPathChange: (entries: HttpKeyValue[]) => void
  onHeadersChange: (headers: HttpKeyValue[]) => void
  onAuthChange: (auth: HttpAuth) => void
  onBodyChange: (value: string) => void
  onBodyFormChange: (entries: HttpKeyValue[]) => void
  onBodyKindChange: (kind: HttpBodyKind) => void
  onSend: () => void
  onFocus: () => void
}) {
  const bodyEditorRef = useRef<TextareaRenderable | null>(null)
  const request = document.request
  const dirty = document.revision !== document.savedRevision
  const bodyDisabled = request.body.kind === "none"
  const textBody = request.body.kind === "json" || request.body.kind === "text"

  return (
    <box
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        ...panelBorder(focused ? COLORS.http : COLORS.border),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
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
        <text content={translateUi("REQUISIÇÃO")} style={{ fg: COLORS.http }} />
        <text
          content={dirty ? translateUi("● MODIFICADO") : translateUi("SALVO")}
          style={{ fg: dirty ? COLORS.warning : COLORS.muted }}
        />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
          overflow: "hidden",
        }}
      >
        {(["params", "headers", "body", "auth", "more"] as const).map((view) => (
          <InlineButton
            key={view}
            label={requestViewLabel(view)}
            accent={COLORS.http}
            active={document.requestView === view}
            onPress={() => {
              onFocus()
              onSelectView(view)
            }}
          />
        ))}
      </box>
      <box style={{ flexGrow: 1, position: "relative", backgroundColor: COLORS.canvas }}>
        <box
          visible={document.requestView === "params"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <HttpKeyValueEditor
            idPrefix={`${request.id}-query`}
            title="QUERY PARAMS"
            entries={request.query}
            onChange={onQueryChange}
          />
          <HttpKeyValueEditor
            idPrefix={`${request.id}-path`}
            title="PATH PARAMS"
            entries={request.path}
            onChange={onPathChange}
          />
        </box>
        <box
          visible={document.requestView === "headers"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <HttpKeyValueEditor
            idPrefix={`${request.id}-header`}
            title="HEADERS"
            entries={request.headers}
            onChange={onHeadersChange}
            registerFirstInput={registerHeaderInput}
            detectSensitiveNames
            nameSuggestions={COMMON_HTTP_HEADER_NAMES}
          />
        </box>
        <box
          visible={document.requestView === "body"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <BodyKindButtons kind={request.body.kind} onChange={onBodyKindChange} />
          <textarea
            ref={(editor) => {
              bodyEditorRef.current = editor
              registerBodyEditor(editor)
            }}
            id={`http-body-editor-${request.id}`}
            visible={textBody}
            initialValue={request.body.text}
            placeholder={'{\n  "name": "Tuiminal"\n}'}
            onMouseDown={() => {
              onFocus()
              bodyEditorRef.current?.focus()
            }}
            onContentChange={() => onBodyChange(bodyEditorRef.current?.plainText ?? "")}
            onSubmit={onSend}
            style={{
              flexGrow: 1,
              backgroundColor: COLORS.canvas,
              focusedBackgroundColor: COLORS.canvas,
              textColor: COLORS.text,
              focusedTextColor: COLORS.text,
              cursorColor: COLORS.http,
              selectionBg: RGBA.fromHex("#5a351d"),
              wrapMode: "word",
            }}
          />
          <box visible={request.body.kind === "form"} style={{ flexGrow: 1 }}>
            <HttpKeyValueEditor
              idPrefix={`${request.id}-form`}
              title="FORM URL ENCODED"
              entries={request.body.form}
              onChange={onBodyFormChange}
            />
          </box>
          <box
            visible={bodyDisabled}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 1,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: COLORS.canvas,
            }}
          >
            <text content={translateUi("BODY DESATIVADO")} style={{ fg: COLORS.muted }} />
          </box>
        </box>
        <box
          visible={document.requestView === "auth"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <HttpAuthEditor requestId={request.id} auth={request.auth} onChange={onAuthChange} />
        </box>
        <box
          visible={document.requestView === "more"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, padding: 1 }}
        >
          <text content={translateUi("OPÇÕES DA REQUISIÇÃO")} style={{ fg: COLORS.text }} />
          <text
            content={translateUi(`Timeout: ${request.options.timeoutMs / 1_000}s`)}
            style={{ fg: COLORS.muted }}
          />
          <text
            content={translateUi(
              request.options.followRedirects ? "Redirects: seguir" : "Redirects: manual",
            )}
            style={{ fg: COLORS.muted }}
          />
        </box>
      </box>
      {LAYOUT.compact ? null : (
        <text
          content={translateUi("[Ctrl+Enter] Enviar · [Esc] Sair do editor")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
