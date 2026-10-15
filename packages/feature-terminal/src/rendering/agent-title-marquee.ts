import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { TerminalSession } from "../model/sessions"
import { agentPresentation } from "./agent-presentation"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const START_PAUSE_TICKS = 20
const END_PAUSE_TICKS = 10

export function agentTaskTitleWidth(
  agent: NonNullable<TerminalSession["agent"]>,
  compact: boolean,
  width: number,
  shortcutWidth: number,
) {
  if (!compact) return Math.max(0, width - 5 - shortcutWidth)
  const statusWidth = Math.min(
    displayWidth(agentPresentation(agent.state, 0, agent.activity).shortLabel),
    Math.max(5, width - 14),
  )
  return Math.max(2, width - statusWidth - 6 - shortcutWidth)
}

/** Build bounded display windows once per title/width, preserving whole graphemes. */
export function agentTitleWindows(title: string, width: number) {
  if (width <= 0) return [""]
  const windows: string[] = []
  for (const { index } of graphemes.segment(title)) {
    const remaining = title.slice(index)
    windows.push(truncateDisplay(remaining, width, ""))
    if (displayWidth(remaining) <= width) break
  }
  return windows.length ? windows : [""]
}

/** Shared sidebar ticks are 100 ms: hold 2 s, scroll, hold 1 s, jump to start. */
export function agentTitleWindowIndex(windowCount: number, elapsedTicks: number) {
  const last = windowCount - 1
  if (last <= 0) return 0
  const cycle = START_PAUSE_TICKS + last - 1 + END_PAUSE_TICKS
  const tick = Math.max(0, elapsedTicks) % cycle
  return Math.max(0, Math.min(last, tick - START_PAUSE_TICKS + 1))
}
