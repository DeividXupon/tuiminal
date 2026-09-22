import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { NativeDiff } from "@xupon/tuiminal-core/ui/NativeDiff"
import type { DiffDocument, DiffLayout } from "../../model/view"
import { documentLineCount } from "../../rendering/diff"
import { InlineDiffLine } from "./GitInlineDiffLine"

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
        <NativeDiff
          patch={document.source}
          filetype={document.filetype}
          view={layout === "split" ? "split" : "unified"}
          height={height}
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
