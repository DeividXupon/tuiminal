import type { IssueSection } from "../../model/issue/types"
import type { PullRequestSection } from "../../model/pr/types"
import {
  IssueSectionEditorModal,
  type IssueSectionEditorValues,
} from "../issue/IssueSectionEditorModal"
import { SectionEditorModal, type SectionEditorValues } from "../pr/SectionEditorModal"

export type GitConfigurationEditorState =
  | { kind: "pr"; mode: "create" | "edit"; section: PullRequestSection | null }
  | { kind: "issue"; mode: "create" | "edit"; section: IssueSection | null }

export function GitConfigurationEditor({
  width,
  editor,
  repositories,
  onClose,
  onSavePullRequest,
  onSaveIssue,
}: {
  width: number
  editor: GitConfigurationEditorState
  repositories: readonly string[]
  onClose: () => void
  onSavePullRequest: (values: SectionEditorValues) => void
  onSaveIssue: (values: IssueSectionEditorValues) => void
}) {
  if (editor.kind === "pr") {
    return (
      <SectionEditorModal
        open
        embedded
        contentWidth={width}
        mode={editor.mode}
        initialTitle={editor.section?.title ?? ""}
        initialQuery={editor.section?.query ?? "is:open"}
        repositories={repositories}
        {...(editor.section?.columns ? { initialColumns: editor.section.columns } : {})}
        {...(editor.section?.sort ? { initialSort: editor.section.sort } : {})}
        {...(editor.section?.limit ? { initialLimit: editor.section.limit } : {})}
        onClose={onClose}
        onApply={() => undefined}
        onSave={onSavePullRequest}
      />
    )
  }
  return (
    <IssueSectionEditorModal
      embedded
      contentWidth={width}
      mode={editor.mode}
      initialTitle={editor.section?.title ?? ""}
      initialQuery={editor.section?.query ?? "is:open"}
      repositories={repositories}
      {...(editor.section?.columns ? { initialColumns: editor.section.columns } : {})}
      {...(editor.section?.sort ? { initialSort: editor.section.sort } : {})}
      {...(editor.section?.limit ? { initialLimit: editor.section.limit } : {})}
      onClose={onClose}
      onApply={() => undefined}
      onSave={onSaveIssue}
    />
  )
}
