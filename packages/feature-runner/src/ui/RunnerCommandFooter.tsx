import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton, type InlineButtonProps } from "@xupon/tuiminal-core/ui/InlineButton"

export type RunnerCommandFooterAction = Omit<InlineButtonProps, "onPress"> & {
  id: string
  onPress?: () => void
}

export function runnerCommandFooterHeight(actions: RunnerCommandFooterAction[], width: number) {
  let rows = 1
  let rowWidth = 0
  for (const action of actions) {
    const actionWidth = displayWidth(translateUi(action.label)) + 2
    if (rowWidth && rowWidth + actionWidth > width) {
      rows += 1
      rowWidth = 0
    }
    rowWidth += actionWidth
  }
  return rows
}

export function RunnerCommandFooter({
  id = "runner-command-footer",
  actions,
  height,
}: {
  id?: string
  actions: RunnerCommandFooterAction[]
  height: number
}) {
  return (
    <box
      id={id}
      style={{
        height,
        width: "100%",
        flexDirection: "row",
        flexWrap: "wrap",
      }}
    >
      {actions.map((action) =>
        action.onPress ? (
          <InlineButton
            key={action.id}
            accent={COLORS.runner}
            {...action}
            onPress={action.onPress}
          />
        ) : (
          <ShortcutText
            key={action.id}
            id={action.id}
            content={` ${translateUi(action.label)} `}
            style={{ fg: COLORS.muted, flexShrink: 0, height: 1 }}
          />
        ),
      )}
    </box>
  )
}
