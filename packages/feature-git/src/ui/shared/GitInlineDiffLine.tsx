import type { TextChunk } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { InlineDiffRow } from "../../model/view"
import {
  DIFF_CHANGED_HIGHLIGHT,
  DIFF_REMOVED_HIGHLIGHT,
  DIFF_SYNTAX_STYLE,
} from "../../rendering/constants"
import { highlightChangedChunks } from "../../rendering/diff"
import { fitGitDiffCodeCells } from "../../rendering/diff-scroll"

export function InlineDiffLine({ row, filetype }: { row: InlineDiffRow; filetype: string }) {
  const isRemoved = row.kind === "removed"
  const isChanged = row.kind !== "context"
  const lineBackground =
    row.kind === "removed" ? COLORS.diffRemovedBg : isChanged ? COLORS.diffModifiedBg : COLORS.panel
  const accent =
    row.kind === "removed" ? COLORS.danger : row.kind === "context" ? COLORS.muted : COLORS.success
  const marker =
    row.kind === "modified" ? "~" : row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "

  return (
    <box
      renderBefore={function () {
        fitGitDiffCodeCells(this)
      }}
      style={{ flexDirection: "row", width: "100%", height: 1, flexShrink: 0 }}
    >
      <text
        content={`${String(row.lineNumber).padStart(4)} ${marker} `}
        style={{ fg: accent, bg: lineBackground, flexShrink: 0 }}
      />
      <code
        content={row.content}
        filetype={filetype}
        syntaxStyle={DIFF_SYNTAX_STYLE}
        bg={lineBackground}
        wrapMode="none"
        truncate={false}
        {...(isChanged
          ? {
              onChunks: (chunks: TextChunk[]) =>
                highlightChangedChunks(
                  chunks,
                  row.changedRanges,
                  isRemoved ? DIFF_REMOVED_HIGHLIGHT : DIFF_CHANGED_HIGHLIGHT,
                ),
            }
          : {})}
        style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: 1 }}
      />
    </box>
  )
}
