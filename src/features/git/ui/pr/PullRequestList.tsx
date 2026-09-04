import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "../../../../shared/i18n"
import { PULL_REQUEST_COLUMNS } from "../../model/pr/config"
import type { PullRequestColumn, PullRequestSummary } from "../../model/pr/types"

const REVIEW_MARK: Record<PullRequestSummary["reviewState"], string> = {
  approved: "✓",
  "changes-requested": "×",
  "review-required": "?",
  unknown: "·",
}

const CHECK_MARK: Record<PullRequestSummary["checkState"], string> = {
  success: "✓",
  failure: "×",
  pending: "◷",
  cancelled: "○",
  skipped: "−",
  none: "·",
  unknown: "?",
}

const STATE_MARK: Record<PullRequestSummary["state"], string> = {
  open: "◆",
  draft: "◇",
  merged: "●",
  closed: "○",
}

function hasColumn(columns: readonly PullRequestColumn[], column: PullRequestColumn) {
  return columns.includes(column)
}

function pullRequestPrimaryLine(
  item: PullRequestSummary,
  width: number,
  columns: readonly PullRequestColumn[],
) {
  const repository = `${item.identity.owner}/${item.identity.repository}`
  const state = hasColumn(columns, "state") ? `${STATE_MARK[item.state]} ` : ""
  const repo = hasColumn(columns, "repository") ? `${repository} ` : ""
  const fixed = `${state}${repo}#${item.identity.number}  `
  const status = [
    hasColumn(columns, "review") ? `REV ${REVIEW_MARK[item.reviewState]}` : "",
    hasColumn(columns, "ci") ? `CI ${CHECK_MARK[item.checkState]}` : "",
    hasColumn(columns, "changes") ? `+${item.additions}/-${item.deletions}` : "",
  ]
    .filter(Boolean)
    .join("  ")
  const titleWidth = Math.max(8, width - displayWidth(fixed) - displayWidth(status) - 2)
  const title = hasColumn(columns, "title") ? truncateDisplay(item.title, titleWidth) : ""
  return truncateDisplay(`${fixed}${title}${status ? `  ${status}` : ""}`, width)
}

function pullRequestSecondaryLine(
  item: PullRequestSummary,
  width: number,
  columns: readonly PullRequestColumn[],
) {
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
      hasColumn(columns, "base") ? `${translateUi("base")}:${item.baseBranch}` : "",
      hasColumn(columns, "comments") ? `${item.commentCount} ${translateUi("comentários")}` : "",
      hasColumn(columns, "labels") ? labels : "",
    ]
      .filter(Boolean)
      .join("  ·  "),
    width,
  )
}

function PullRequestRow({
  item,
  index,
  width,
  selected,
  focused,
  onSelect,
  columns,
}: {
  item: PullRequestSummary
  index: number
  width: number
  selected: boolean
  focused: boolean
  onSelect: (index: number) => void
  columns: readonly PullRequestColumn[]
}) {
  return (
    <box
      id={`git-pr-row-${index}`}
      style={{
        width: "100%",
        height: 2,
        flexShrink: 0,
        flexDirection: "column",
        backgroundColor: selected ? COLORS.panelRaised : COLORS.panel,
      }}
    >
      <Button height={1} width="100%" onPress={() => onSelect(index)}>
        <text
          content={`${selected ? "▶" : " "} ${pullRequestPrimaryLine(item, width - 2, columns)}`}
          style={{ fg: selected && focused ? COLORS.git : COLORS.text }}
        />
      </Button>
      <Button height={1} width="100%" onPress={() => onSelect(index)}>
        <text
          content={`  ${pullRequestSecondaryLine(item, width - 2, columns)}`}
          style={{ fg: selected ? COLORS.muted : COLORS.border }}
        />
      </Button>
    </box>
  )
}

export function PullRequestList({
  items,
  selectedIndex,
  focused,
  width,
  onSelect,
  columns = PULL_REQUEST_COLUMNS,
}: {
  items: readonly PullRequestSummary[]
  selectedIndex: number
  focused: boolean
  width: number
  onSelect: (index: number) => void
  columns?: readonly PullRequestColumn[]
}) {
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    if (items.length) listRef.current?.scrollChildIntoView(`git-pr-row-${selectedIndex}`)
  }, [items.length, selectedIndex])
  return (
    <box style={{ flexGrow: 1, width: "100%" }}>
      <text
        content={translateUi("  ESTADO · REPOSITÓRIO / PR / TÍTULO · REVISÃO · CI · ALTERAÇÕES")}
        style={{ fg: COLORS.muted, bg: COLORS.panelRaised }}
      />
      {items.length ? (
        <scrollbox ref={listRef} scrollY viewportCulling style={{ flexGrow: 1, width: "100%" }}>
          {items.map((item, index) => (
            <PullRequestRow
              key={`${item.identity.host}:${item.identity.nodeId}`}
              item={item}
              index={index}
              width={width}
              selected={index === selectedIndex}
              focused={focused}
              onSelect={onSelect}
              columns={columns}
            />
          ))}
        </scrollbox>
      ) : (
        <text content={translateUi("Nenhum PR nesta seção.")} style={{ fg: COLORS.muted }} />
      )}
    </box>
  )
}
