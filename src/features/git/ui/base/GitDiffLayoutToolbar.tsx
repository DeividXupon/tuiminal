import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { DiffLayout } from "../../model/view"

function layoutLabel(current: DiffLayout, target: DiffLayout, label: string) {
  return `${current === target ? "[V] " : ""}${label}`
}

export function nextGitDiffLayout(current: DiffLayout): DiffLayout {
  if (current === "unified") return "split"
  return current === "split" ? "inline" : "unified"
}

export function GitDiffLayoutToolbar({
  narrow,
  layout,
  onSelect,
}: {
  narrow: boolean
  layout: DiffLayout
  onSelect: (value: DiffLayout) => void
}) {
  if (narrow) {
    return (
      <>
        <text
          content={`VIEW · ${layout === "unified" ? "UNIFICADO" : layout === "split" ? "2 COLUNAS" : "INTRALINHA"}`}
          style={{ fg: COLORS.database }}
        />
        <InlineButton
          label="[V] Alterar"
          accent={COLORS.database}
          onPress={() => onSelect(nextGitDiffLayout(layout))}
        />
      </>
    )
  }
  return (
    <>
      <text content="VIEW" style={{ fg: COLORS.border }} />
      <InlineButton
        label={layoutLabel(layout, "unified", translateUi("Unificado"))}
        accent={COLORS.database}
        active={layout === "unified"}
        onPress={() => onSelect("unified")}
      />
      <InlineButton
        label={layoutLabel(layout, "split", translateUi("2 colunas"))}
        accent={COLORS.database}
        active={layout === "split"}
        onPress={() => onSelect("split")}
      />
      <InlineButton
        label={layoutLabel(layout, "inline", translateUi("Intralinha"))}
        accent={COLORS.database}
        active={layout === "inline"}
        onPress={() => onSelect("inline")}
      />
    </>
  )
}
