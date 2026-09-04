import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"
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
  onChange,
}: {
  active: HttpResponseMoreView
  response: HttpResponseSnapshot
  cookieCount: number
  onChange: (moreView: HttpResponseMoreView) => void
}) {
  const views: HttpResponseMoreView[] = ["summary", "cookies", "redirects", "assertions", "console"]
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", overflow: "hidden" }}>
      {views.map((view) => (
        <InlineButton
          key={view}
          label={moreTabLabel(view, response, cookieCount)}
          accent={COLORS.http}
          active={active === view}
          onPress={() => onChange(view)}
        />
      ))}
    </box>
  )
}
