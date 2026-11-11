import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton, type InlineButtonProps } from "@xupon/tuiminal-core/ui/InlineButton"

export type HttpDialogAction = InlineButtonProps & { shortLabel?: string }

export function httpDialogActionRows(width: number, actions: readonly HttpDialogAction[]) {
  const rows: InlineButtonProps[][] = [[]]
  let used = 0
  for (const { shortLabel, ...action } of actions) {
    const label =
      shortLabel && displayWidth(translateUi(action.label)) + 2 > width ? shortLabel : action.label
    const size = displayWidth(translateUi(label)) + 2
    if (used && used + size + 1 > width) {
      rows.push([])
      used = 0
    }
    rows.at(-1)?.push({ ...action, label })
    used += size + Number(used > 0)
  }
  return rows
}

/** Keep complete action labels and their hit targets inside the available columns. */
export function HttpDialogFooter({
  id,
  closeId,
  rows,
}: {
  id: string
  closeId: string
  rows: InlineButtonProps[][]
}) {
  return (
    <box id={`${id}-footer`} style={{ flexShrink: 0 }}>
      {rows.map((row) => (
        <box
          key={row.map((action) => action.id ?? action.label).join("|")}
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            gap: 1,
            justifyContent: row[0]?.id === closeId ? "space-between" : "flex-end",
          }}
        >
          {row.map((action) => (
            <InlineButton key={action.id ?? action.label} accent={COLORS.http} {...action} />
          ))}
        </box>
      ))}
    </box>
  )
}
