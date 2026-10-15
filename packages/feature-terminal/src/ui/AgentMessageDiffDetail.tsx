import { pathToFiletype, type ScrollBoxRenderable } from "@opentui/core"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { NativeDiff } from "@xupon/tuiminal-core/ui/NativeDiff"
import type { RefObject } from "react"
import {
  agentMessageDiffStats,
  type AgentMessageHistoryEntry,
} from "../model/agent-message-history"

type PromptDiffFile = {
  id: string
  path: string
  kind: string
  diff: string
}

function displayDiffLines(value: string) {
  const occurrences = new Map<string, number>()
  return value.split("\n").map((text) => {
    const occurrence = (occurrences.get(text) ?? 0) + 1
    occurrences.set(text, occurrence)
    return { id: `${text}:${occurrence}`, text }
  })
}

function fallbackDiffColors(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++"))
    return { foreground: COLORS.success, background: COLORS.diffAddedBg }
  if (line.startsWith("-") && !line.startsWith("---"))
    return { foreground: COLORS.danger, background: COLORS.diffRemovedBg }
  if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++"))
    return { foreground: COLORS.graphAccent, background: COLORS.diffHunkBg }
  return { foreground: COLORS.text, background: COLORS.panel }
}

function pathFromPatch(value: string) {
  const lines = value.split("\n")
  const header =
    lines.find((line) => line.startsWith("+++ ") && !line.includes("/dev/null")) ??
    lines.find((line) => line.startsWith("--- ") && !line.includes("/dev/null"))
  if (!header) return ""
  const path = header.slice(4).split("\t", 1)[0]?.trim() ?? ""
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path
}

function patchStarts(lines: readonly string[]) {
  const gitHeaders = lines.flatMap((line, index) => (line.startsWith("diff --git ") ? [index] : []))
  if (gitHeaders.length) return gitHeaders
  return lines.flatMap((line, index) =>
    line.startsWith("--- ") && lines[index + 1]?.startsWith("+++ ") ? [index] : [],
  )
}

function splitTurnDiff(value: string) {
  const lines = value.split("\n")
  const starts = patchStarts(lines)
  if (!starts.length) return [{ id: "aggregate", path: "", kind: "update", diff: value }]
  return starts.map((start, index) => {
    const diff = lines.slice(start, starts[index + 1] ?? lines.length).join("\n")
    return { id: `aggregate:${index}`, path: pathFromPatch(diff), kind: "update", diff }
  })
}

function promptDiffFiles(entry: AgentMessageHistoryEntry, aggregate: string): PromptDiffFile[] {
  const sections = splitTurnDiff(aggregate)
  if (sections.length > 1 || sections[0]?.path) {
    return sections.map((section) => {
      const metadata = entry.changes.find(
        (change) => change.path === section.path || change.path.endsWith(`/${section.path}`),
      )
      return { ...section, kind: metadata?.kind ?? section.kind }
    })
  }
  const changes = entry.changes.filter((change) => change.diff)
  return changes.length ? [...changes] : sections
}

function FileDiffBlock({
  entryId,
  file,
  index,
  width,
  minimumCodeHeight,
}: {
  entryId: string
  file: PromptDiffFile
  index: number
  width: number
  minimumCodeHeight: number
}) {
  const stats = agentMessageDiffStats(file.diff)
  const codeHeight = Math.max(minimumCodeHeight, Math.min(10_000, file.diff.split("\n").length + 4))
  const hasUnifiedHunk = /^@@/m.test(file.diff)
  return (
    <box style={{ flexShrink: 0, marginBottom: 1, backgroundColor: COLORS.panel }}>
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text>
          <span fg={COLORS.terminal}>▌ </span>
          <span fg={COLORS.text}>
            {truncateDisplay(file.path || translateUi("ALTERAÇÕES"), Math.max(10, width - 28))}
          </span>
          <span fg={COLORS.muted}>{`  ${file.kind}`}</span>
        </text>
        <text>
          <span fg={COLORS.success}>{`+${stats.additions}`}</span>
          <span fg={COLORS.danger}>{`  −${stats.deletions}`}</span>
        </text>
      </box>
      {hasUnifiedHunk ? (
        <NativeDiff
          id={`agent-message-turn-diff-${entryId}-${index}`}
          patch={file.diff}
          filetype={pathToFiletype(file.path) ?? "text"}
          height={codeHeight}
          wrapMode="none"
        />
      ) : (
        displayDiffLines(file.diff).map((line, lineIndex) => {
          const colors = fallbackDiffColors(line.text)
          return (
            <text
              key={line.id}
              content={`${String(lineIndex + 1).padStart(4)} │ ${line.text || " "}`}
              wrapMode="none"
              style={{ height: 1, fg: colors.foreground, bg: colors.background }}
            />
          )
        })
      )}
    </box>
  )
}

export function AgentMessageDiffDetail({
  entry,
  width,
  height,
  scrollRef,
}: {
  entry: AgentMessageHistoryEntry
  width: number
  height: number
  scrollRef: RefObject<ScrollBoxRenderable | null>
}) {
  const diff = entry.turnDiff || entry.changes.map((change) => change.diff).join("\n")
  if (!diff)
    return (
      <box style={{ flexGrow: 1, paddingLeft: 1, backgroundColor: COLORS.panel }}>
        <text
          content={` ${translateUi("Nenhuma alteração registrada neste turno.")}`}
          style={{ height: 1, fg: COLORS.muted }}
        />
      </box>
    )
  const stats = agentMessageDiffStats(diff)
  const files = promptDiffFiles(entry, diff)
  const minimumCodeHeight = files.length === 1 ? Math.max(4, height - 6) : 4
  return (
    <box style={{ height: "100%", flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}>
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.diffGutterBg,
        }}
      >
        <text>
          <span fg={COLORS.graphAccent}>{`${files.length} ${translateUi("arquivos")}`}</span>
          <span fg={COLORS.success}>{`   +${stats.additions}`}</span>
          <span fg={COLORS.danger}>{`   −${stats.deletions}`}</span>
        </text>
      </box>
      <scrollbox
        ref={scrollRef}
        scrollY
        viewportCulling
        style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
      >
        {files.map((file, index) => (
          <FileDiffBlock
            key={file.id}
            entryId={entry.id}
            file={file}
            index={index}
            width={width}
            minimumCodeHeight={minimumCodeHeight}
          />
        ))}
      </scrollbox>
    </box>
  )
}
