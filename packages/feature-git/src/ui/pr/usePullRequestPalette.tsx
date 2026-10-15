import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { PullRequestActionAvailability, PullRequestActionKind } from "../../model/pr/actions"
import type { PullRequestFocus, PullRequestWorkspaceAction } from "../../model/pr/navigation"
import {
  type PullRequestPaletteId,
  pullRequestMutationKind,
  pullRequestPaletteActions,
} from "../../model/pr/palette"
import type {
  PullRequestComment,
  PullRequestPreviewTab,
  PullRequestSummary,
} from "../../model/pr/types"
import { remoteDashboardCommand } from "../../model/remote-dashboard-palette"
import { gitTabForPaletteId } from "../../model/remote-palette"
import type { GitWorkspaceTab } from "../../model/workspace"
import { useGitRemoteActionPalette } from "../shared/useGitRemoteActionPalette"
import type { usePullRequestDetails } from "./usePullRequestDetails"

type PullRequestDetailsState = ReturnType<typeof usePullRequestDetails>["state"]

/** Pull request `[?]` palette; every row runs through the same workspace dispatcher as keys. */
export function usePullRequestPalette({
  active,
  blocked,
  focus,
  selected,
  previewTab,
  previewItemIndex,
  details,
  selectedComment,
  creation,
  watching,
  actions,
  copy,
  onSelectTab,
  dispatch,
}: {
  active: boolean
  /** A modal or the remote diff owns the keyboard; the palette cannot open over it. */
  blocked: boolean
  focus: PullRequestFocus
  selected: PullRequestSummary | null
  previewTab: PullRequestPreviewTab
  previewItemIndex: number
  details: PullRequestDetailsState
  selectedComment: PullRequestComment | null
  creation: { available: boolean; openModal: () => void }
  watching: boolean
  actions: {
    availability: ReadonlyMap<PullRequestActionKind, PullRequestActionAvailability>
    openCommentAction: (kind: "reaction" | "reply", comment: PullRequestComment) => void
  }
  copy: (value: string, success: string) => void
  onSelectTab?: ((tab: GitWorkspaceTab) => void) | undefined
  dispatch: (action: PullRequestWorkspaceAction) => void
}) {
  const selectedCommit =
    previewTab === "commits" && details.status === "ready"
      ? details.details.commits[previewItemIndex]
      : undefined
  const reactToComment = () =>
    selectedComment && actions.openCommentAction("reaction", selectedComment)
  const replyToComment = () =>
    selectedComment && actions.openCommentAction("reply", selectedComment)

  const run = (id: PullRequestPaletteId) => {
    const tab = gitTabForPaletteId(id)
    const kind = pullRequestMutationKind(id)
    const special: Partial<Record<PullRequestPaletteId, () => unknown>> = {
      create: creation.openModal,
      "copy-sha": () => selectedCommit && copy(selectedCommit.sha, translateUi("SHA copiado.")),
      "comment-react": reactToComment,
      "comment-reply": replyToComment,
      "open-diff": () => dispatch({ type: "open-diff" }),
      "toggle-watch": () => dispatch({ type: "toggle-watch" }),
    }
    if (tab) onSelectTab?.(tab)
    else if (kind) dispatch({ type: "prepare-action", kind })
    else if (special[id]) special[id]()
    else {
      const command = remoteDashboardCommand(id)
      if (command) dispatch(command)
    }
  }
  const palette = useGitRemoteActionPalette<PullRequestPaletteId>({
    active: active && !blocked,
    title: "AÇÕES DO GIT · PULL REQUESTS",
    buildActions: () =>
      pullRequestPaletteActions({
        focus,
        hasSelection: Boolean(selected),
        canCreate: creation.available,
        activityComment: previewTab === "activity" && Boolean(selectedComment),
        previewTab,
        detailsReady: details.status === "ready",
        watching,
        selectedCommit: Boolean(selectedCommit),
        availability: actions.availability,
        navigation: Boolean(onSelectTab),
      }),
    onRun: run,
    boxes: {
      ids: { list: "git-pr-list-panel", preview: "git-pr-preview-panel" },
      current: focus,
      onFocus: (target) => dispatch({ type: "focus", target }),
    },
  })
  return { ...palette, reactToComment, replyToComment }
}
