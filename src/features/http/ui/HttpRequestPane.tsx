import {
  RGBA,
  type InputRenderable,
  type ScrollBoxRenderable,
  type TextareaRenderable,
} from "@opentui/core"
import { useRef, useState } from "react"
import { COLORS, focusedPanelBorder, LAYOUT } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import type {
  HttpAuth,
  HttpAssertionDefinition,
  HttpBodyKind,
  HttpChainExtraction,
  HttpDocumentState,
  HttpKeyValue,
  HttpMultipartPart,
  HttpRequestView,
  HttpRequestMoreView,
} from "../model/types"
import { COMMON_HTTP_HEADER_NAMES } from "../model/key-value"
import type { HttpParameterSection } from "../model/parameter-navigation"
import type { HttpPreparedRequestPreview } from "../services/request-preview"
import { HttpAuthEditor } from "./HttpAuthEditor"
import { HttpKeyValueEditor } from "./HttpKeyValueEditor"
import { HttpMultipartEditor } from "./HttpMultipartEditor"
import { HttpOpaqueRequestContent } from "./HttpOpaqueRequestContent"
import { HttpRequestMoreEditor } from "./HttpRequestMoreEditor"
import { HttpBodyKindButtons, HttpRequestPaneKeyboard } from "./HttpRequestPaneControls"
import { HttpRequestViewTabs } from "./HttpRequestViewTabs"

function RequestPaneTitle({ dirty }: { dirty: boolean }) {
  return (
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
  )
}

