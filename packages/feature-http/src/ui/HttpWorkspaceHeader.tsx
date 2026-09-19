import type { InputRenderable } from "@opentui/core"
import type { HttpCompletionKey } from "./HttpOmnibar"
import type { HttpLayout } from "../model/layout"
import type {
  HttpDocumentState,
  HttpNavigationView,
  HttpPane,
  HttpWorkspaceState,
} from "../model/types"
import type { HttpSourceMode } from "../model/source-mode"
import type { HttpWorkspaceAction } from "../model/workspace"
import { isOpaqueHttpRequest } from "../model/request-capabilities"
import { syncHttpUrlQuery } from "../model/url-query"
import { HttpDocumentBar } from "./HttpDocumentBar"
import { HttpOmnibar } from "./HttpOmnibar"
import { HttpPaneSelector } from "./HttpPaneSelector"

export function HttpWorkspaceHeader({
  document,
  state,
  layout,
  terminalWidth,
  sourceMode,
  urlRef,
  completionKeyRef,
  variableNames,
  environmentName,
  productionEnvironment,
  onChooseSource,
  onSelectDocument,
  onCloseDocument,
  onAddDocument,
  dispatch,
  onCycleMethod,
  onSend,
  onCancel,
  onOpenEnvironment,
  onNavigation,
}: {
  document: HttpDocumentState
  state: HttpWorkspaceState
  layout: HttpLayout
  terminalWidth: number
  sourceMode: HttpSourceMode
  urlRef: { current: InputRenderable | null }
  completionKeyRef: { current: ((key: HttpCompletionKey) => boolean) | null }
  variableNames: string[]
  environmentName: string | null
  productionEnvironment: boolean
  onChooseSource: () => void
  onSelectDocument: (id: string) => void
  onCloseDocument: (id: string) => void
  onAddDocument: () => void
  dispatch: (action: HttpWorkspaceAction) => void
  onCycleMethod: (direction: number) => void
  onSend: (id: string) => void
  onCancel: (id: string) => void
  onOpenEnvironment: () => void
  onNavigation: (view: HttpNavigationView) => void
}) {
  return (
    <>
      <HttpDocumentBar
        documents={state.documents}
        activeDocumentId={state.activeDocumentId}
        compact={terminalWidth < 96}
        sourceMode={sourceMode}
        onChooseSource={onChooseSource}
        onSelect={onSelectDocument}
        onClose={onCloseDocument}
        onAdd={onAddDocument}
      />
      <HttpOmnibar
        request={document.request}
        focused={state.overlay === null && state.activePane === "url"}
        twoRows={layout.omnibarRows === 2}
        running={document.execution.status === "running"}
        readOnly={isOpaqueHttpRequest(document.request)}
        urlRef={urlRef}
        completionKeyRef={completionKeyRef}
        onFocus={() => dispatch({ type: "select-pane", pane: "url" })}
        variableNames={variableNames}
        onUrlChange={(url) =>
          dispatch({
            type: "update-request",
            documentId: document.request.id,
            patch: {
              url,
              query: syncHttpUrlQuery(url, document.request.query, document.request.id),
            },
          })
        }
        onCycleMethod={onCycleMethod}
        onSend={() => onSend(document.request.id)}
        onCancel={() => onCancel(document.request.id)}
        environmentName={environmentName}
        productionEnvironment={productionEnvironment}
        onOpenEnvironment={onOpenEnvironment}
      />
      <HttpPaneSelector
        mode={layout.mode}
        activePane={state.activePane}
        navigationOpen={state.navigationOpen}
        navigationView={state.navigationView}
        onPane={(pane: HttpPane) => dispatch({ type: "select-pane", pane })}
        onNavigation={onNavigation}
      />
    </>
  )
}
