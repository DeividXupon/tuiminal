import { ShortcutText } from "./ShortcutText"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { Button } from "@tuiparts/react/button"
import type { Ref } from "react"
import { translateUi } from "../i18n/index"
import { COLORS, LAYOUT } from "../../core/settings/theme"

type InlineButtonProps = {
  id?: string
  label: string
  onPress: () => void
  accent?: string
  active?: boolean
  disabled?: boolean
  buttonRef?: Ref<ButtonRenderable>
}

export function InlineButton({
  id,
  label,
  onPress,
  accent = COLORS.text,
  active = false,
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
          style={{
            fg: disabled
              ? COLORS.border
              : state.pressed
                ? COLORS.canvas
                : state.focused || active
                  ? accent
                  : COLORS.muted,
            bg: state.pressed
              ? accent
              : state.focused || active
                ? LAYOUT.compact
                  ? COLORS.diffModifiedBg
                  : COLORS.panelRaised
                : LAYOUT.compact
                  ? "transparent"
                  : COLORS.panel,
          }}
        />
      )}
    </Button>
  )
}
