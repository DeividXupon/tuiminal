import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_RESPONSE_MORE_VIEWS, nextHttpResponseMoreView } from "../model/nested-view-navigation"
import type { HttpResponseMoreView, HttpResponseSnapshot } from "../model/types"

function moreTabLabel(
  view: HttpResponseMoreView,
  response: HttpResponseSnapshot,
  cookieCount: number,
) {
  if (view === "summary") return "Resumo"
  if (view === "cookies") return `Cookies ${cookieCount}`
  if (view === "redirects") return `Redirects ${response.redirects.length}`
  if (view === "assertions") {
    const failures = response.assertions?.filter((assertion) => !assertion.passed).length ?? 0
    return `Assertions ${response.assertions?.length ?? 0}${failures ? ` ×${failures}` : ""}`
  }
  return "Console"
}

export function HttpResponseMoreTabs({
  active,
  response,
  cookieCount,
  focused,
  onChange,
}: {
  active: HttpResponseMoreView
  response: HttpResponseSnapshot
  cookieCount: number
  focused: boolean
  onChange: (moreView: HttpResponseMoreView) => void
}) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", overflow: "hidden" }}>
      {focused ? (
        <DirectionalButton
          id="http-response-more-previous"
          direction={-1}
          level="nested"
          accent={COLORS.http}
          onPress={() => onChange(nextHttpResponseMoreView(active, -1))}
        />
      ) : null}
      {HTTP_RESPONSE_MORE_VIEWS.map((view) => (
        <InlineButton
          key={view}
          label={moreTabLabel(view, response, cookieCount)}
          accent={COLORS.http}
          active={active === view}
          onPress={() => onChange(view)}
        />
      ))}
      {focused ? (
        <DirectionalButton
          id="http-response-more-next"
          direction={1}
          level="nested"
          accent={COLORS.http}
          onPress={() => onChange(nextHttpResponseMoreView(active, 1))}
        />
      ) : null}
    </box>
  )
}
