import { TextAttributes } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { HttpSourceMode } from "../model/source-mode"

export function HttpSourceCard({
  source,
  width,
  compact,
  selected,
  loading = false,
  onHighlight,
  onSelect,
}: {
  source: HttpSourceMode
  width: number
  compact: boolean
  selected: boolean
  loading?: boolean
  onHighlight: () => void
  onSelect: () => void
}) {
  const local = source === "local"
  const accent = local ? COLORS.graphAccent : COLORS.http
  const background = selected ? COLORS.panelRaised : COLORS.panel
  return (
    <Button
      id={`http-source-${source}-card`}
      width={width}
      height={compact ? 7 : 11}
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={selected ? accent : COLORS.border}
      backgroundColor={background}
      paddingLeft={2}
      paddingRight={2}
      onMouseOver={onHighlight}
      onPress={onSelect}
    >
      <box flexGrow={1} paddingTop={compact ? 0 : 1} gap={compact ? 0 : 1}>
        <box flexDirection="row" height={1} flexShrink={0}>
          <text content={local ? "▣  " : "↗  "} fg={accent} />
          <text
            content={translateUi(local ? "HTTP LOCAL" : "POSTMAN")}
            fg={COLORS.text}
            attributes={TextAttributes.BOLD}
            flexGrow={1}
          />
          <text content={selected ? "●" : "○"} fg={selected ? accent : COLORS.muted} />
        </box>
        <box flexGrow={1}>
          <text
            content={translateUi(
              local ? "Coleções da biblioteca local" : "Coleções da conta conectada",
            )}
            fg={COLORS.text}
          />
          <text
            content={translateUi(
              local ? "Salvas neste computador" : "Mudanças enviadas ao Postman",
            )}
            fg={COLORS.muted}
          />
        </box>
        <box id={`http-source-${source}`} height={1} flexShrink={0} marginBottom={compact ? 0 : 1}>
          <ShortcutText
            content={translateUi(
              loading ? "Carregando Postman..." : local ? "[L] Abrir local" : "[P] Abrir Postman",
            )}
            style={{ fg: accent, bg: background }}
          />
        </box>
      </box>
    </Button>
  )
}
