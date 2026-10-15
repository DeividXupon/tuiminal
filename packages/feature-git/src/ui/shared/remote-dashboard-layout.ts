import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"

type RemoteDashboardSection = {
  id: string
  title: string
}

export function remoteHeaderControlsFit({
  terminalWidth,
  sections,
  counts,
  actionLabels,
}: {
  terminalWidth: number
  sections: readonly RemoteDashboardSection[]
  counts: Readonly<Record<string, number | null>>
  actionLabels: readonly string[]
}) {
  if (LAYOUT.compact) return false
  const sectionControlsWidth =
    displayWidth("[A←]") +
    displayWidth("[F→]") +
    4 +
    sections.reduce(
      (width, section) =>
        width + displayWidth(`${translateUi(section.title)} ${counts[section.id] ?? "…"}`) + 2,
      0,
    )
  const actionControlsWidth = actionLabels.reduce(
    (width, label) => width + displayWidth(label) + 2,
    0,
  )
  return terminalWidth - LAYOUT.outerPadding * 2 >= sectionControlsWidth + actionControlsWidth + 1
}
