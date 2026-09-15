import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { nextHttpRequestView } from "../model/request-view-navigation"
import type { HttpRequestView } from "../model/types"

const HTTP_REQUEST_VIEWS = ["params", "headers", "body", "auth", "more"] as const

function requestViewLabel(view: HttpRequestView) {
  return {
    params: "Parâmetros",
    headers: "Headers",
    body: "Body",
    auth: "Autenticação",
    more: "Mais",
  }[view]
}

export function HttpRequestViewTabs({
  current,
  focused,
  onFocus,
  onSelect,
}: {
  current: HttpRequestView
  focused: boolean
  onFocus: () => void
  onSelect: (view: HttpRequestView, focusControl?: boolean) => void
}) {
  const select = (view: HttpRequestView, focusControl = true) => {
    onFocus()
    onSelect(view, focusControl)
  }
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panelRaised,
        overflow: "hidden",
      }}
    >
      {focused ? (
        <DirectionalButton
          id="http-request-view-previous"
          direction={-1}
          accent={COLORS.http}
          onPress={() => select(nextHttpRequestView(current, -1), false)}
        />
      ) : null}
      {HTTP_REQUEST_VIEWS.map((view) => (
        <InlineButton
          key={view}
          id={`http-request-view-${view}`}
          label={requestViewLabel(view)}
          accent={COLORS.http}
          active={current === view}
          onPress={() => select(view)}
        />
      ))}
      {focused ? (
        <DirectionalButton
          id="http-request-view-next"
          direction={1}
          accent={COLORS.http}
          onPress={() => select(nextHttpRequestView(current, 1), false)}
        />
      ) : null}
    </box>
  )
}
