import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../core/settings/theme"
import { translateUi } from "../../shared/i18n"
import { ShortcutText } from "../../shared/ui/ShortcutText"

export function GitConfigurationGroup({
  visible,
  selected,
  compact,
  onSelect,
  onOpen,
}: {
  visible: boolean
  selected: boolean
  compact: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  if (!visible) return null
  return (
    <>
      <text
        content={`── ${translateUi("CONFIGURAÇÕES DO GIT")} ${"─".repeat(64)}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box id="configuration-group-git" style={{ height: compact ? 2 : 3, flexShrink: 0 }}>
        <box
          id="configuration-section-git"
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: selected ? COLORS.panelRaised : COLORS.canvas,
          }}
        >
          <text content={`${selected ? "◆" : "◇"} GIT`} style={{ fg: COLORS.text }} />
          <ShortcutText content={translateUi("[Enter] configurar")} style={{ fg: COLORS.muted }} />
        </box>
        <Button
          id="configuration-open-git"
          onPress={() => {
            onSelect()
            onOpen()
          }}
          height={compact ? 1 : 2}
          flexShrink={0}
        >
          {(state) => (
            <box
              style={{
                height: compact ? 1 : 2,
                flexShrink: 0,
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
              }}
            >
              <text
                content={`◇ ${translateUi("Diffs locais, PR, Issues e repositórios")}`}
                style={{ fg: selected ? COLORS.git : COLORS.text }}
              />
              {compact ? null : (
                <text
                  content={translateUi(
                    "Escolha o Git local dos Diffs e edite seletores e repositórios remotos.",
                  )}
                  style={{ fg: COLORS.muted }}
                />
              )}
            </box>
          )}
        </Button>
      </box>
      <box style={{ height: 1, flexShrink: 0 }} />
    </>
  )
}
