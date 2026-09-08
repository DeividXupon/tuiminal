import { Button } from "@tuiparts/react/button"
import {
  COLORS,
  PALETTE_OPTIONS,
  paletteFor,
  type ColorMode,
  type PaletteId,
} from "../../core/settings/theme"
import { padDisplayEnd, translateUi } from "../../shared/i18n/index"
import { ShortcutText } from "../../shared/ui/ShortcutText"
import { PALETTE_ROWS } from "../model/configuration-options"

function PaletteChoice({
  id,
  label,
  description,
  colorMode,
  selected,
  compact,
  onPress,
}: {
  id: PaletteId
  label: string
  description: string
  colorMode: ColorMode
  selected: boolean
  compact: boolean
  onPress: () => void
}) {
  const palette = paletteFor(id, colorMode)
  return (
    <Button onPress={onPress} width={compact ? "50%" : "100%"} height={1} flexShrink={0}>
      {(state) => (
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`${selected ? "◆" : "◇"} ${padDisplayEnd(label, 10)}`}
            style={{ width: 13, flexShrink: 0, fg: selected ? COLORS.focus : COLORS.text }}
          />
          <text content=" ◆" style={{ fg: palette.focus }} />
          <text content="◆" style={{ fg: palette.database }} />
          <text content="◆" style={{ fg: palette.git }} />
          <text content="◆ " style={{ fg: palette.terminal }} />
          {compact ? null : (
            <text content={translateUi(description)} style={{ fg: COLORS.muted }} />
          )}
        </box>
      )}
    </Button>
  )
}

export function PaletteConfigurationGroup({
  selected,
  palette,
  colorMode,
  compact,
  onSelect,
  onChange,
}: {
  selected: boolean
  palette: PaletteId
  colorMode: ColorMode
  compact: boolean
  onSelect: () => void
  onChange: (palette: PaletteId) => void
}) {
  const options = compact ? PALETTE_ROWS : PALETTE_OPTIONS.map((option) => [option])
  return (
    <box id="configuration-group-palette" style={{ height: options.length + 1, flexShrink: 0 }}>
      <box
        id="configuration-section-palette"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: selected ? COLORS.panelRaised : COLORS.canvas,
        }}
      >
        <text
          content={`${selected ? "◆" : "◇"} ${translateUi("PALETA")}`}
          style={{ fg: COLORS.text }}
        />
        <ShortcutText content={translateUi("[←/→] alterar")} style={{ fg: COLORS.muted }} />
      </box>
      {options.map((row) => (
        <box
          key={row.map((option) => option.id).join("-")}
          style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
        >
          {row.map((option) => (
            <PaletteChoice
              key={option.id}
              {...option}
              colorMode={colorMode}
              compact={compact}
              selected={palette === option.id}
              onPress={() => {
                onSelect()
                onChange(option.id)
              }}
            />
          ))}
        </box>
      ))}
    </box>
  )
}
