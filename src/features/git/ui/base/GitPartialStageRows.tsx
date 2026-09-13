import { pathToFiletype } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../../../core/settings/theme"
import type { GitPartialStagePane } from "../../hooks/use-git-partial-stage"
import type {
  GitPartialStageDocument,
  GitPartialStageGranularity,
  GitPartialStageLine,
  GitPartialStageSource,
  GitPartialStageTarget,
} from "../../model/git-partial-stage"
import { DIFF_SYNTAX_STYLE } from "../../rendering/constants"
import { fitLine } from "../../rendering/diff"
import { fitGitDiffCodeCells } from "../../rendering/diff-scroll"

export function gitPartialStageTargetRowId(
  pane: GitPartialStagePane,
  source: GitPartialStageSource,
  targetId: string,
) {
  return `git-partial-stage-${pane}-${source}-row-${targetId}`
}

function lineNumber(value: number | null) {
  return value === null ? "    " : String(value).padStart(4)
}

function lineTone(kind: GitPartialStageLine["kind"]) {
  if (kind === "added") return { fg: COLORS.success, bg: COLORS.diffAddedBg, marker: "+" }
  if (kind === "removed") return { fg: COLORS.danger, bg: COLORS.diffRemovedBg, marker: "−" }
  return { fg: COLORS.muted, bg: COLORS.panel, marker: " " }
}

function displayLine(
  line: GitPartialStageLine,
  pane: GitPartialStagePane,
  visibleTargetIds: ReadonlySet<string>,
) {
  if (line.kind !== "added" && line.kind !== "removed") return line
  if (visibleTargetIds.has(line.id)) return line
  if (pane === "selected" && line.kind === "removed") {
    return { ...line, kind: "context" as const, raw: ` ${line.content}` }
  }
  return null
}

function GitPartialStageLineRow({
  line,
  source,
  pane,
  selectable,
  current,
  filetype,
  onTransfer,
  onFocus,
}: {
  line: GitPartialStageLine
  source: GitPartialStageSource
  pane: GitPartialStagePane
  selectable: boolean
  current: boolean
  filetype: string
  onTransfer: (targetId: string) => void
  onFocus: () => void
}) {
  const tone = lineTone(line.kind)
  const prefix = `${selectable && current ? "›" : " "} ${lineNumber(line.oldLine)} ${lineNumber(line.newLine)} ${tone.marker} `
  const content = (
    <box
      renderBefore={function () {
        fitGitDiffCodeCells(this)
      }}
      style={{ flexDirection: "row", height: 1, width: "100%", flexShrink: 0 }}
    >
      <text
        content={prefix}
        style={{
          fg: current ? COLORS.git : tone.fg,
          bg: current ? COLORS.panelRaised : tone.bg,
          flexShrink: 0,
        }}
      />
      <code
        id={`git-partial-stage-${pane}-${source}-code-${line.id}`}
        content={line.content}
        filetype={filetype}
        syntaxStyle={DIFF_SYNTAX_STYLE}
        bg={current ? COLORS.panelRaised : tone.bg}
        wrapMode="none"
        truncate={false}
        style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: 1 }}
      />
    </box>
  )
  if (!selectable) {
    return content
  }
  return (
    <Button
      id={gitPartialStageTargetRowId(pane, source, line.id)}
      height={1}
      flexShrink={0}
      onPress={() => {
        onFocus()
        onTransfer(`${source}:${line.id}`)
      }}
    >
      {content}
    </Button>
  )
}

export function GitPartialStageRows({
  document,
  source,
  pane,
  granularity,
  targets,
  currentTargetId,
  width,
  onTransfer,
  onFocus,
}: {
  document: GitPartialStageDocument
  source: GitPartialStageSource
  pane: GitPartialStagePane
  granularity: GitPartialStageGranularity
  targets: readonly GitPartialStageTarget[]
  currentTargetId: string | null
  width: number
  onTransfer: (targetId: string) => void
  onFocus: () => void
}) {
  const filetype = pathToFiletype(document.header[2]?.slice(6) ?? "") ?? "text"
  const visibleTargetIds = new Set(targets.map((target) => target.id))
  return document.hunks.map((hunk) => {
    const hunkVisible = visibleTargetIds.has(hunk.id)
    const visibleLines =
      granularity === "hunk"
        ? hunk.lines
        : hunk.lines
            .map((line) => displayLine(line, pane, visibleTargetIds))
            .filter((line): line is GitPartialStageLine => Boolean(line))
    const hasVisibleLine = visibleLines.some((line) => visibleTargetIds.has(line.id))
    if (granularity === "hunk" ? !hunkVisible : !hasVisibleLine) return null
    const hunkCurrent = granularity === "hunk" && currentTargetId === `${source}:${hunk.id}`
    return (
      <box
        key={`${source}:${hunk.id}`}
        id={`git-partial-stage-${pane}-${source}-${hunk.id}`}
        style={{
          width: "100%",
          height: 1 + visibleLines.length,
          flexShrink: 0,
          overflow: "hidden",
          ...(hunkCurrent
            ? {
                border: ["left"] as const,
                borderStyle: "single" as const,
                borderColor: COLORS.git,
              }
            : { paddingLeft: 1 }),
        }}
      >
        {granularity === "hunk" ? (
          <Button
            id={gitPartialStageTargetRowId(pane, source, hunk.id)}
            height={1}
            flexShrink={0}
            onPress={() => {
              onFocus()
              onTransfer(`${source}:${hunk.id}`)
            }}
          >
            <text
              content={fitLine(`  ${hunk.header}`, Math.max(1, width - 1))}
              style={{
                fg: hunkCurrent ? COLORS.text : COLORS.git,
                bg: hunkCurrent ? COLORS.panelRaised : COLORS.diffHunkBg,
              }}
            />
          </Button>
        ) : (
          <text
            content={fitLine(`  ${hunk.header}`, Math.max(1, width - 1))}
            style={{ fg: COLORS.git, bg: COLORS.diffHunkBg }}
          />
        )}
        {visibleLines.map((line) => (
          <GitPartialStageLineRow
            key={line.id}
            line={line}
            source={source}
            pane={pane}
            selectable={granularity === "line" && visibleTargetIds.has(line.id)}
            current={granularity === "line" && currentTargetId === `${source}:${line.id}`}
            filetype={filetype}
            onTransfer={onTransfer}
            onFocus={onFocus}
          />
        ))}
      </box>
    )
  })
}
