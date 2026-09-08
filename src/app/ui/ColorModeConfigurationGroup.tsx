import { Button } from "@tuiparts/react/button"
import type { ColorMode, PaletteId } from "../../core/settings/theme"
import { COLORS, paletteFor } from "../../core/settings/theme"
import { translateUi } from "../../shared/i18n/index"
import { BRAND_COLOR } from "../../shared/ui/brand"
import { ShortcutText } from "../../shared/ui/ShortcutText"

function ColorModeChoice({
  mode,
  palette,
  selected,
  compact,
  onPress,
}: {
  mode: ColorMode
  palette: PaletteId
  selected: boolean
  compact: boolean
  onPress: () => void
}) {
  const preview = paletteFor(palette, mode)
  const dark = mode === "dark"
  return (
    <Button onPress={onPress} width="50%" height={compact ? 1 : 3} flexShrink={0}>
      {(state) => (
        <box
          style={{
            width: "100%",
            height: compact ? 1 : 3,
            flexShrink: 0,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: state.focused ? preview.panelRaised : preview.panel,
          }}
        >
          <text
            content={`${selected ? "◆" : "◇"} ${translateUi(dark ? "DARK" : "LIGHT")}`}
            style={{ fg: selected ? BRAND_COLOR : preview.text }}
          />
          {compact ? null : (
            <text
              content={translateUi(
                dark ? "fundos escuros · contraste noturno" : "fundos claros · contraste diurno",
              )}
              style={{ fg: preview.muted }}
            />
          )}
        </box>
      )}
    </Button>
  )
}

export function ColorModeConfigurationGroup({
  selected,
  mode,
  palette,
  compact,
  onSelect,
  onChange,
}: {
  selected: boolean
  mode: ColorMode
  palette: PaletteId
  compact: boolean
  onSelect: () => void
  onChange: (mode: ColorMode) => void
}) {
  return (
    <box id="configuration-group-colorMode" style={{ height: compact ? 2 : 4, flexShrink: 0 }}>
      <box
        id="configuration-section-colorMode"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: selected ? COLORS.panelRaised : COLORS.canvas,
        }}
      >
        <text
          content={`${selected ? "◆" : "◇"} ${translateUi("MODO DE COR")}`}
          style={{ fg: COLORS.text }}
        />
        <ShortcutText content={translateUi("[←/→] alterar")} style={{ fg: COLORS.muted }} />
      </box>
      <box style={{ height: compact ? 1 : 3, flexShrink: 0, flexDirection: "row" }}>
        {(["dark", "light"] as const).map((option) => (
          <ColorModeChoice
            key={option}
            mode={option}
            palette={palette}
            selected={mode === option}
            compact={compact}
            onPress={() => {
              onSelect()
              onChange(option)
            }}
          />
        ))}
      </box>
    </box>
  )
}
