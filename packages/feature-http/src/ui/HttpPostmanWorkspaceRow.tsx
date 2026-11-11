import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { PostmanWorkspace } from "../postman/api"
import { postmanDisplayName } from "../postman/display"

export function HttpPostmanWorkspaceRow({
  workspace,
  count,
  selected,
  width,
  onPress,
}: {
  workspace: PostmanWorkspace
  count: number | null | undefined
  selected: boolean
  width: number
  onPress: () => void
}) {
  const summary = translateUi("Chamadas: {count}").replace(
    "{count}",
    count === undefined ? "…" : count === null ? "—" : String(count),
  )
  const name = [workspace.name, workspace.visibility]
    .map(postmanDisplayName)
    .filter(Boolean)
    .join(" · ")
  return (
    <Button
      id={`http-postman-workspace-${workspace.id}`}
      onPress={onPress}
      height={1}
      width="100%"
      flexShrink={0}
    >
      {(state) => (
        <box
          style={{
            height: 1,
            flexDirection: "row",
            border: ["left"],
            borderColor: selected ? COLORS.http : COLORS.border,
            backgroundColor:
              selected || state.focused || state.pressed ? COLORS.diffModifiedBg : COLORS.canvas,
          }}
        >
          <text
            content={` ${truncateDisplay(name, Math.max(1, width - displayWidth(summary) - 5))}`}
            style={{ fg: selected ? COLORS.http : COLORS.text, flexGrow: 1, minWidth: 0 }}
          />
          <text
            id={`http-postman-count-${workspace.id}`}
            content={`${summary} `}
            style={{ fg: COLORS.muted, flexShrink: 0 }}
          />
        </box>
      )}
    </Button>
  )
}
