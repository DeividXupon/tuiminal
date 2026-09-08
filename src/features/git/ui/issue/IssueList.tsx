import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import {
  displayWidth,
  formatUiDateTime,
  translateUi,
  truncateDisplay,
} from "../../../../shared/i18n"
import { ISSUE_COLUMNS } from "../../model/issue/config"
import type { IssueColumn, IssueSummary } from "../../model/issue/types"

const STATE_MARK: Record<IssueSummary["state"], string> = { open: "◆", closed: "○" }

function hasColumn(columns: readonly IssueColumn[], column: IssueColumn) {
  return columns.includes(column)
}

function updatedLabel(value: string) {
  return formatUiDateTime(value, { month: "2-digit", day: "2-digit" })
}

function primaryLine(item: IssueSummary, width: number, columns: readonly IssueColumn[]) {
  const repository = `${item.identity.owner}/${item.identity.repository}`
  const state = hasColumn(columns, "state") ? `${STATE_MARK[item.state]} ` : ""
  const repo = hasColumn(columns, "repository") ? `${repository} ` : ""
  const fixed = `${state}${repo}#${item.identity.number}  `
  const status = [
    hasColumn(columns, "updated") ? updatedLabel(item.updatedAt) : "",
    hasColumn(columns, "comments") ? `● ${item.commentCount}` : "",
    hasColumn(columns, "reactions") ? `♥ ${item.reactionCount}` : "",
  ]
    .filter(Boolean)
    .join("  ")
  const titleWidth = Math.max(8, width - displayWidth(fixed) - displayWidth(status) - 2)
  const title = hasColumn(columns, "title") ? truncateDisplay(item.title, titleWidth) : ""
  return truncateDisplay(`${fixed}${title}${status ? `  ${status}` : ""}`, width)
}

function secondaryLine(item: IssueSummary, width: number, columns: readonly IssueColumn[]) {
  const assignees = item.assignees.length
    ? item.assignees.map((actor) => `@${actor.login}`).join(",")
    : translateUi("sem responsáveis")
  const labels = item.labels.length
    ? item.labels.map((label) => label.name).join(",")
    : translateUi("sem labels")
  return truncateDisplay(
    [
      hasColumn(columns, "author") ? `@${item.author.login}` : "",
      hasColumn(columns, "assignees") ? `→ ${assignees}` : "",
      hasColumn(columns, "labels") ? labels : "",
    ]
      .filter(Boolean)
      .join("  ·  "),
    width,
  )
}

function IssueRow({
  item,
  index,
  width,
  selected,
  focused,
  columns,
  onSelect,
}: {
  item: IssueSummary
  index: number
  width: number
  selected: boolean
  focused: boolean
  columns: readonly IssueColumn[]
  onSelect: (index: number) => void
}) {
  return (
    <box
      id={`git-issue-row-${index}`}
      style={{
        width: "100%",
        height: 2,
        flexShrink: 0,
        backgroundColor: selected ? COLORS.panelRaised : COLORS.panel,
      }}
    >
      <Button height={1} width="100%" onPress={() => onSelect(index)}>
        <text
          content={`${selected ? "▶" : " "} ${primaryLine(item, width - 2, columns)}`}
          style={{ fg: selected && focused ? COLORS.git : COLORS.text }}
        />
      </Button>
      <Button height={1} width="100%" onPress={() => onSelect(index)}>
        <text
          content={`  ${secondaryLine(item, width - 2, columns)}`}
          style={{ fg: selected ? COLORS.muted : COLORS.border }}
        />
      </Button>
    </box>
  )
}

export function IssueList({
  items,
  selectedIndex,
  focused,
  width,
  onSelect,
  loadingMore = false,
  columns = ISSUE_COLUMNS,
}: {
  items: readonly IssueSummary[]
  selectedIndex: number
  focused: boolean
  width: number
  onSelect: (index: number) => void
  loadingMore?: boolean
  columns?: readonly IssueColumn[]
}) {
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    if (items.length) listRef.current?.scrollChildIntoView(`git-issue-row-${selectedIndex}`)
  }, [items.length, selectedIndex])
  return (
    <box style={{ flexGrow: 1, width: "100%" }}>
      <text
        content={translateUi("  ESTADO · REPOSITÓRIO / ISSUE / TÍTULO · ATUALIZAÇÃO · CONVERSA")}
        style={{ fg: COLORS.muted, bg: COLORS.panelRaised }}
      />
      {items.length ? (
        <scrollbox ref={listRef} scrollY viewportCulling style={{ flexGrow: 1, width: "100%" }}>
          {items.map((item, index) => (
            <IssueRow
              key={`${item.identity.host}:${item.identity.nodeId}`}
              item={item}
              index={index}
              width={width}
              selected={index === selectedIndex}
              focused={focused}
              columns={columns}
              onSelect={onSelect}
            />
          ))}
          {loadingMore ? (
            <text
              id="git-issue-page-loader"
              content={`◷ ${translateUi("Carregando mais issues…")}`}
              style={{ height: 1, flexShrink: 0, fg: COLORS.git }}
            />
          ) : null}
        </scrollbox>
      ) : (
        <text content={translateUi("Nenhuma issue nesta seção.")} style={{ fg: COLORS.muted }} />
      )}
    </box>
  )
}
