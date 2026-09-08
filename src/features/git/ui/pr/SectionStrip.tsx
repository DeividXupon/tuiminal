import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { PullRequestSection } from "../../model/pr/types"

export function SectionStrip({
  sections,
  activeIndex,
  counts,
  onSelect,
}: {
  sections: readonly PullRequestSection[]
  activeIndex: number
  counts: Readonly<Record<string, number | null>>
  onSelect: (index: number) => void
}) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <InlineButton
        label="[<]"
        accent={COLORS.git}
        onPress={() => onSelect((activeIndex - 1 + sections.length) % sections.length)}
      />
      {sections.map((section, index) => (
        <InlineButton
          key={section.id}
          id={`git-pr-section-${index}`}
          label={`${translateUi(section.title)} ${counts[section.id] ?? "…"}`}
          accent={COLORS.git}
          active={index === activeIndex}
          onPress={() => onSelect(index)}
        />
      ))}
      <InlineButton
        label="[>]"
        accent={COLORS.git}
        onPress={() => onSelect((activeIndex + 1) % sections.length)}
      />
    </box>
  )
}
