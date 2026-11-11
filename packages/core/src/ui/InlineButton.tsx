import type { ButtonRenderable } from "@tuiparts/core/button"
import { Button } from "@tuiparts/react/button"
import type { Ref } from "react"
import { translateUi } from "../i18n/index"
import { COLORS, LAYOUT } from "../settings/theme"
import { ShortcutText } from "./ShortcutText"
import type { ShortcutAnimation } from "./shortcut-content"

export type InlineButtonProps = {
  id?: string
  label: string
  onPress: () => void
  accent?: string
  active?: boolean
  selected?: boolean
  compact?: boolean
  disabled?: boolean
  /** Resting background; active, focused and pressed states keep their own highlight. */
  backgroundColor?: string | undefined
  highlightShortcuts?: boolean
  shortcutsMuted?: boolean | undefined
  shortcutColor?: string | undefined
  /** Explicit semantic exception, such as red tab-close shortcuts. */
  shortcutBaseColor?: string | undefined
  shortcutAnimation?: ShortcutAnimation | undefined
  /** Exact bracketed action keys to highlight in purple. */
  actionKeys?: readonly string[] | undefined
  buttonRef?: Ref<ButtonRenderable>
}

function buttonColors({
  pressed,
  selected,
  focused,
  active,
  disabled,
  accent,
  compact,
  backgroundColor,
}: {
  pressed: boolean
  selected: boolean
  focused: boolean
  active: boolean
  disabled: boolean
  accent: string
  compact: boolean
  backgroundColor?: string | undefined
}) {
  if (pressed || selected) return { fg: disabled ? COLORS.border : COLORS.canvas, bg: accent }
  const highlighted = focused || active
  return {
    fg: disabled ? COLORS.border : highlighted ? accent : COLORS.muted,
    bg: highlighted
      ? compact
        ? COLORS.diffModifiedBg
        : COLORS.panelRaised
      : (backgroundColor ?? (compact ? "transparent" : COLORS.panel)),
  }
}

export function InlineButton({
  id,
  label,
  onPress,
  accent = COLORS.text,
  active = false,
  selected = false,
  disabled = false,
  compact = LAYOUT.compact,
  backgroundColor,
  highlightShortcuts = true,
  shortcutsMuted = false,
  shortcutColor,
  shortcutBaseColor,
  shortcutAnimation,
  actionKeys,
  buttonRef,
}: InlineButtonProps) {
  return (
    <Button
      {...(id === undefined ? {} : { id })}
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      onPress={onPress}
      disabled={disabled}
      height={1}
      flexShrink={0}
    >
      {(state) => (
        <ShortcutText
          content={` ${translateUi(label)} `}
          highlight={highlightShortcuts}
          shortcutsMuted={shortcutsMuted}
          shortcutColor={shortcutColor}
          shortcutBaseColor={shortcutBaseColor}
          shortcutAnimation={shortcutAnimation}
          actionKeys={actionKeys}
          style={buttonColors({
            pressed: state.pressed,
            selected,
            focused: state.focused,
            active,
            disabled,
            accent,
            compact,
            backgroundColor,
          })}
        />
      )}
    </Button>
  )
}
