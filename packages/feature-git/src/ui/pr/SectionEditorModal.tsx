import { PULL_REQUEST_COLUMNS } from "../../model/pr/config"
import { parsePullRequestSectionOptions } from "../../model/pr/sections"
import type { PullRequestColumn, PullRequestSort } from "../../model/pr/types"
import {
  GitRemoteSectionEditor,
  type GitRemoteSectionEditorMode,
  type GitRemoteSectionEditorValues,
} from "../shared/GitRemoteSectionEditor"

export type SectionEditorMode = GitRemoteSectionEditorMode
export type SectionEditorValues = GitRemoteSectionEditorValues<PullRequestColumn>

export function SectionEditorModal({
  open,
  embedded = false,
  contentWidth,
  mode,
  initialTitle,
  initialQuery,
  initialColumns = PULL_REQUEST_COLUMNS,
  initialSort = "updated-desc",
  initialLimit = 20,
  repositories = [],
  onClose,
  onApply,
  onSave,
}: {
  open: boolean
  embedded?: boolean
  contentWidth?: number
  mode: SectionEditorMode
  initialTitle: string
  initialQuery: string
  initialColumns?: readonly PullRequestColumn[]
  initialSort?: PullRequestSort
  initialLimit?: number
  repositories?: readonly string[]
  onClose: () => void
  onApply: (query: string) => void
  onSave: (values: SectionEditorValues) => void
}) {
  if (!open) return null
  return (
    <GitRemoteSectionEditor
      kind="pr"
      open={open}
      embedded={embedded}
      {...(contentWidth === undefined ? {} : { contentWidth })}
      mode={mode}
      initialTitle={initialTitle}
      initialQuery={initialQuery}
      initialColumns={initialColumns}
      initialSort={initialSort}
      initialLimit={initialLimit}
      repositories={repositories}
      columnPlaceholder="repository,title,review,ci,changes"
      parseOptions={parsePullRequestSectionOptions}
      onClose={onClose}
      onApply={onApply}
      onSave={onSave}
    />
  )
}
