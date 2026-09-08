import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpLayoutMode, HttpNavigationView, HttpPane } from "../model/types"

export function HttpPaneSelector({
  mode,
  activePane,
  navigationOpen,
  navigationView,
  onPane,
  onNavigation,
}: {
  mode: HttpLayoutMode
  activePane: HttpPane
  navigationOpen: boolean
  navigationView: HttpNavigationView
  onPane: (pane: HttpPane) => void
  onNavigation: (view: HttpNavigationView) => void
}) {
  if (mode !== "focus" && mode !== "minimum") return null

  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: COLORS.panel }}>
      {mode === "minimum" ? (
        <>
          <InlineButton
            id="http-pane-request"
            label="[1] Requisição"
            accent={COLORS.http}
            active={activePane === "request"}
            onPress={() => onPane("request")}
          />
          <InlineButton
            id="http-pane-response"
            label="[2] Resposta"
            accent={COLORS.http}
            active={activePane === "response"}
            onPress={() => onPane("response")}
          />
        </>
      ) : null}
      <InlineButton
        id="http-pane-collection"
        label="[C] Coleção"
        accent={COLORS.http}
        active={navigationOpen && navigationView === "collection"}
        onPress={() => onNavigation("collection")}
      />
      <InlineButton
        id="http-pane-history"
        label="[Y] Histórico"
        accent={COLORS.http}
        active={navigationOpen && navigationView === "history"}
        onPress={() => onNavigation("history")}
      />
    </box>
  )
}
