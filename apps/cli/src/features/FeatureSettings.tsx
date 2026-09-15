import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
export function FeatureSettings({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  return (
    <box id="configuration-group-features" style={{ height: 3, flexShrink: 0, marginTop: 1 }}>
      <text content={translateUi("FERRAMENTAS OFICIAIS")} style={{ fg: COLORS.text }} />
      <InlineButton
        id="configuration-open-features"
        label="[Enter] Gerenciar ferramentas"
        active={active}
        accent={COLORS.focus}
        onPress={onOpen}
      />
      <text
        content={translateUi("Instale mais ferramentas para esta versão do Tuiminal.")}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
