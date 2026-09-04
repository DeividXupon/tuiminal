import type { ButtonRenderable } from "@tuiparts/core/button"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type {
  HttpHistoryEntry,
  HttpNavigationView,
  HttpProjectRequestItem,
  HttpWorkspaceState,
} from "../model/types"
import { formatHttpDuration } from "./format"

function historyLine(entry: HttpHistoryEntry, width: number) {
  const result = entry.status ? String(entry.status) : "ERR"
  const duration = entry.durationMs === null ? "" : ` ${formatHttpDuration(entry.durationMs)}`
  return truncateDisplay(`${result} ${entry.method} ${entry.url}${duration}`, width)
}

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
}) {
  const contentWidth = Math.max(8, position.width - 4)
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
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        zIndex: overlay ? 50 : 1,
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
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <InlineButton
          id="http-navigation-collection"
          buttonRef={collectionRef}
          label="[C] Coleção"
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
          label="[Y] Histórico"
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
            {projectRequests.length ? (
              <>
                <text content={translateUi("PROJETO")} style={{ fg: COLORS.muted }} />
                {projectRequests.map((item) => (
                  <InlineButton
                    key={item.request.id}
                    id={`http-navigation-project-${item.request.id}`}
                    label={`${item.request.method} ${truncateDisplay(item.request.name, contentWidth - 8)}`}
                    accent={COLORS.http}
                    active={item.request.id === state.activeDocumentId}
                    onPress={() => {
                      onFocus()
                      onOpenProjectRequest(item)
                    }}
                  />
                ))}
              </>
            ) : (
              <text
                content={translateUi("Nenhum arquivo .http ou .rest no projeto.")}
                style={{ fg: COLORS.muted }}
              />
            )}
            {projectErrors ? (
              <text
                content={translateUi(`${projectErrors} arquivo(s) não puderam ser lidos.`)}
                style={{ fg: COLORS.warning }}
              />
            ) : null}
            <text content={translateUi("SCRATCH")} style={{ fg: COLORS.muted }} />
            {state.documents.map((document) => (
              <InlineButton
                key={document.request.id}
                id={`http-navigation-document-${document.request.id}`}
                label={`${document.request.method} ${truncateDisplay(document.request.name, contentWidth - 8)}`}
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
          state.history.map((entry) => {
            const documentOpen = state.documents.some(
              (document) => document.request.id === entry.requestId,
            )
            return (
              <InlineButton
                key={entry.id}
                id={`http-navigation-history-${entry.id}`}
                label={historyLine(entry, contentWidth)}
                accent={entry.error ? COLORS.danger : COLORS.http}
                disabled={!documentOpen}
                onPress={() => onSelectDocument(entry.requestId)}
              />
            )
          })
        ) : (
          <text
            content={translateUi("Nenhuma execução nesta sessão.")}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      {overlay ? (
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      ) : null}
    </box>
  )
}
