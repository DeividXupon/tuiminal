import { ISSUE_COLUMNS } from "../../model/issue/config"
import { parseIssueSectionOptions } from "../../model/issue/sections"
import type { IssueColumn, IssueSort } from "../../model/issue/types"
import {
  GitRemoteSectionEditor,
  type GitRemoteSectionEditorMode,
  type GitRemoteSectionEditorValues,
} from "../shared/GitRemoteSectionEditor"

export type IssueSectionEditorMode = GitRemoteSectionEditorMode
export type IssueSectionEditorValues = GitRemoteSectionEditorValues<IssueColumn>

export function IssueSectionEditorModal({
  embedded = false,
  contentWidth,
  mode,
  initialTitle,
  initialQuery,
  initialColumns = ISSUE_COLUMNS,
  initialSort = "updated-desc",
  initialLimit = 20,
  repositories = [],
  onClose,
  onApply,
  onSave,
}: {
  embedded?: boolean
  contentWidth?: number
  mode: IssueSectionEditorMode
  initialTitle: string
  initialQuery: string
  initialColumns?: readonly IssueColumn[]
  initialSort?: IssueSort
  initialLimit?: number
  repositories?: readonly string[]
  onClose: () => void
  onApply: (query: string) => void
  onSave: (values: IssueSectionEditorValues) => void
}) {
  return (
    <GitRemoteSectionEditor
      kind="issue"
      open
      embedded={embedded}
      {...(contentWidth === undefined ? {} : { contentWidth })}
      mode={mode}
      initialTitle={initialTitle}
      initialQuery={initialQuery}
      initialColumns={initialColumns}
      initialSort={initialSort}
      initialLimit={initialLimit}
      repositories={repositories}
      columnPlaceholder="updated,state,repository,title,comments"
      parseOptions={parseIssueSectionOptions}
      onClose={onClose}
      onApply={onApply}
      onSave={onSave}
    />
  )
}
