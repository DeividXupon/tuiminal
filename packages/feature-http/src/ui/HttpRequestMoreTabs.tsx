import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_REQUEST_MORE_VIEWS, nextHttpRequestMoreView } from "../model/nested-view-navigation"
import type { HttpRequestMoreView } from "../model/types"

export function HttpRequestMoreTabs({
  view,
  focused,
  onChange,
}: {
  view: HttpRequestMoreView
  focused: boolean
  onChange: (view: HttpRequestMoreView) => void
}) {
  const labels: Record<HttpRequestMoreView, string> = {
    options: "Opções",
    assertions: "Assertions",
    chaining: "Chaining",
    preview: "Preview",
    docs: "Docs",
  }
  const buttons = HTTP_REQUEST_MORE_VIEWS.map((candidate) => (
    <InlineButton
      key={candidate}
      id={`http-request-more-${candidate}`}
      label={labels[candidate]}
      accent={COLORS.http}
      active={view === candidate}
      onPress={() => onChange(candidate)}
    />
  ))
  const previous = focused ? (
    <DirectionalButton
      id="http-request-more-previous"
      direction={-1}
      level="nested"
      accent={COLORS.http}
      onPress={() => onChange(nextHttpRequestMoreView(view, -1))}
    />
  ) : null
  const next = focused ? (
    <DirectionalButton
      id="http-request-more-next"
      direction={1}
      level="nested"
      accent={COLORS.http}
      onPress={() => onChange(nextHttpRequestMoreView(view, 1))}
    />
  ) : null
  return (
    <box
      style={{
        minHeight: 1,
        flexShrink: 0,
        flexDirection: "row",
        flexWrap: "wrap",
        backgroundColor: COLORS.panelAlt,
      }}
    >
      {previous}
      {buttons}
      {next}
    </box>
  )
}
