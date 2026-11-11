import { useRef } from "react"
import { HttpCollectionNameInput, type HttpCollectionNameEdit } from "./HttpCollectionNameInput"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import { httpMethodColor } from "./http-method-colors"
import { collectionRowControlId, handleCollectionContextMenu } from "./http-collection-context-menu"

export function HttpCollectionRow({
  row,
  contentWidth,
  methodWidth,
  activeDocumentId,
  selected,
  onPress,
  onDoubleClick,
  onActions,
  onContextMenu,
  edit,
}: {
  row: HttpCollectionTreeRow
  contentWidth: number
  methodWidth: number
  activeDocumentId: string
  selected: boolean
  onDoubleClick?: (() => void) | undefined
  onPress: () => void
  edit?: HttpCollectionNameEdit | undefined
  onActions?: (() => void) | undefined
  onContextMenu?: ((row: HttpCollectionTreeRow) => void) | undefined
}) {
  const lastClick = useRef(0)
  const indent = "  ".repeat(row.depth)
  const highlighted =
    selected || (row.kind === "request" && row.item.request.id === activeDocumentId)
  const background = highlighted ? COLORS.diffModifiedBg : COLORS.panel
  if (edit)
    return (
      <RenamingCollectionRow
        row={row}
        methodWidth={methodWidth}
        background={background}
        indent={indent}
        edit={edit}
      />
    )
  if (row.kind === "request") {
    const method = row.item.request.method
    const requestName = row.folderPath
      ? row.item.request.name.slice(row.folderPath.length + 3)
      : row.item.request.name
    const nameWidth = Math.max(
      1,
      contentWidth - 3 - displayWidth(indent) - methodWidth - (onActions ? 5 : 0),
    )
    return (
      <box height={1} flexShrink={0} flexDirection="row" backgroundColor={background}>
        <Button
          id={collectionRowControlId(row)}
          onPress={onPress}
          onMouseDown={(event) =>
            handleCollectionContextMenu(event, onContextMenu && (() => onContextMenu(row)))
          }
          height={1}
          flexShrink={0}
          flexGrow={1}
          width={0}
        >
          <box style={{ height: 1, flexDirection: "row", backgroundColor: background }}>
            <text
              content={` ${indent}`}
              style={{ fg: COLORS.muted, bg: background, flexShrink: 0 }}
            />
            <text
              content={method}
              style={{
                fg: httpMethodColor(method),
                bg: background,
                width: methodWidth,
                flexShrink: 0,
              }}
            />
            <text
              content={` ${truncateDisplay(requestName, nameWidth)} `}
              style={{ fg: COLORS.text, bg: background }}
            />
          </box>
        </Button>
        {onActions ? (
          <InlineButton
            id={`http-collection-actions-${row.id}`}
            label="[A]"
            accent={COLORS.http}
            onPress={onActions}
          />
        ) : null}
      </box>
    )
  }
  const available = contentWidth - 4 - displayWidth(indent) - (onActions ? 5 : 0)
  const count =
    available - displayWidth(` (${row.requestCount})`) < Math.min(8, displayWidth(row.name))
      ? ""
      : ` (${row.requestCount})`
  const nameWidth = Math.max(
    1,
    contentWidth - 2 - displayWidth(indent) - 2 - displayWidth(count) - (onActions ? 5 : 0),
  )
  return (
    <box height={1} flexShrink={0} flexDirection="row" backgroundColor={background}>
      <Button
        id={collectionRowControlId(row)}
        onPress={onPress}
        onMouseOut={() => {
          lastClick.current = 0
        }}
        onMouseDown={(event) => {
          handleCollectionContextMenu(event, onContextMenu && (() => onContextMenu(row)))
          if (event.button !== 0 || !onDoubleClick) return
          const now = Date.now()
          if (now - lastClick.current < 400) {
            lastClick.current = 0
            event.preventDefault()
            event.stopPropagation()
            onDoubleClick()
          } else lastClick.current = now
        }}
        height={1}
        flexShrink={0}
        flexGrow={1}
        width={0}
      >
        <text
          content={` ${indent}${row.expanded ? "▾" : "▸"} ${truncateDisplay(row.name, nameWidth)}${count} `}
          style={{ fg: row.requestCount > 0 ? COLORS.text : COLORS.muted, bg: background }}
        />
      </Button>
      {onActions ? (
        <InlineButton
          id={`http-collection-actions-${row.id}`}
          label="[A]"
          accent={COLORS.http}
          onPress={onActions}
        />
      ) : null}
    </box>
  )
}

function RenamingCollectionRow({
  row,
  methodWidth,
  background,
  indent,
  edit,
}: {
  row: HttpCollectionTreeRow
  methodWidth: number
  background: string
  indent: string
  edit: HttpCollectionNameEdit
}) {
  return (
    <box height={1} flexShrink={0} flexDirection="row" backgroundColor={background}>
      <text
        content={` ${indent}${row.kind === "request" ? "" : `${row.expanded ? "▾" : "▸"} `}`}
        fg={COLORS.muted}
        flexShrink={0}
      />
      {row.kind === "request" ? (
        <>
          <text
            content={row.item.request.method}
            fg={httpMethodColor(row.item.request.method)}
            width={methodWidth}
            flexShrink={0}
          />
          <text content=" " />
        </>
      ) : null}
      <HttpCollectionNameInput {...edit} />
    </box>
  )
}
