import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { IssueSection } from "../../model/issue/types"

export function IssueSectionStrip({
  sections,
  activeIndex,
  counts,
  onSelect,
}: {
  sections: readonly IssueSection[]
  activeIndex: number
  counts: Readonly<Record<string, number | null>>
  onSelect: (index: number) => void
}) {
  return (
    <box id="git-issue-sections" style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <DirectionalButton
        direction={-1}
        accent={COLORS.git}
        onPress={() => onSelect((activeIndex - 1 + sections.length) % sections.length)}
      />
      {sections.map((section, index) => (
        <InlineButton
          key={section.id}
          id={`git-issue-section-${index}`}
          label={`${translateUi(section.title)} ${counts[section.id] ?? "…"}`}
          accent={COLORS.git}
          active={index === activeIndex}
          onPress={() => onSelect(index)}
        />
      ))}
      <DirectionalButton
        direction={1}
        accent={COLORS.git}
        onPress={() => onSelect((activeIndex + 1) % sections.length)}
      />
    </box>
  )
}
