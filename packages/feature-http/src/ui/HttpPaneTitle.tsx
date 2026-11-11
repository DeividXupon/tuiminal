import { useRenderer } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export function HttpPaneTitle({
  pane,
  requestId,
  onFocus,
}: {
  pane: "request" | "response"
  requestId: string
  onFocus: () => void
}) {
  const renderer = useRenderer()
  return (
    <box flexDirection="row" flexShrink={0}>
      <text
        content={translateUi(pane === "request" ? "REQUISIÇÃO" : "RESPOSTA")}
        fg={COLORS.http}
      />
      <InlineButton
        id={`http-${pane}-focus-${requestId}`}
        label={pane === "request" ? "[R]" : "[Shift+R]"}
        accent={COLORS.http}
        onPress={() => {
          renderer.currentFocusedRenderable?.blur()
          onFocus()
          renderer.root.findDescendantById(`http-${pane}-pane-${requestId}`)?.focus()
        }}
      />
    </box>
  )
}
