import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { IssueSection } from "../../model/issue/types"

export function IssueSectionStrip({
  sections,
  activeIndex,
  counts,
  onSelect,
  onCreate,
  onManage,
}: {
  sections: readonly IssueSection[]
  activeIndex: number
  counts: Readonly<Record<string, number | null>>
  onSelect: (index: number) => void
  onCreate?: () => void
  onManage?: () => void
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
          id={`git-issue-section-${index}`}
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
      <InlineButton
        id="git-issue-add"
        label="[+]"
        accent={COLORS.git}
        disabled={!onCreate}
        onPress={() => onCreate?.()}
      />
      <InlineButton
        id="git-issue-manage-sections"
        label="[Ctrl+E]"
        accent={COLORS.git}
        disabled={!onManage}
        onPress={() => onManage?.()}
      />
    </box>
  )
}
