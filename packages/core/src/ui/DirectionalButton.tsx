import { InlineButton, type InlineButtonProps } from "./InlineButton"
import { directionalShortcutLabel, type DirectionalShortcutLevel } from "./directional-shortcut"

type DirectionalButtonProps = Omit<InlineButtonProps, "label"> & {
  direction: -1 | 1
  level?: DirectionalShortcutLevel
}

export function DirectionalButton({ direction, level, ...props }: DirectionalButtonProps) {
  return <InlineButton {...props} label={directionalShortcutLabel(direction, level)} />
}
