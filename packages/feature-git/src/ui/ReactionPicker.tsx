import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import {
  GITHUB_REACTION_CHOICES,
  type GitHubReactionContent,
  type GitHubReactionGroup,
} from "../model/reactions"

export function ReactionPicker({
  selected,
  groups,
  onSelect,
}: {
  selected: GitHubReactionContent
  groups: readonly GitHubReactionGroup[]
  onSelect: (reaction: GitHubReactionContent) => void
}) {
  return (
    <box style={{ marginTop: 1 }}>
      <text content={translateUi("ESCOLHA UMA REAÇÃO")} style={{ fg: COLORS.git }} />
      <box style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {GITHUB_REACTION_CHOICES.map((reaction, index) => {
          const current = groups.find((group) => group.content === reaction.content)
          return (
            <InlineButton
              key={reaction.content}
              label={`[${index + 1}] ${reaction.emoji} ${translateUi(reaction.label)}${current?.count ? ` ${current.count}` : ""}${current?.viewerHasReacted ? " ✓" : ""}`}
              accent={COLORS.git}
              active={reaction.content === selected}
              onPress={() => onSelect(reaction.content)}
            />
          )
        })}
      </box>
      <text
        content={translateUi("O ✓ indica uma reação que você já adicionou.")}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
