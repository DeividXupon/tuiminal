import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
export function TutorialSetting({
  visible,
  active,
  compact,
  tutorialLabel,
  onStartTutorial,
}: {
  visible: boolean
  active: boolean
  compact: boolean
  tutorialLabel: string
  onStartTutorial: () => void
}) {
  if (!visible) return null
  return (
    <box id="configuration-group-tutorial" style={{ height: compact ? 2 : 3, flexShrink: 0 }}>
      <box
        id="configuration-section-tutorial"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: active ? COLORS.panelRaised : COLORS.canvas,
        }}
      >
        <text
          content={`${active ? "◆" : "◇"} ${translateUi("TUTORIAL")}`}
          style={{ fg: COLORS.text }}
        />
        <ShortcutText content="[Enter] iniciar" style={{ fg: COLORS.muted }} />
      </box>

      <Button
        id="configuration-start-tutorial"
        onPress={() => {
          onStartTutorial()
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
              backgroundColor: active || state.focused ? COLORS.panelRaised : COLORS.panel,
            }}
          >
            <text
              content={`▶ Tour guiado · ${translateUi(tutorialLabel)}`}
              style={{ fg: active ? COLORS.focus : COLORS.text }}
            />
            {compact ? null : (
              <text
                content="Explica blocos, controles, ações e atalhos em contexto."
                style={{ fg: COLORS.muted }}
              />
            )}
          </box>
        )}
      </Button>
    </box>
  )
}
