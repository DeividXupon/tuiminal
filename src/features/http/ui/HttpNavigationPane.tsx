import type { InputRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpNavigationView, HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"
import type { HttpHistoryEntry } from "../model/types"
import { HttpCollectionTree } from "./HttpCollectionTree"
import { HttpHistoryList } from "./HttpHistoryList"

export function HttpNavigationPane({
  state,
  visible,
  focused,
  overlay,
  position,
  onViewChange,
  onSelectDocument,
  onClose,
  onFocus,
  projectRequests,
  projectErrors,
  onOpenProjectRequest,
  onImportCollection,
  onRunCollection,
  registerCollectionSearch,
  onToggleHistory,
  onCompareHistory,
  onOpenHistory,
}: {
  state: HttpWorkspaceState
  visible: boolean
  focused: boolean
  overlay: boolean
  position: { left: number; top: number; width: number; height: number }
  onViewChange: (view: HttpNavigationView) => void
  onSelectDocument: (documentId: string) => void
  onClose: () => void
  onFocus: () => void
  projectRequests: HttpProjectRequestItem[]
  projectErrors: number
  onOpenProjectRequest: (request: HttpProjectRequestItem) => void
  onImportCollection: () => void
  onRunCollection: () => void
  registerCollectionSearch: (input: InputRenderable | null) => void
  onToggleHistory: (entryId: string) => void
  onCompareHistory: () => void
  onOpenHistory: (entry: HttpHistoryEntry) => void
}) {
  const contentWidth = Math.max(8, position.width - 4)
  const compactTabs = contentWidth < 28
  const collectionRef = useRef<ButtonRenderable | null>(null)
  const historyRef = useRef<ButtonRenderable | null>(null)
  useEffect(() => {
    if (!visible || !focused || state.overlay) return
    const timer = setTimeout(() =>
      (state.navigationView === "collection" ? collectionRef.current : historyRef.current)?.focus(),
    )
    return () => clearTimeout(timer)
  }, [focused, state.navigationView, state.overlay, visible])
  return (
    <box
      id="http-navigation-pane"
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        zIndex: overlay ? 50 : 1,
        ...panelBorder(focused ? COLORS.http : COLORS.border),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <InlineButton
          id="http-navigation-collection"
          buttonRef={collectionRef}
          label={compactTabs ? "[C]" : "[C] Coleção"}
          accent={COLORS.http}
          active={state.navigationView === "collection"}
          onPress={() => {
            onFocus()
            onViewChange("collection")
          }}
        />
        <InlineButton
          id="http-navigation-history"
          buttonRef={historyRef}
          label={compactTabs ? "[Y]" : "[Y] Histórico"}
          accent={COLORS.http}
          active={state.navigationView === "history"}
          onPress={() => {
            onFocus()
            onViewChange("history")
          }}
        />
      </box>
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, paddingTop: 1 }}>
        {state.navigationView === "collection" ? (
          <>
            <text content={translateUi("PROJETO")} style={{ fg: COLORS.muted }} />
            <HttpCollectionTree
              state={state}
              contentWidth={contentWidth}
              projectRequests={projectRequests}
              projectErrors={projectErrors}
              registerSearchInput={registerCollectionSearch}
              onFocus={onFocus}
              onOpen={onOpenProjectRequest}
              onImport={onImportCollection}
              onRun={onRunCollection}
            />
            <text content={translateUi("SCRATCH")} style={{ fg: COLORS.muted }} />
            {state.documents
              .filter((document) => document.request.source.kind === "scratch")
              .map((document) => (
                <InlineButton
                  key={document.request.id}
                  id={`http-navigation-document-${document.request.id}`}
                  label={`${document.request.method} ${truncateDisplay(
                    document.request.name,
                    Math.max(1, contentWidth - displayWidth(document.request.method) - 3),
                  )}`}
                  accent={COLORS.http}
                  active={document.request.id === state.activeDocumentId}
                  onPress={() => {
                    onFocus()
                    onSelectDocument(document.request.id)
                  }}
                />
              ))}
          </>
        ) : state.history.length ? (
          <HttpHistoryList
            state={state}
            contentWidth={contentWidth}
            projectRequests={projectRequests}
            onToggle={onToggleHistory}
            onOpen={onOpenHistory}
          />
        ) : (
          <text
            content={truncateDisplay(translateUi("Nenhuma execução nesta sessão."), contentWidth)}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      {state.navigationView === "history" && state.history.length ? (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            label={`Comparar ${state.historySelection.length}/2`}
            accent={COLORS.http}
            disabled={state.historySelection.length !== 2}
            onPress={onCompareHistory}
          />
        </box>
      ) : null}
      {overlay ? (
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      ) : null}
    </box>
  )
}
