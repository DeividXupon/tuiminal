import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { FEATURE_PRESENTATIONS } from "./presentation"
import type { FeatureId } from "./model"
export function FeatureChoice({
  id,
  canOpen,
  installed,
  busy,
  focused,
  blocked,
  checked,
  disabled,
  progress,
  removing,
  onReflow,
  onSelect,
  onToggle,
  onActivate,
  onUninstall,
}: {
  id: FeatureId
  canOpen: boolean
  installed: boolean
  busy: boolean
  focused: boolean
  blocked: boolean
  checked: boolean
  disabled: boolean
  progress: number | null
  removing: boolean
  onReflow: () => void
  onSelect: () => void
  onToggle: () => void
  onActivate: () => void
  onUninstall: () => void
}) {
  const label = removing
    ? translateUi("Desinstalando…")
    : featureActionLabel(installed, canOpen, busy, focused, progress)
  const fill = progress === null ? null : Math.max(0, Math.min(100, progress))
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI renderables handle native terminal mouse input.
    // biome-ignore lint/a11y/useKeyWithMouseEvents: The installer also selects rows with arrows and J/K.
    <box
      id={`feature-option-${id}`}
      onSizeChange={onReflow}
      onMouseDown={() => {
        if (!blocked) onSelect()
      }}
      onMouseOver={() => {
        if (!blocked) onSelect()
      }}
      style={{
        position: "relative",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
        paddingBottom: 1,
        backgroundColor: focused ? COLORS.panel : COLORS.canvas,
        border: ["left"],
        borderColor: focused ? BRAND_COLOR : COLORS.canvas,
      }}
    >
      {busy && fill !== null ? (
        <box
          id={`feature-install-progress-${id}`}
          visible={fill > 0}
          style={{
            position: "absolute",
            zIndex: 0,
            left: 0,
            top: 0,
            width: `${fill}%`,
            height: "100%",
            backgroundColor: COLORS.diffAddedBg,
          }}
        />
      ) : null}
      <box style={{ flexDirection: "row", height: 1, flexShrink: 0, zIndex: 1 }}>
        <InlineButton
          label={installed ? "✓" : checked ? "●" : "○"}
          accent={BRAND_COLOR}
          disabled={blocked || installed || disabled}
          onPress={() => {
            onSelect()
            onToggle()
          }}
        />
        <text
          content={FEATURE_PRESENTATIONS[id].title}
          style={{ fg: focused ? BRAND_COLOR : COLORS.text, flexGrow: 1, paddingLeft: 1 }}
        />
        <InlineButton
          id={`feature-install-${id}`}
          label={label}
          accent={installed ? COLORS.success : BRAND_COLOR}
          disabled={blocked || disabled || (installed && !canOpen)}
          onPress={() => onActivate()}
        />
        {installed ? (
          <InlineButton
            id={`feature-remove-${id}`}
            label={focused ? "[D] Desinstalar" : "Desinstalar"}
            accent={COLORS.danger}
            disabled={blocked || disabled}
            onPress={onUninstall}
          />
        ) : null}
      </box>
      <text
        content={translateUi(FEATURE_PRESENTATIONS[id].description)}
        style={{ fg: COLORS.muted, flexShrink: 0, paddingLeft: 2, zIndex: 1 }}
      />
    </box>
  )
}

function featureActionLabel(
  installed: boolean,
  canOpen: boolean,
  busy: boolean,
  focused: boolean,
  progress: number | null,
) {
  const action = installed ? (canOpen ? "Abrir" : "Instalada") : "Instalar"
  return busy
    ? progress === null
      ? translateUi("Carregando ferramenta…")
      : `${translateUi("Instalando…")} ${progress}%`
    : focused && (!installed || canOpen)
      ? `[Enter] ${translateUi(action)}`
      : action
}
