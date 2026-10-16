import type { IssueActionAvailability, IssueActionKind } from "../../model/issue/actions"
import type { IssueFocus, IssueWorkspaceAction } from "../../model/issue/navigation"
import {
  type IssuePaletteId,
  issueMutationKind,
  issuePaletteActions,
} from "../../model/issue/palette"
import type { IssueComment, IssuePreviewTab } from "../../model/issue/types"
import { remoteDashboardCommand } from "../../model/remote-dashboard-palette"
import { gitTabForPaletteId } from "../../model/remote-palette"
import type { GitWorkspaceTab } from "../../model/workspace"
import { useGitRemoteActionPalette } from "../shared/useGitRemoteActionPalette"

/** Issue `[?]` palette; every row runs through the same workspace dispatcher as keys. */
export function useIssuePalette({
  active,
  focus,
  hasSelection,
  previewTab,
  selectedComment,
  creation,
  actions,
  onSelectTab,
  dispatch,
}: {
  active: boolean
  focus: IssueFocus
  hasSelection: boolean
  previewTab: IssuePreviewTab
  selectedComment: IssueComment | null
  creation: { available: boolean }
  actions: {
    availability: ReadonlyMap<IssueActionKind, IssueActionAvailability>
    openCommentAction: (kind: "reaction" | "reply", comment: IssueComment) => void
  }
  onSelectTab?: ((tab: GitWorkspaceTab) => void) | undefined
  dispatch: (action: IssueWorkspaceAction) => void
}) {
  const reactToComment = () =>
    selectedComment && actions.openCommentAction("reaction", selectedComment)
  const replyToComment = () =>
    selectedComment && actions.openCommentAction("reply", selectedComment)
  const run = (id: IssuePaletteId) => {
    const tab = gitTabForPaletteId(id)
    const kind = issueMutationKind(id)
    const command = remoteDashboardCommand(id)
    if (tab) onSelectTab?.(tab)
    else if (kind) dispatch({ type: "prepare-action", kind })
    else if (id === "create") dispatch({ type: "create-issue" })
    else if (id === "comment-react") reactToComment()
    else if (id === "comment-reply") replyToComment()
    else if (command) dispatch(command)
  }
  const palette = useGitRemoteActionPalette<IssuePaletteId>({
    active,
    title: "AÇÕES DO GIT · ISSUES",
    buildActions: () =>
      issuePaletteActions({
        focus,
        hasSelection,
        canCreate: creation.available,
        activityComment: previewTab === "activity" && Boolean(selectedComment),
        previewTab,
        availability: actions.availability,
        navigation: Boolean(onSelectTab),
      }),
    onRun: run,
    boxes: {
      ids: { list: "git-issue-list-panel", preview: "git-issue-preview-panel" },
      current: focus,
      onFocus: (target) => dispatch({ type: "focus", target }),
    },
  })
  return { ...palette, reactToComment, replyToComment }
}
