import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_BODY_KINDS, nextHttpBodyKind } from "../model/body-kind-navigation"
import type { HttpBodyKind } from "../model/types"
import { HttpPaneTitle } from "./HttpPaneTitle"

export function HttpBodyKindButtons({
  kind,
  focused,
  onChange,
}: {
  kind: HttpBodyKind
  focused: boolean
  onChange: (kind: HttpBodyKind) => void
}) {
  return (
    <box style={{ minHeight: 1, flexShrink: 0, flexDirection: "row", flexWrap: "wrap" }}>
      {focused ? (
        <DirectionalButton
          id="http-body-kind-previous"
          direction={-1}
          level="nested"
          accent={COLORS.http}
          onPress={() => onChange(nextHttpBodyKind(kind, -1))}
        />
      ) : null}
      {HTTP_BODY_KINDS.map((candidate) => (
        <InlineButton
          key={candidate}
          id={`http-body-kind-${candidate}`}
          label={candidate === "none" ? "Nenhum" : candidate.toUpperCase()}
          accent={COLORS.http}
          active={kind === candidate}
          onPress={() => onChange(candidate)}
        />
      ))}
      {focused ? (
        <DirectionalButton
          id="http-body-kind-next"
          direction={1}
          level="nested"
          accent={COLORS.http}
          onPress={() => onChange(nextHttpBodyKind(kind, 1))}
        />
      ) : null}
    </box>
  )
}

export function RequestPaneTitle({
  dirty,
  requestId,
  onFocus,
}: {
  dirty: boolean
  requestId: string
  onFocus: () => void
}) {
  return (
    <box
      style={{
        minHeight: 1,
        flexShrink: 0,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
      }}
    >
      <HttpPaneTitle pane="request" requestId={requestId} onFocus={onFocus} />
      <text
        content={dirty ? translateUi("● MODIFICADO") : translateUi("SALVO")}
        style={{ fg: dirty ? COLORS.warning : COLORS.muted }}
      />
    </box>
  )
}
