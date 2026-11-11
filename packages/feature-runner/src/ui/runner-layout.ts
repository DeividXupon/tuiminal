import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"

export function runnerCommandWidth(width: number) {
  return width < 72 ? Math.max(1, width - 2) : Math.min(42, Math.max(30, Math.floor(width * 0.31)))
}

export function runnerLogWidth(width: number, commandWidth: number) {
  return width < 72 ? Math.max(8, width - 6) : Math.max(20, width - commandWidth - 11)
}

export function runnerContentHeight(
  terminal: { width: number; height: number },
  footerHeight: number,
) {
  const chromeHeight =
    (LAYOUT.compact ? 1 : 2) + LAYOUT.outerPadding + 3 + LAYOUT.headerSpacing + footerHeight
  const mainHeight = Math.max(6, terminal.height - chromeHeight)
  return Math.max(4, mainHeight - (terminal.width < 72 ? 1 + LAYOUT.headerSpacing : 0))
}

export function runnerHeaderLayout(width: number, summary: string, projectCount: number) {
  const newProjectLabel = "[N] Nova aba" as const
  const newProjectWidth = displayWidth(translateUi(newProjectLabel)) + 2
  const projectTabAreaWidth = Math.max(
    11,
    width - displayWidth(translateUi(summary)) - newProjectWidth - 18,
  )
  const projectTabWidth = Math.max(
    11,
    Math.min(30, Math.floor(projectTabAreaWidth / Math.max(1, projectCount))),
  )
  return {
    newProjectLabel,
    newProjectWidth,
    projectTabAreaWidth,
    projectTabWidth,
  }
}

export function runnerMultiCapacity(width: number) {
  return width >= 126 ? 3 : width >= 72 ? 2 : 1
}

export function runnerMultiLayout(
  width: number,
  commandPanelWidth: number,
  count: number,
  before: number,
  after: number,
) {
  const narrow = width < 72
  const multiRailWidth = narrow ? 5 : 7
  const rails = (before ? 1 : 0) + (after ? 1 : 0)
  const content = narrow
    ? Math.max(24, width - 2)
    : Math.max(24, width - commandPanelWidth - LAYOUT.gap - 4)
  return {
    multiRailWidth,
    multiPaneWidth: Math.max(
      18,
      Math.floor(
        (content - rails * multiRailWidth - Math.max(0, count + rails - 1) * LAYOUT.gap) /
          Math.max(1, count),
      ),
    ),
  }
}
