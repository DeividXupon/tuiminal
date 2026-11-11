import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
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
    <box
      style={{ height: mode === "minimum" ? 2 : 1, flexShrink: 0, backgroundColor: COLORS.panel }}
    >
      {mode === "minimum" ? (
        <box style={{ height: 1, flexDirection: "row" }}>
          <InlineButton
            id="http-pane-request"
            label="Requisição"
            accent={COLORS.http}
            active={activePane === "request"}
            onPress={() => onPane("request")}
          />
          <InlineButton
            id="http-pane-response"
            label="Resposta"
            accent={COLORS.http}
            active={activePane === "response"}
            onPress={() => onPane("response")}
          />
        </box>
      ) : null}
      <box style={{ height: 1, flexDirection: "row" }}>
        <InlineButton
          id="http-pane-collection"
          label="[C] Coleção"
          accent={COLORS.http}
          active={navigationOpen && navigationView === "collection"}
          onPress={() => onNavigation("collection")}
        />
        <InlineButton
          id="http-pane-environments"
          label="[E] Ambientes"
          accent={COLORS.http}
          active={navigationOpen && navigationView === "environments"}
          onPress={() => onNavigation("environments")}
        />
      </box>
    </box>
  )
}
