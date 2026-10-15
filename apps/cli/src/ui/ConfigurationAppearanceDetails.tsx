import { Button } from "@tuiparts/react/button"
import {
  LANGUAGE_OPTIONS,
  padDisplayEnd,
  translateUi,
  type LanguageId,
} from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  PALETTE_OPTIONS,
  paletteFor,
  type ColorMode,
  type LayoutMode,
  type PaletteId,
  type UiSettings,
} from "@xupon/tuiminal-core/settings/theme"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"

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
    <Button onPress={onPress} width="50%" height={compact ? 2 : 4} flexShrink={0}>
      {(state) => (
        <box
          style={{
            width: "100%",
            height: compact ? 2 : 4,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selected || state.focused ? preview.panelRaised : preview.panel,
          }}
        >
          <text
            content={`${selected ? "◆" : "◇"} ${translateUi(dark ? "DARK" : "LIGHT")}`}
            style={{ fg: selected ? COLORS.focus : preview.text }}
          />
          {compact ? null : (
            <text
              content={translateUi(
                dark ? "fundos escuros · contraste noturno" : "fundos claros · contraste diurno",
              )}
              style={{ fg: preview.muted }}
            />
          )}
          <text content="◆ ◆ ◆ ◆" style={{ fg: preview.focus }} />
        </box>
      )}
    </Button>
  )
}

export function ColorModeDetail({
  settings,
  notice,
  onChange,
  compact,
  contentWidth,
}: {
  settings: UiSettings
  notice: string
  onChange: (mode: ColorMode) => void
  compact: boolean
  contentWidth: number
}) {
  return (
    <>
      <ConfigurationDetailHeader
        section="colorMode"
        notice={notice}
        compact={compact}
        contentWidth={contentWidth}
      />
      <box style={{ height: compact ? 2 : 4, flexShrink: 0, flexDirection: "row" }}>
        {(["dark", "light"] as const).map((mode) => (
          <ColorModeChoice
            key={mode}
            mode={mode}
            palette={settings.palette}
            selected={settings.colorMode === mode}
            compact={compact}
            onPress={() => onChange(mode)}
          />
        ))}
      </box>
    </>
  )
}

export function PaletteDetail({
  settings,
  notice,
  onChange,
  compact,
  contentWidth,
}: {
  settings: UiSettings
  notice: string
  onChange: (palette: PaletteId) => void
  compact: boolean
  contentWidth: number
}) {
  return (
    <>
      <ConfigurationDetailHeader
        section="palette"
        notice={notice}
        compact={compact}
        contentWidth={contentWidth}
      />
      <box style={{ height: PALETTE_OPTIONS.length, flexShrink: 0 }}>
        {PALETTE_OPTIONS.map((option) => {
          const palette = paletteFor(option.id, settings.colorMode)
          const selected = settings.palette === option.id
          return (
            <Button
              key={option.id}
              id={`configuration-palette-${option.id}`}
              onPress={() => onChange(option.id)}
              width="100%"
              height={1}
              flexShrink={0}
            >
              {(state) => (
                <box
                  style={{
                    width: "100%",
                    height: 1,
                    flexDirection: "row",
                    backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <text
                    content={`${selected ? "◆" : "◇"} ${padDisplayEnd(option.label, 12)}`}
                    style={{ width: 15, flexShrink: 0, fg: selected ? COLORS.focus : COLORS.text }}
                  />
                  <text content="◆" style={{ fg: palette.focus }} />
                  <text content="◆" style={{ fg: palette.database }} />
                  <text content="◆" style={{ fg: palette.git }} />
                  <text content="◆  " style={{ fg: palette.terminal }} />
                  {compact ? null : (
                    <text content={translateUi(option.description)} style={{ fg: COLORS.muted }} />
                  )}
                </box>
              )}
            </Button>
          )
        })}
      </box>
    </>
  )
}

function LayoutChoice({
  mode,
  selected,
  compact,
  onPress,
}: {
  mode: LayoutMode
  selected: boolean
  compact: boolean
  onPress: () => void
}) {
  const framed = mode === "framed"
  const height = compact ? 3 : 4
  const marker = selected ? "◆" : "◇"
  const label = translateUi(framed ? "MOLDURADO" : "COMPACTO")
  const firstPreviewRow = framed ? "┌────┐  ┌────┐" : "▌──────│──────"
  const secondPreviewRow = framed ? "└────┘  └────┘" : "│──────│──────"
  const previewColor = framed ? COLORS.border : COLORS.focus
  const description = translateUi(
    framed ? "gaps e bordas arredondadas" : "sem gaps · fundos alternados",
  )
  return (
    <Button onPress={onPress} width="50%" height={height} flexShrink={0}>
      {(state) => (
        <box
          style={{
            width: "100%",
            height,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
          }}
        >
          <text
            content={`${marker} ${label}`}
            style={{ fg: selected ? COLORS.focus : COLORS.text }}
          />
          <text content={firstPreviewRow} style={{ fg: previewColor }} />
          <text content={secondPreviewRow} style={{ fg: COLORS.border }} />
          {compact ? null : <text content={description} style={{ fg: COLORS.muted }} />}
        </box>
      )}
    </Button>
  )
}

export function LayoutDetail({
  settings,
  notice,
  onChange,
  compact,
  contentWidth,
}: {
  settings: UiSettings
  notice: string
  onChange: (layout: LayoutMode) => void
  compact: boolean
  contentWidth: number
}) {
  return (
    <>
      <ConfigurationDetailHeader
        section="layout"
        notice={notice}
        compact={compact}
        contentWidth={contentWidth}
      />
      <box style={{ height: compact ? 3 : 4, flexShrink: 0, flexDirection: "row" }}>
        {(["framed", "compact"] as const).map((layout) => (
          <LayoutChoice
            key={layout}
            mode={layout}
            selected={settings.layout === layout}
            compact={compact}
            onPress={() => onChange(layout)}
          />
        ))}
      </box>
    </>
  )
}

export function LanguageDetail({
  settings,
  notice,
  onChange,
  compact,
  contentWidth,
}: {
  settings: UiSettings
  notice: string
  onChange: (language: LanguageId) => void
  compact: boolean
  contentWidth: number
}) {
  return (
    <>
      <ConfigurationDetailHeader
        section="language"
        notice={notice}
        compact={compact}
        contentWidth={contentWidth}
      />
      <box style={{ height: 6, flexShrink: 0 }}>
        {LANGUAGE_OPTIONS.map((language) => {
          const selected = settings.language === language.id
          return (
            <Button
              key={language.id}
              id={`configuration-language-${language.id}`}
              onPress={() => onChange(language.id)}
              width="100%"
              height={1}
              flexShrink={0}
            >
              {(state) => (
                <box
                  style={{
                    width: "100%",
                    height: 1,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <text
                    content={`${selected ? "◆" : "◇"} ${language.nativeName}`}
                    style={{ fg: selected ? COLORS.focus : COLORS.text }}
                  />
                  <text content={language.shortName} style={{ fg: COLORS.muted }} />
                </box>
              )}
            </Button>
          )
        })}
      </box>
    </>
  )
}
