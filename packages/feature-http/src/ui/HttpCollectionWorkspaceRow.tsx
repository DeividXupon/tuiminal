import { Button } from "@tuiparts/react/button"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpCollectionWorkspace } from "../hooks/use-http-collection-menu"
import { handleCollectionContextMenu } from "./http-collection-context-menu"

export function HttpCollectionWorkspaceRow({
  workspace,
  selected,
  active,
  contentWidth,
  onSelect,
  onActions,
  onContextMenu,
}: {
  workspace: HttpCollectionWorkspace
  selected: boolean
  active: boolean
  contentWidth: number
  onSelect: () => void
  onActions: () => void
  onContextMenu?: ((workspace: HttpCollectionWorkspace) => void) | undefined
}) {
  const actions = selected && active
  const background = selected ? COLORS.diffModifiedBg : COLORS.panel
  return (
    <box height={1} flexShrink={0} flexDirection="row" backgroundColor={background}>
      <Button
        id="http-collection-workspace-heading"
        height={1}
        width={0}
        flexGrow={1}
        onPress={onSelect}
        onMouseDown={(event) =>
          handleCollectionContextMenu(event, onContextMenu && (() => onContextMenu(workspace)))
        }
      >
        <text
          content={truncateDisplay(workspace.name, Math.max(1, contentWidth - (actions ? 5 : 0)))}
          fg={COLORS.text}
          bg={background}
          wrapMode="none"
        />
      </Button>
      {actions ? (
        <InlineButton
          id={`http-collection-actions-${workspace.id}`}
          label="[A]"
          accent={COLORS.http}
          onPress={onActions}
        />
      ) : null}
    </box>
  )
}
