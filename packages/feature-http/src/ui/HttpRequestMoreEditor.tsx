import { useRenderer } from "@opentui/react"
import type { HttpChainingKeyRef } from "../hooks/use-http-chaining-navigation"
import type { HttpOptionsKeyRef } from "../hooks/use-http-options-navigation"
import type { HttpAssertionsKeyRef } from "../hooks/use-http-assertions-navigation"
import type {
  HttpAssertionDefinition,
  HttpProjectRequestItem,
  HttpDocumentState,
  HttpRequestDefinition,
  HttpRequestMoreView,
} from "../model/types"
import type { HttpPreparedRequestPreview as PreparedPreview } from "../services/request-preview"
import { HttpPreparedRequestPreview } from "./HttpPreparedRequestPreview"
import { HttpRequestChainingEditor } from "./HttpRequestChainingEditor"
import { HttpRequestMoreTabs } from "./HttpRequestMoreTabs"
import { RequestOptions } from "./HttpRequestOptions"
import { HttpRequestDocs } from "./HttpRequestDocs"
import { AssertionsEditor } from "./HttpAssertionsEditor"

export function HttpRequestMoreEditor({
  document,
  visible,
  onDocsChange,
  focused,
  optionsKeyRef,
  assertionsKeyRef,
  chainingKeyRef,
  chainRequests,
  onSelectView,
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
  onFocus,
  preview,
}: {
  visible: boolean
  onDocsChange: (value: string) => void
  document: HttpDocumentState
  focused: boolean
  optionsKeyRef: HttpOptionsKeyRef
  assertionsKeyRef: HttpAssertionsKeyRef
  chainingKeyRef: HttpChainingKeyRef
  chainRequests: HttpProjectRequestItem[]
  onSelectView: (view: HttpRequestMoreView) => void
  onNameChange: (name: string) => void
  onMethodChange: (method: string) => void
  onOptionsChange: (options: HttpRequestDefinition["options"]) => void
  onAssertionsChange: (assertions: HttpAssertionDefinition[]) => void
  onChainChange: (chain: NonNullable<HttpRequestDefinition["chain"]>) => void
  onImportCurl: () => void
  onExportCurl: () => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
  onFocus: () => void
  preview: PreparedPreview | null
}) {
  const request = document.request
  const renderer = useRenderer()
  const select = (view: HttpRequestMoreView) => {
    onFocus()
    onSelectView(view)
    if (view !== "docs" || document.requestMoreView !== "docs") return
    const target =
      renderer.root.findDescendantById(`http-docs-editor-${request.id}`) ??
      renderer.root.findDescendantById(`http-request-docs-${request.id}`)
    target?.focus()
  }
  return (
    <box style={{ flexGrow: 1 }}>
      <HttpRequestMoreTabs view={document.requestMoreView} focused={focused} onChange={select} />
      <box flexGrow={1} minHeight={0}>
        <HttpRequestDocs
          request={request}
          visible={visible && document.requestMoreView === "docs"}
          focused={focused}
          onFocus={onFocus}
          onChange={onDocsChange}
        />
        {document.requestMoreView === "options" ? (
          <RequestOptions
            request={request}
            focused={focused}
            keyRef={optionsKeyRef}
            onNameChange={onNameChange}
            onMethodChange={onMethodChange}
            onOptionsChange={onOptionsChange}
            onImportCurl={onImportCurl}
            onExportCurl={onExportCurl}
            onDuplicate={onDuplicate}
            onMove={onMove}
            onDelete={onDelete}
            onFocus={onFocus}
          />
        ) : document.requestMoreView === "assertions" ? (
          <AssertionsEditor
            keyRef={assertionsKeyRef}
            requestId={request.id}
            assertions={request.assertions ?? []}
            focused={focused}
            onChange={onAssertionsChange}
            onFocus={onFocus}
          />
        ) : document.requestMoreView === "chaining" ? (
          <HttpRequestChainingEditor
            request={request}
            requests={chainRequests}
            response={
              document.execution.status === "success" ? document.execution.response : undefined
            }
            keyRef={chainingKeyRef}
            focused={focused}
            onChange={onChainChange}
            onFocus={onFocus}
          />
        ) : document.requestMoreView === "preview" ? (
          <HttpPreparedRequestPreview requestId={request.id} preview={preview} />
        ) : null}
      </box>
    </box>
  )
}
