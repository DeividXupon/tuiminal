import { Button } from "@tuiparts/react/button"
import { formatUiDateTime, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { ReactNode } from "react"
import { pullRequestMarkdownLines } from "../../model/pr/content"
import {
  type GitHubReactionGroup,
  githubReactionSummary,
  hasAnyGitHubReaction,
} from "../../model/reactions"
import { PullRequestMarkdown } from "../../rendering/pr-markdown"

export function GitHubActivityItem({
  id,
  author,
  createdAt,
  body,
  summary,
  depth = 0,
  isReply = false,
  selected,
  onSelect,
  children,
}: {
  id: string
  author: string
  createdAt: string
  body: string
  summary: string
  depth?: number
  isReply?: boolean
  selected: boolean
  onSelect: () => void
  children?: ReactNode
}) {
  const date = formatUiDateTime(createdAt, { dateStyle: "short", timeStyle: "short" })
  return (
    <box id={id} style={{ width: "100%", marginBottom: 1, paddingLeft: Math.min(depth, 3) * 2 }}>
      <Button id={`${id}-select`} height={1} onPress={onSelect}>
        <text
          content={`${selected ? "▶" : " "} ${isReply ? "↳ " : ""}@${author} · ${date} · ${summary}`}
          style={{
            fg: selected ? COLORS.text : COLORS.git,
            bg: selected ? COLORS.panelRaised : COLORS.panel,
          }}
        />
      </Button>
      <PullRequestMarkdown lines={pullRequestMarkdownLines(body)} />
      {children}
    </box>
  )
}

type ActivityComment = {
  author: { login: string }
  createdAt: string
  reactionGroups?: GitHubReactionGroup[]
  reactionCount?: number
}

export function GitHubActivityComment<T extends ActivityComment>({
  id,
  entry,
  selected,
  onSelect,
  onReact,
  onReply,
}: {
  id: string
  entry: { comment: T; body: string; depth: number; isReply: boolean }
  selected: boolean
  onSelect: () => void
  onReact: (comment: T) => void
  onReply: (comment: T) => void
}) {
  const { comment } = entry
  return (
    <GitHubActivityItem
      id={id}
      author={comment.author.login}
      createdAt={comment.createdAt}
      body={entry.body}
      depth={entry.depth}
      isReply={entry.isReply}
      summary={githubReactionSummary(comment.reactionGroups) || `♥ ${comment.reactionCount ?? 0}`}
      selected={selected}
      onSelect={onSelect}
    >
      {selected ? (
        <box style={{ flexDirection: "row" }}>
          <InlineButton
            label={translateUi(
              hasAnyGitHubReaction(comment.reactionGroups, comment.reactionCount)
                ? "[E] Nova reação"
                : "[E] Reagir",
            )}
            accent={COLORS.git}
            onPress={() => onReact(comment)}
          />
          <InlineButton
            label={translateUi("[Enter] Responder")}
            accent={COLORS.git}
            onPress={() => onReply(comment)}
          />
        </box>
      ) : null}
    </GitHubActivityItem>
  )
}
