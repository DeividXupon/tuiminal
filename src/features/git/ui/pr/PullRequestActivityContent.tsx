import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../../../core/settings/theme"
import { formatUiDateTime, translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { pullRequestCommentThread } from "../../model/pr/activity"
import { pullRequestMarkdownLines } from "../../model/pr/content"
import {
  githubReactionSummary,
  hasAnyGitHubReaction,
  type GitHubDiscussionThreadEntry,
} from "../../model/reactions"
import type { PullRequestComment, PullRequestDetails } from "../../model/pr/types"
import { PullRequestMarkdown } from "../../rendering/pr-markdown"

type ActivityEntry = {
  id: string
  at: string
  text: string
  comment: PullRequestComment | null
  body: string
  depth: number
  isReply: boolean
}

function pullRequestActivity(
  details: PullRequestDetails,
  comments: GitHubDiscussionThreadEntry<PullRequestComment>[],
) {
  const commentIds = new Set(comments.map(({ comment }) => comment.id))
  const otherEntries: ActivityEntry[] = [
    ...details.reviews.map((review) => ({
      id: review.id,
      at: review.submittedAt,
      text: `@${review.author.login} · ${translateUi(review.state)}${review.body ? `: ${review.body.replace(/\s+/g, " ")}` : ""}`,
      comment: null,
      body: "",
      depth: 0,
      isReply: false,
    })),
    ...details.timeline
      .filter((event) => !commentIds.has(event.id))
      .map((event) => ({
        id: event.id,
        at: event.createdAt,
        text: `@${event.actor.login} · ${translateUi(event.kind)}${event.body ? `: ${event.body.replace(/\s+/g, " ")}` : ""}`,
        comment: null,
        body: "",
        depth: 0,
        isReply: false,
      })),
  ]
  const groups: Array<{ at: string; entries: ActivityEntry[] }> = []
  for (const entry of comments) {
    if (entry.depth === 0 || !groups.length) {
      groups.push({ at: entry.comment.createdAt, entries: [] })
    }
    groups.at(-1)?.entries.push({
      id: entry.comment.id,
      at: entry.comment.createdAt,
      text: `@${entry.comment.author.login}`,
      comment: entry.comment,
      body: entry.body,
      depth: entry.depth,
      isReply: entry.isReply,
    })
  }
  const uniqueOtherEntries = [...new Map(otherEntries.map((entry) => [entry.id, entry])).values()]
  return [...groups, ...uniqueOtherEntries.map((entry) => ({ at: entry.at, entries: [entry] }))]
    .sort((left, right) => right.at.localeCompare(left.at))
    .flatMap((group) => group.entries)
}

function reactionLabel(comment: PullRequestComment) {
  return translateUi(
    hasAnyGitHubReaction(comment.reactionGroups) ? "[E] Nova reação" : "[E] Reagir",
  )
}

function ActivityComment({
  entry,
  index,
  selected,
  onSelect,
  onReact,
  onReply,
}: {
  entry: ActivityEntry & { comment: PullRequestComment }
  index: number
  selected: boolean
  onSelect: (index: number) => void
  onReact: (comment: PullRequestComment) => void
  onReply: (comment: PullRequestComment) => void
}) {
  const reactions = githubReactionSummary(entry.comment.reactionGroups)
  return (
    <>
      <Button height={1} onPress={() => onSelect(index)}>
        <text
          content={`${selected ? "▶" : " "} ${entry.isReply ? "↳ " : ""}${entry.text}${reactions ? ` · ${reactions}` : ""}`}
          style={{
            fg: selected ? COLORS.text : COLORS.git,
            bg: selected ? COLORS.panelRaised : COLORS.panel,
          }}
        />
      </Button>
      <PullRequestMarkdown lines={pullRequestMarkdownLines(entry.body)} />
      {selected ? (
        <box style={{ flexDirection: "row" }}>
          <InlineButton
            label={reactionLabel(entry.comment)}
            accent={COLORS.git}
            onPress={() => onReact(entry.comment)}
          />
          <InlineButton
            label={translateUi("[Enter] Responder")}
            accent={COLORS.git}
            onPress={() => onReply(entry.comment)}
          />
        </box>
      ) : null}
    </>
  )
}

export function PullRequestActivityContent({
  details,
  selectedIndex,
  onSelect,
  onReact,
  onReply,
}: {
  details: PullRequestDetails
  selectedIndex: number
  onSelect: (index: number) => void
  onReact: (comment: PullRequestComment) => void
  onReply: (comment: PullRequestComment) => void
}) {
  const comments = pullRequestCommentThread(details.comments, details.identity)
  const indexById = new Map(comments.map(({ comment }, index) => [comment.id, index]))
  return (
    <box style={{ width: "100%" }}>
      {pullRequestActivity(details, comments).map((entry) => {
        const commentIndex = entry.comment ? (indexById.get(entry.comment.id) ?? -1) : -1
        return (
          <box
            key={entry.id}
            style={{ width: "100%", marginBottom: 1, paddingLeft: Math.min(entry.depth, 3) * 2 }}
          >
            <text
              content={formatUiDateTime(entry.at, { dateStyle: "short", timeStyle: "short" })}
              style={{ fg: COLORS.muted }}
            />
            {entry.comment ? (
              <ActivityComment
                entry={{ ...entry, comment: entry.comment }}
                index={commentIndex}
                selected={commentIndex >= 0 && commentIndex === selectedIndex}
                onSelect={onSelect}
                onReact={onReact}
                onReply={onReply}
              />
            ) : (
              <text content={entry.text} style={{ fg: COLORS.text }} />
            )}
          </box>
        )
      })}
      {details.pages.timeline.hasNextPage ? (
        <text
          content={`${details.timeline.length}/${details.pages.timeline.totalCount ?? "?"} · ${translateUi("há mais itens para carregar")}`}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </box>
  )
}
