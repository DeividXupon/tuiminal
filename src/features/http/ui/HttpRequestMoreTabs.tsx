import { COLORS } from "../../../core/settings/theme"
import { DirectionalButton } from "../../../shared/ui/DirectionalButton"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { HTTP_REQUEST_MORE_VIEWS, nextHttpRequestMoreView } from "../model/nested-view-navigation"
import type { HttpRequestMoreView } from "../model/types"

export function HttpRequestMoreTabs({
  view,
  dense,
  focused,
  onChange,
}: {
  view: HttpRequestMoreView
  dense: boolean
  focused: boolean
  onChange: (view: HttpRequestMoreView) => void
}) {
  const labels: Record<HttpRequestMoreView, string> = {
    options: "Opções",
    assertions: "Assertions",
    chaining: "Chaining",
    preview: "Preview",
  }
  const buttons = HTTP_REQUEST_MORE_VIEWS.map((candidate) => (
    <InlineButton
      key={candidate}
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
  if (dense) {
    return (
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {previous}
        {buttons}
        {next}
      </box>
    )
  }
  return (
    <box style={{ height: 2, flexShrink: 0 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {previous}
        {buttons.slice(0, 2)}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {buttons.slice(2)}
        {next}
      </box>
    </box>
  )
}
