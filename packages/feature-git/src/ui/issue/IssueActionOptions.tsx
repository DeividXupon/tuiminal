import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { IssueActionKind } from "../../model/issue/actions"
import type { GitHubReactionContent, GitHubReactionGroup } from "../../model/reactions"
import { ReactionPicker } from "../ReactionPicker"

export function IssueActionOptions({
  kind,
  value,
  reaction,
  reactionGroups,
  currentAssignees,
  checkoutPaths,
  onValue,
  onReaction,
}: {
  kind: IssueActionKind
  value: string
  reaction: GitHubReactionContent
  reactionGroups: readonly GitHubReactionGroup[]
  currentAssignees: readonly string[]
  checkoutPaths: string[]
  onValue: (value: string) => void
  onReaction: (reaction: GitHubReactionContent) => void
}) {
  return (
    <>
      {kind === "reaction" ? (
        <ReactionPicker selected={reaction} groups={reactionGroups} onSelect={onReaction} />
      ) : null}
      {kind === "unassign" && currentAssignees.length ? (
        <box style={{ marginTop: 1, flexDirection: "row" }}>
          {currentAssignees.map((login) => (
            <InlineButton
              key={login}
              label={`[@${login}]`}
              accent={COLORS.git}
              onPress={() => onValue(login)}
            />
          ))}
        </box>
      ) : null}
      {kind === "checkout" && checkoutPaths.length ? (
        <box style={{ marginTop: 1 }}>
          <text content={translateUi("CLONES SALVOS")} style={{ fg: COLORS.git }} />
          {checkoutPaths.slice(0, 3).map((path, index) => (
            <InlineButton
              key={path}
              label={`[${index + 1}] ${path}`}
              accent={COLORS.git}
              active={value === path}
              onPress={() => onValue(path)}
            />
          ))}
        </box>
      ) : null}
    </>
  )
}
