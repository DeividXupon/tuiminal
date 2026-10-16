import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { pullRequestActivity } from "../../model/pr/activity"
import type { PullRequestComment, PullRequestDetails } from "../../model/pr/types"
import { GitHubActivityComment, GitHubActivityItem } from "../shared/GitHubActivityItem"
import { githubActivityLabel } from "../shared/github-activity-label"

export function PullRequestActivityContent({
  details,
  selectedIndex,
  onSelect,
  onReact,
  onReply,
  idPrefix = "git-pr-activity",
}: {
  details: PullRequestDetails
  selectedIndex: number
  onSelect: (index: number) => void
  onReact: (comment: PullRequestComment) => void
  onReply: (comment: PullRequestComment) => void
  idPrefix?: string
}) {
  return (
    <box style={{ width: "100%" }}>
      {pullRequestActivity(details).map((entry, index) =>
        entry.comment ? (
          <GitHubActivityComment
            key={entry.id}
            id={`${idPrefix}-${index}`}
            entry={{ ...entry, comment: entry.comment }}
            selected={index === selectedIndex}
            onSelect={() => onSelect(index)}
            onReact={onReact}
            onReply={onReply}
          />
        ) : (
          <GitHubActivityItem
            key={entry.id}
            id={`${idPrefix}-${index}`}
            author={entry.author}
            createdAt={entry.at}
            body={entry.body}
            summary={githubActivityLabel(entry.label)}
            selected={index === selectedIndex}
            onSelect={() => onSelect(index)}
          />
        ),
      )}
      {details.pages.timeline.hasNextPage ? (
        <text
          content={`${details.timeline.length}/${details.pages.timeline.totalCount ?? "?"} · ${translateUi("há mais itens para carregar")}`}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </box>
  )
}
