import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import type { TerminalFocusTargetKey } from "../model/focus-selection"
import { TerminalShortcutText } from "./TerminalShortcut"

const DIM_COLOR = "#000000"

export function TerminalFocusSelection({
  target,
  selected,
  onFocus,
}: {
  target: TerminalFocusTargetKey
  selected: boolean
  onFocus: (target: TerminalFocusTargetKey) => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: every target also supports Enter through the workspace keyboard handler.
    <box
      id={`terminal-focus-selection-${target.replace(":", "-")}`}
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={700}
      onMouseDown={(event) => {
        event.stopPropagation()
        onFocus(target)
      }}
    >
      {selected ? (
        <>
          <box
            id={`terminal-focus-selection-tint-${target.replace(":", "-")}`}
            position="absolute"
            top={0}
            left={0}
            width="100%"
            height="100%"
            backgroundColor={BRAND_COLOR}
            opacity={0.24}
          />
          <box
            position="absolute"
            top={0}
            left={0}
            width="100%"
            height="100%"
            justifyContent="center"
            alignItems="center"
          >
            <box
              id="terminal-focus-selection-prompt"
              style={{
                height: 3,
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 0,
                paddingLeft: 2,
                paddingRight: 2,
                border: true,
                borderStyle: "single",
                borderColor: BRAND_COLOR,
                backgroundColor: COLORS.panelRaised,
              }}
            >
              <TerminalShortcutText
                content={translateUi("Pressione [Enter] para focar")}
                style={{ flexShrink: 0, fg: COLORS.text, bg: COLORS.panelRaised }}
              />
            </box>
          </box>
        </>
      ) : (
        <box
          id={`terminal-focus-selection-dim-${target.replace(":", "-")}`}
          position="absolute"
          top={0}
          left={0}
          width="100%"
          height="100%"
          backgroundColor={DIM_COLOR}
          opacity={0.24}
        />
      )}
    </box>
  )
}
