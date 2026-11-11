import type { HttpOAuthContext } from "./HttpOAuth2Controls"
import type { HttpChainingKeyRef } from "../hooks/use-http-chaining-navigation"
import { HttpBoxSelection } from "./HttpBoxSelection"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import type { InputRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { useRef, useState } from "react"
import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type {
  HttpAuth,
  HttpProjectRequestItem,
  HttpAssertionDefinition,
  HttpBodyKind,
  HttpChainExtraction,
  HttpDocumentState,
  HttpKeyValue,
  HttpMultipartPart,
  HttpRequestView,
  HttpRequestMoreView,
} from "../model/types"
import type { HttpOptionsKeyRef } from "../hooks/use-http-options-navigation"
import type { HttpAssertionsKeyRef } from "../hooks/use-http-assertions-navigation"
import type { HttpParameterSection } from "../model/parameter-navigation"
import {
  consumeHttpRequestTableKey,
  useHttpRequestTables,
  type HttpRequestTableKey,
} from "../hooks/use-http-request-tables"
import type { HttpPreparedRequestPreview } from "../services/request-preview"
import { HttpAuthEditor } from "./HttpAuthEditor"
import { HttpKeyValueEditor } from "./HttpKeyValueEditor"
import { HttpMultipartEditor } from "./HttpMultipartEditor"
import { HttpOpaqueRequestContent } from "./HttpOpaqueRequestContent"
import { HttpRequestMoreEditor } from "./HttpRequestMoreEditor"
import { HttpBodyKindButtons, RequestPaneTitle } from "./HttpRequestPaneControls"
import { HttpRequestViewTabs } from "./HttpRequestViewTabs"
import { HttpBodyEditor } from "./HttpBodyEditor"
import { HttpBodyFile } from "./HttpBodyFile"
import { HttpRequestScripts } from "./HttpRequestScripts"

function requestEditorHint(document: HttpDocumentState) {
  const form =
    document.requestView === "auth" ||
    (document.requestView === "more" && document.requestMoreView !== "preview")
  return form
    ? "[Enter] Editar · [Tab] Campos · [Esc] Voltar"
    : "[Ctrl+Enter] Enviar · [Esc] Sair do editor"
}

function bodyFilePath(document: HttpDocumentState) {
  const body = document.request.body
  return body.kind === "file" ? (body.filePath ?? "") : ""
}

function showRequestEditorHint(document: HttpDocumentState, dense: boolean) {
  return !(
    LAYOUT.compact ||
    dense ||
    (document.requestView === "more" &&
      ["options", "assertions", "chaining", "docs"].includes(document.requestMoreView))
  )
}

export function HttpRequestPane({
  document,
  oauthContext,
  requestTableKeyRef,
  chainRequests,
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
  onBodyFilesChange,
  onSend,
  onFocus,
  onSelectMoreView,
  onNameChange,
  onDocsChange,
  onScriptsChange,
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
  chainRequests: HttpProjectRequestItem[]
  document: HttpDocumentState
  oauthContext?: HttpOAuthContext | undefined
  requestTableKeyRef: { current: ((key: HttpRequestTableKey) => boolean) | null }
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
  onBodyFilesChange: (paths: string[]) => void
  onSend: () => void
  onFocus: () => void
  onNameChange: (name: string) => void
  onScriptsChange: (value: NonNullable<HttpDocumentState["request"]["scripts"]>) => void
  onDocsChange: (value: string) => void
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
  const [parameterSection, setParameterSection] = useState<HttpParameterSection>("query")
  const request = document.request
  const optionsKeyRef = useRef<HttpOptionsKeyRef["current"]>(null)
  const assertionsKeyRef = useRef<HttpAssertionsKeyRef["current"]>(null)
  const chainingKeyRef = useRef<HttpChainingKeyRef["current"]>(null)
  useWorkspaceRepaint(
    JSON.stringify([
      document.requestView,
      document.requestMoreView,
      request.body.kind,
      parameterSection,
    ]),
    visible,
  )
  const dense = position.height <= 10
  const bodyDisabled = request.body.kind === "none"
  const tables = useHttpRequestTables({
    request,
    view: document.requestView,
    focused: visible && focused,
    parameterSection,
    onParameterSectionChange: setParameterSection,
    onFocus,
    changes: {
      query: onQueryChange,
      path: onPathChange,
      header: onHeadersChange,
      form: onBodyFormChange,
      multipart: onBodyMultipartChange,
    },
  })
  if (visible && focused) {
    requestTableKeyRef.current = (key) =>
      consumeHttpRequestTableKey(key, (event) => {
        if (document.requestView !== "more") return tables.handleKey(event)
        const handler = {
          options: optionsKeyRef.current,
          assertions: assertionsKeyRef.current,
          chaining: chainingKeyRef.current,
          preview: null,
          docs: null,
        }[document.requestMoreView]
        return handler?.(event) ?? false
      })
  }

  const paneStyle = {
    position: "absolute" as const,
    ...position,
    ...focusedPanelBorder(focused, COLORS.http),
    backgroundColor: COLORS.panel,
    paddingLeft: 1,
    paddingRight: 1,
    overflow: "hidden" as const,
  }
  if (request.source.kind === "file" && request.source.supported === false) {
    return (
      <box id={`http-request-pane-${request.id}`} focusable visible={visible} style={paneStyle}>
        {dense ? null : <RequestPaneTitle dirty={false} requestId={request.id} onFocus={onFocus} />}
        <HttpBoxSelection id={`http-request-pane-${request.id}`} />
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
    <box id={`http-request-pane-${request.id}`} focusable visible={visible} style={paneStyle}>
      <HttpBoxSelection id={`http-request-pane-${request.id}`} />
      {dense ? null : (
        <RequestPaneTitle
          dirty={document.revision !== document.savedRevision}
          requestId={request.id}
          onFocus={onFocus}
        />
      )}
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
            fillHeight
            entries={request.query}
            onChange={onQueryChange}
            dense={dense}
            navigation={tables.keyValueNavigation("query")}
          />
          <HttpKeyValueEditor
            idPrefix={`${request.id}-path`}
            title="PATH PARAMS"
            fillHeight
            entries={request.path}
            onChange={onPathChange}
            dense={dense}
            navigation={tables.keyValueNavigation("path")}
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
            dense={dense}
            navigation={tables.keyValueNavigation("header")}
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
          <HttpBodyEditor
            request={request}
            visible={visible && document.requestView === "body"}
            register={registerBodyEditor}
            onFocus={onFocus}
            onChange={onBodyChange}
            onSend={onSend}
          />
          <box visible={request.body.kind === "form"} style={{ flexGrow: 1 }}>
            <HttpKeyValueEditor
              idPrefix={`${request.id}-form`}
              title="FORM URL ENCODED"
              entries={request.body.form}
              onChange={onBodyFormChange}
              dense={dense}
              navigation={tables.keyValueNavigation("form")}
            />
          </box>
          {visible &&
          document.requestView === "body" &&
          ["file", "multipart"].includes(request.body.kind) ? (
            <HttpBodyFile
              requestId={request.id}
              path={bodyFilePath(document)}
              focused={focused}
              multipart={request.body.kind === "multipart"}
              compact={position.height < 18}
              onFocus={onFocus}
              onChange={onBodyFilesChange}
            />
          ) : null}
          <box visible={request.body.kind === "multipart"} style={{ flexGrow: 1, minHeight: 0 }}>
            <HttpMultipartEditor
              requestId={request.id}
              parts={request.body.multipart ?? []}
              dense={dense}
              onChange={onBodyMultipartChange}
              navigation={tables.multipartNavigation()}
            />
          </box>
          <box
            visible={bodyDisabled}
            style={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: COLORS.canvas,
            }}
          >
            <ShortcutText content="BODY DESATIVADO" style={{ fg: COLORS.muted }} />
          </box>
        </box>
        <box
          visible={document.requestView === "auth"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <HttpAuthEditor
            requestId={request.id}
            auth={request.auth}
            oauthContext={oauthContext}
            onFocus={onFocus}
            focused={focused && document.requestView === "auth"}
            onChange={onAuthChange}
          />
        </box>
        <HttpRequestScripts
          request={request}
          visible={visible && document.requestView === "scripts"}
          active={focused}
          onFocus={onFocus}
          onChange={onScriptsChange}
        />
        <box
          visible={document.requestView === "more"}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <HttpRequestMoreEditor
            document={document}
            visible={visible && document.requestView === "more"}
            onDocsChange={onDocsChange}
            focused={visible && focused && document.requestView === "more"}
            optionsKeyRef={optionsKeyRef}
            assertionsKeyRef={assertionsKeyRef}
            chainingKeyRef={chainingKeyRef}
            chainRequests={chainRequests}
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
      {showRequestEditorHint(document, dense) ? (
        <ShortcutText
          content={requestEditorHint(document)}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      ) : null}
    </box>
  )
}
