import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { DiffDocument, DiffLayout } from "../../model/view"
import { DIFF_SYNTAX_STYLE } from "../../rendering/constants"
import { documentLineCount } from "../../rendering/diff"
import { InlineDiffLine } from "./GitInlineDiffLine"
import { fitGitDiffCodeCells } from "../../rendering/diff-scroll"

export function GitDiffDocument({
  document,
  layout,
}: {
  document: DiffDocument
  layout: DiffLayout
}) {
  const height = documentLineCount(document, layout)
  return (
    <box
      style={{ width: "100%", height: Math.max(2, height + 1), flexShrink: 0, overflow: "hidden" }}
    >
      <text
        content={`◆ ${document.path}  ·  ${document.section}  ·  ${document.filetype.toUpperCase()}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.git, bg: COLORS.panelRaised }}
      />
      {document.unifiedLineCount && layout === "inline" ? (
        document.inlineRows.map((row) => (
          <InlineDiffLine key={row.key} row={row} filetype={document.filetype} />
        ))
      ) : document.unifiedLineCount ? (
        <diff
          renderBefore={function () {
            fitGitDiffCodeCells(this)
          }}
          diff={document.source}
          filetype={document.filetype}
          syntaxStyle={DIFF_SYNTAX_STYLE}
          view={layout === "split" ? "split" : "unified"}
          wrapMode="none"
          showLineNumbers
          lineNumberFg={COLORS.muted}
          lineNumberBg={COLORS.diffGutterBg}
          addedBg={COLORS.diffAddedBg}
          removedBg={COLORS.diffRemovedBg}
          contextBg={COLORS.panel}
          addedSignColor={COLORS.success}
          removedSignColor={COLORS.danger}
          addedLineNumberBg={COLORS.diffAddedBg}
          removedLineNumberBg={COLORS.diffRemovedBg}
          style={{ width: "100%", height, flexShrink: 0 }}
        />
      ) : (
        <text
          content={translateUi("Alteração binária ou sem linhas textuais.")}
          style={{ fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