export function HttpRequestPane({
  document,
  visible,
  focused,
  position,
  registerHeaderInput,
  registerBodyEditor,
  registerRawScroll,
  onSelectView,
  onQueryChange,
  onPathChange,
  onHeadersChange,
  onAuthChange,
  onBodyChange,
  onBodyFormChange,
  onBodyKindChange,
  onBodyMultipartChange,
  onBodyFileChange,
  onSend,
  onFocus,
  onSelectMoreView,
  onNameChange,
  onMethodChange,
  onOptionsChange,
  onAssertionsChange,
  onChainChange,
  onImportCurl,
  onExportCurl,
  onDuplicate,
  onMove,
  onDelete,
  preparedPreview,
}: {
  document: HttpDocumentState
  visible: boolean
  focused: boolean
  position: { left: number; top: number; width: number; height: number }
  registerHeaderInput: (input: InputRenderable | null) => void
  registerBodyEditor: (editor: TextareaRenderable | null) => void
  registerRawScroll: (scroll: ScrollBoxRenderable | null) => void
  onSelectView: (view: HttpRequestView, focusControl?: boolean) => void
  onSelectMoreView: (view: HttpRequestMoreView) => void
  onQueryChange: (entries: HttpKeyValue[]) => void
  onPathChange: (entries: HttpKeyValue[]) => void
  onHeadersChange: (headers: HttpKeyValue[]) => void
  onAuthChange: (auth: HttpAuth) => void
  onBodyChange: (value: string) => void
  onBodyFormChange: (entries: HttpKeyValue[]) => void
  onBodyKindChange: (kind: HttpBodyKind) => void
  onBodyMultipartChange: (parts: HttpMultipartPart[]) => void
  onBodyFileChange: (path: string) => void
  onSend: () => void
  onFocus: () => void
  onNameChange: (name: string) => void
  onMethodChange: (method: string) => void
  onOptionsChange: (options: HttpDocumentState["request"]["options"]) => void
  onAssertionsChange: (assertions: HttpAssertionDefinition[]) => void
  onChainChange: (chain: { dependsOn?: string; extract: HttpChainExtraction[] }) => void
  onImportCurl: () => void
  onExportCurl: () => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
  preparedPreview: HttpPreparedRequestPreview | null
}) {
  const bodyEditorRef = useRef<TextareaRenderable | null>(null)
  const fileInputRef = useRef<InputRenderable | null>(null)
  const [parameterSection, setParameterSection] = useState<HttpParameterSection>("query")
  const request = document.request
  const dirty = document.revision !== document.savedRevision
  const dense = position.height <= 10
  // More needs four visible option rows in addition to the pane and local tab chrome.
  const denseMore = position.height < 14
  const bodyDisabled = request.body.kind === "none"
  const textBody =
    request.body.kind === "json" || request.body.kind === "text" || request.body.kind === "xml"

  const focusParameterSection = (section: HttpParameterSection) => {
    onFocus()
    setParameterSection(section)
  }

  if (request.source.kind === "file" && request.source.supported === false) {
    return (
      <box
        id={`http-request-pane-${request.id}`}
        visible={visible}
        style={{
          position: "absolute",
          ...position,
          ...focusedPanelBorder(focused, COLORS.http),
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          overflow: "hidden",
        }}
      >
        {dense ? null : <RequestPaneTitle dirty={false} />}
        <HttpOpaqueRequestContent
          requestId={request.id}
          rawText={request.source.rawText ?? ""}
          registerScroll={registerRawScroll}
          onFocus={onFocus}
          active={visible && focused}
        />
      </box>
    )
  }

  return (
    <box
      id={`http-request-pane-${request.id}`}
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        ...focusedPanelBorder(focused, COLORS.http),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
    >
      {visible && focused ? (
        <HttpRequestPaneKeyboard
          document={document}
          parameterSection={parameterSection}
          onParameterSectionChange={setParameterSection}
          onQueryChange={onQueryChange}
          onPathChange={onPathChange}
          onHeadersChange={onHeadersChange}
          onBodyFormChange={onBodyFormChange}
          onBodyMultipartChange={onBodyMultipartChange}
        />
      ) : null}
      {dense ? null : <RequestPaneTitle dirty={dirty} />}
      <HttpRequestViewTabs
        current={document.requestView}
        focused={focused}
        onFocus={onFocus}
        onSelect={onSelectView}
      />
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
            dense={dense}
            showAddAction={focused && parameterSection === "query"}
            sectionFocused={focused && parameterSection === "query"}
            onSectionFocus={() => focusParameterSection("query")}
          />
          <HttpKeyValueEditor
            idPrefix={`${request.id}-path`}
            title="PATH PARAMS"
            entries={request.path}
            onChange={onPathChange}
            dense={dense}
            showAddAction={focused && parameterSection === "path"}
            sectionFocused={focused && parameterSection === "path"}
            onSectionFocus={() => focusParameterSection("path")}
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
            dense={dense}
            showAddAction={focused}
          />
        </box>
        <box
          visible={document.requestView === "body"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <HttpBodyKindButtons
            kind={request.body.kind}
            focused={focused}
            onChange={onBodyKindChange}
          />
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
              dense={dense}
              showAddAction={focused}
            />
          </box>
          <box visible={request.body.kind === "multipart"} style={{ flexGrow: 1 }}>
            <HttpMultipartEditor
              requestId={request.id}
              parts={request.body.multipart ?? []}
              onChange={onBodyMultipartChange}
              active={visible && focused}
            />
          </box>
          <box visible={request.body.kind === "file"} style={{ flexGrow: 1, paddingTop: 1 }}>
            <text
              content={translateUi("ARQUIVO RELATIVO AO PROJETO")}
              style={{ fg: COLORS.muted }}
            />
            <input
              ref={fileInputRef}
              id={`http-key-value-file-${request.id}`}
              value={request.body.filePath ?? ""}
              placeholder={translateUi("CAMINHO DO ARQUIVO")}
              onInput={onBodyFileChange}
              onMouseDown={() => fileInputRef.current?.focus()}
              style={{
                backgroundColor: COLORS.canvas,
                focusedBackgroundColor: COLORS.panelRaised,
              }}
            />
            <text
              content={translateUi("Arquivos fora do projeto e symlinks externos são bloqueados.")}
              style={{ fg: COLORS.warning }}
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
          <HttpAuthEditor
            requestId={request.id}
            auth={request.auth}
            focused={focused}
            onChange={onAuthChange}
          />
        </box>
        <box
          visible={document.requestView === "more"}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            padding: denseMore ? 0 : 1,
          }}
        >
          <HttpRequestMoreEditor
            document={document}
            dense={denseMore}
            focused={focused}
            onSelectView={onSelectMoreView}
            onNameChange={onNameChange}
            onMethodChange={onMethodChange}
            onOptionsChange={onOptionsChange}
            onAssertionsChange={onAssertionsChange}
            onChainChange={onChainChange}
            onImportCurl={onImportCurl}
            onExportCurl={onExportCurl}
            onDuplicate={onDuplicate}
            onMove={onMove}
            onDelete={onDelete}
            onFocus={onFocus}
            preview={preparedPreview}
          />
        </box>
      </box>
      {LAYOUT.compact || dense ? null : (
        <text
          content={translateUi("[Ctrl+Enter] Enviar · [Esc] Sair do editor")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
