import { ShortcutText } from "./ShortcutText"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { Button } from "@tuiparts/react/button"
import type { Ref } from "react"
import { translateUi } from "../i18n/index"
import { COLORS, LAYOUT } from "../settings/theme"

export type InlineButtonProps = {
  id?: string
  label: string
  onPress: () => void
  accent?: string
  active?: boolean
  selected?: boolean
  disabled?: boolean
  buttonRef?: Ref<ButtonRenderable>
}

function buttonColors({
  pressed,
  selected,
  focused,
  active,
  disabled,
  accent,
}: {
  pressed: boolean
  selected: boolean
  focused: boolean
  active: boolean
  disabled: boolean
  accent: string
}) {
  if (pressed || selected) return { fg: disabled ? COLORS.border : COLORS.canvas, bg: accent }
  const highlighted = focused || active
  return {
    fg: disabled ? COLORS.border : highlighted ? accent : COLORS.muted,
    bg: highlighted
      ? LAYOUT.compact
        ? COLORS.diffModifiedBg
        : COLORS.panelRaised
      : LAYOUT.compact
        ? "transparent"
        : COLORS.panel,
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
          highlight={!selected}
          style={buttonColors({
            pressed: state.pressed,
            selected,
            focused: state.focused,
            active,
            disabled,
            accent,
          })}
        />
      )}
    </Button>
  )
}
