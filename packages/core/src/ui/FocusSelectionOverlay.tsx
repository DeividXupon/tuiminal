import { translateUi } from "../i18n/index"
import { COLORS } from "../settings/theme"
import { BRAND_COLOR } from "./brand"
import { ShortcutText } from "./ShortcutText"

const DIM_COLOR = "#000000"

/**
 * Paint layer for "choose a box" navigation. Place it as the last child of a
 * `position: "relative"` target; the owning feature keeps keyboard selection.
 */
export function FocusSelectionOverlay({
  id,
  selected,
  onFocus,
}: {
  id: string
  selected: boolean
  onFocus: () => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: every target also supports Enter through the owning keyboard handler.
    <box
      id={`${id}-focus-selection`}
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={700}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onFocus()
      }}
    >
      {selected ? (
        <>
          <box
            id={`${id}-focus-selection-tint`}
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
              id={`${id}-focus-selection-prompt`}
              style={{
                maxWidth: "100%",
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 0,
                paddingLeft: 1,
                paddingRight: 1,
                border: true,
                borderStyle: "single",
                borderColor: BRAND_COLOR,
                backgroundColor: COLORS.panelRaised,
              }}
            >
              <ShortcutText
                content={translateUi("Pressione [Enter] para focar")}
                style={{ flexShrink: 1, fg: COLORS.text, bg: COLORS.panelRaised }}
              />
            </box>
          </box>
        </>
      ) : (
        <box
          id={`${id}-focus-selection-dim`}
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
