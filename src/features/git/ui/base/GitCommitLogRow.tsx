import { Button } from "@tuiparts/react/button"
import type { ReactNode } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "../../../../shared/i18n"
import { gitCommitBodyLines, gitCommitLogRowHeight } from "../../model/git-commit-log"
import type { GitCommit } from "../../model/types"
import { formatDecorations, formatGraph, styledGraph } from "../../rendering/commit-graph"
import { fillLine } from "../../rendering/diff"

function continuationGraph(graph: string) {
  return formatGraph(graph).replace(/[○◎*]/g, "│").replace(/[╰╯─]/g, " ")
}

function keyedBodyLines(lines: string[]) {
  const occurrences = new Map<string, number>()
  return lines.map((content) => {
    const occurrence = (occurrences.get(content) ?? 0) + 1
    occurrences.set(content, occurrence)
    return { id: `${content}\0${occurrence}`, content }
  })
}

function GitCommitLogLine({
  graph,
  graphWidth,
  background,
  children,
}: {
  graph: string
  graphWidth: number
  background: string
  children?: ReactNode
}) {
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        overflow: "hidden",
        backgroundColor: background,
      }}
    >
      <text
        content={styledGraph(graph, graphWidth, background)}
        style={{ width: graphWidth, flexShrink: 0, bg: background }}
      />
      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 0,
          height: 1,
          flexDirection: "row",
          overflow: "hidden",
          backgroundColor: background,
        }}
      >
        {children}
      </box>
    </box>
  )
}

type CommitTextProps = {
  commit: GitCommit
  width: number
  background: string
}

function CommitHeader({ commit, width, background }: CommitTextProps) {
  const references = formatDecorations(commit.decorations)
  const fixed = ` ${translateUi("commit")} ${commit.hash}`
  const available = Math.max(0, width - displayWidth(fixed))
  const referenceLabel = references ? truncateDisplay(` (${references})`, available) : ""
  return (
    <>
      <text content={` ${translateUi("commit")} `} style={{ fg: COLORS.warning, bg: background }} />
      <text content={commit.hash} style={{ fg: COLORS.warning, bg: background }} />
      {referenceLabel ? (
        <text content={referenceLabel} style={{ fg: COLORS.danger, bg: background }} />
      ) : null}
    </>
  )
}

function CommitTextLine({
  content,
  width,
  background,
  color = COLORS.text,
}: {
  content: string
  width: number
  background: string
  color?: string
}) {
  return <text content={fillLine(content, width)} style={{ fg: color, bg: background }} />
}

export function GitCommitLogRow({
  commit,
  graph,
  graphWidth,
  width,
  selected,
  id,
  onPress,
}: {
  commit: GitCommit
  graph: string
  graphWidth: number
  width: number
  selected: boolean
  id: string
  onPress: () => void
}) {
  const background = selected ? COLORS.panelRaised : COLORS.panel
  const contentWidth = Math.max(8, width - graphWidth)
  const continuation = continuationGraph(graph)
  const bodyLines = gitCommitBodyLines(commit)
  const bodyRows = keyedBodyLines(bodyLines)
  const rowHeight = gitCommitLogRowHeight(commit)
  const stats = `${translateUi("Data:")}  ${commit.relativeDate || commit.date}  ·  ${translateUi("ARQ.")} ${commit.filesChanged}  +${commit.additions} −${commit.deletions}`

  return (
    <Button id={id} onPress={onPress} height={rowHeight} flexShrink={0}>
      <box style={{ height: rowHeight, flexShrink: 0, backgroundColor: background }}>
        <GitCommitLogLine graph={graph} graphWidth={graphWidth} background={background}>
          <CommitHeader commit={commit} width={contentWidth} background={background} />
        </GitCommitLogLine>
        {commit.parents.length > 1 ? (
          <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background}>
            <CommitTextLine
              content={` ${translateUi("Merge:")} ${commit.parents.map((parent) => parent.slice(0, 7)).join(" ")}`}
              width={contentWidth}
              background={background}
            />
          </GitCommitLogLine>
        ) : null}
        <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background}>
          <CommitTextLine
            content={` ${translateUi("Autor:")} ${commit.author}${commit.authorEmail ? ` <${commit.authorEmail}>` : ""}`}
            width={contentWidth}
            background={background}
          />
        </GitCommitLogLine>
        <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background}>
          <CommitTextLine content={` ${stats}`} width={contentWidth} background={background} />
        </GitCommitLogLine>
        <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background} />
        <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background}>
          <CommitTextLine
            content={`    ${commit.subject}`}
            width={contentWidth}
            background={background}
            color={selected ? COLORS.text : COLORS.muted}
          />
        </GitCommitLogLine>
        {bodyLines.length ? (
          <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background} />
        ) : null}
        {bodyRows.map((line) => (
          <GitCommitLogLine
            key={`${commit.fullHash}-body-${line.id}`}
            graph={continuation}
            graphWidth={graphWidth}
            background={background}
          >
            <CommitTextLine
              content={`        ${line.content}`}
              width={contentWidth}
              background={background}
              color={COLORS.muted}
            />
          </GitCommitLogLine>
        ))}
        <GitCommitLogLine graph={continuation} graphWidth={graphWidth} background={background} />
      </box>
    </Button>
  )
}
