import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"

export type TerminalPresentationStatus = "starting" | "running" | "exited" | "failed"

export function terminalStatusMarker(status: TerminalPresentationStatus) {
  switch (status) {
    case "starting":
      return "◐"
    case "running":
      return "●"
    case "exited":
      return "■"
    case "failed":
      return "×"
  }
}

export function terminalStatusColor(session: {
  status: TerminalPresentationStatus
  accent: string
}) {
  switch (session.status) {
    case "starting":
      return COLORS.warning
    case "running":
      return session.accent
    case "exited":
      return COLORS.muted
    case "failed":
      return COLORS.danger
  }
}

export function compactTerminalText(value: string, width: number) {
  return truncateDisplay(translateUi(value), width)
}

const TERMINAL_FOOTER_FULL =
  "[Ctrl+B] · [C] nova · [V] lado · [S] baixo · [1–4] foco · [/] seção · [G] tabs"
const TERMINAL_FOOTER_COMPACT = "[^B] · [C] seção · [V] │ · [S] ─ · [G] tabs"
const TERMINAL_FOOTER_MINIMAL = "[^B] · [G]"

export function terminalFooterLayout(width: number, minimumNoticeWidth = 14) {
  const availableWidth = Math.max(1, width)
  const candidates = [TERMINAL_FOOTER_FULL, TERMINAL_FOOTER_COMPACT]
  const help =
    candidates.find(
      (candidate) =>
        displayWidth(translateUi(candidate)) + minimumNoticeWidth + 1 <= availableWidth,
    ) ?? TERMINAL_FOOTER_MINIMAL
  const helpWidth = displayWidth(translateUi(help))
  return {
    help,
    helpWidth,
    noticeWidth: Math.max(1, availableWidth - helpWidth - 1),
  }
}
