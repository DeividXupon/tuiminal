import type { ScrollBoxRenderable } from "@opentui/core"
import type { DiffDocument, DiffLayout } from "../../model/view"
import { GitDiffDocument } from "../shared/GitDiffDocument"
import { GitDiffViewport } from "../shared/GitDiffViewport"

export function GitDiffDocumentList({
  documents,
  layout,
  setScrollRef,
}: {
  documents: DiffDocument[]
  layout: DiffLayout
  setScrollRef: (value: ScrollBoxRenderable | null) => void
}) {
  return (
    <GitDiffViewport
      id="git-base-diff"
      scrollRef={setScrollRef}
      resetKey={`${layout}:${documents.map((document) => document.key).join("\n")}`}
    >
      {documents.map((document) => (
        <GitDiffDocument key={document.key} document={document} layout={layout} />
      ))}
    </GitDiffViewport>
  )
}
