import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { pullRequestMarkdownLines } from "../../model/pr/content"
import { PullRequestMarkdown } from "../../rendering/pr-markdown"
import { IssueActivityContent } from "../issue/IssuePreviewPane"
import { PullRequestActivityContent } from "../pr/PullRequestActivityContent"
import type { InboxConversationController } from "./useInboxConversation"

export function InboxConversationContent({
  conversation,
  onFocus,
}: {
  conversation: InboxConversationController
  onFocus: () => void
}) {
  const { data, state, tab } = conversation
  if (!data) {
    const text =
      state.status === "error"
        ? state.message
        : state.status === "not-found"
          ? "Ação indisponível."
          : "CARREGANDO DETALHES…"
    return (
      <text
        content={translateUi(text)}
        style={{ fg: state.status === "error" ? COLORS.danger : COLORS.muted }}
      />
    )
  }
  if (tab === "overview") {
    const lines = pullRequestMarkdownLines(data.details.body)
    return (
      <box style={{ width: "100%" }}>
        <text content={translateUi("DESCRIÇÃO")} style={{ fg: COLORS.git }} />
        <PullRequestMarkdown lines={conversation.expanded ? lines : lines.slice(0, 10)} />
        {lines.length > 10 ? (
          <InlineButton
            label={conversation.expanded ? "[E] Recolher descrição" : "[E] Expandir descrição"}
            accent={COLORS.git}
            onPress={conversation.toggleExpanded}
          />
        ) : null}
      </box>
    )
  }
  const shared = {
    idPrefix: "git-inbox-activity",
    selectedIndex: conversation.selectedIndex,
    onSelect: (index: number) => {
      conversation.select(index)
      onFocus()
    },
  }
  return (
    <>
      {data.kind === "issue" ? (
        <IssueActivityContent
          {...shared}
          details={data.details}
          onReact={(comment) => conversation.issueActions.openCommentAction("reaction", comment)}
          onReply={(comment) => conversation.issueActions.openCommentAction("reply", comment)}
        />
      ) : (
        <PullRequestActivityContent
          {...shared}
          details={data.details}
          onReact={(comment) => conversation.prActions.openCommentAction("reaction", comment)}
          onReply={(comment) => conversation.prActions.openCommentAction("reply", comment)}
        />
      )}
      {conversation.loadingMore ? (
        <text content={translateUi("CARREGANDO DETALHES…")} style={{ fg: COLORS.muted }} />
      ) : null}
    </>
  )
}
