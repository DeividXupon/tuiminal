import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import { httpMethodColor } from "./http-method-colors"

export function HttpCollectionRow({
  row,
  contentWidth,
  activeDocumentId,
  selected,
  onPress,
}: {
  row: HttpCollectionTreeRow
  contentWidth: number
  activeDocumentId: string
  selected: boolean
  onPress: () => void
}) {
  const indent = "  ".repeat(row.depth)
  const highlighted =
    selected || (row.kind === "request" && row.item.request.id === activeDocumentId)
  const background = highlighted ? COLORS.diffModifiedBg : COLORS.panel
  if (row.kind === "request") {
    const method = row.item.request.method
    const requestName = row.folderPath
      ? row.item.request.name.slice(row.folderPath.length + 3)
      : row.item.request.name
    const nameWidth = Math.max(
      1,
      contentWidth - 2 - displayWidth(indent) - displayWidth(method) - 1,
    )
    return (
      <Button
        id={`http-navigation-project-${row.item.request.id}`}
        onPress={onPress}
        height={1}
        flexShrink={0}
      >
        <box style={{ height: 1, flexDirection: "row", backgroundColor: background }}>
          <text content={` ${indent}`} style={{ fg: COLORS.muted, bg: background }} />
          <text content={method} style={{ fg: httpMethodColor(method), bg: background }} />
          <text
            content={` ${truncateDisplay(requestName, nameWidth)} `}
            style={{ fg: COLORS.text, bg: background }}
          />
        </box>
      </Button>
    )
  }
  const count = ` (${row.requestCount})`
  const nameWidth = Math.max(1, contentWidth - 2 - displayWidth(indent) - 2 - displayWidth(count))
  return (
    <Button
      id={
        row.kind === "folder"
          ? `http-collection-folder-${row.path}:${row.folderId}`
          : `http-collection-${row.kind}-${row.path}`
      }
      onPress={onPress}
      height={1}
      flexShrink={0}
    >
      <text
        content={` ${indent}${row.expanded ? "▾" : "▸"} ${truncateDisplay(row.name, nameWidth)}${count} `}
        style={{ fg: COLORS.muted, bg: background }}
      />
    </Button>
  )
}
