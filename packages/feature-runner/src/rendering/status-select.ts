import { RGBA, type OptimizedBuffer, type SelectOption, type SelectRenderable } from "@opentui/core"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RunnerVisualStatus } from "../model/status"
import { runnerStatusColor } from "./status"

export type RunnerStatusOption = SelectOption & { status?: RunnerVisualStatus; marker?: string }

/** Decorate native rows after painting, preserving selection, keyboard and mouse behavior.
 * These lists use the native default item spacing/font and its centered scrolling. */
export function paintRunnerStatusRows(this: SelectRenderable, buffer: OptimizedBuffer) {
  const linesPerItem = this.showDescription ? 2 : 1
  const visible = Math.max(1, Math.floor(this.height / linesPerItem))
  const selected = this.getSelectedIndex()
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(visible / 2), this.options.length - visible),
  )
  const textX = this.showSelectionIndicator ? 3 : 1
  const textWidth = Math.max(0, this.width - textX - 1)
  for (let row = 0; row < visible; row += 1) {
    const option = this.options[start + row] as RunnerStatusOption | undefined
    if (!option?.status || (row + 1) * linesPerItem > this.height) continue
    const color = RGBA.fromHex(runnerStatusColor(option.status))
    const background = RGBA.fromHex(start + row === selected ? COLORS.diffModifiedBg : COLORS.panel)
    buffer.drawText(
      truncateDisplay(option.name, textWidth),
      textX,
      row * linesPerItem,
      option.marker ? RGBA.fromHex("#ffffff") : color,
      background,
    )
    if (option.marker) {
      buffer.drawText(
        truncateDisplay(option.marker, textWidth),
        textX,
        row * linesPerItem,
        color,
        background,
      )
    }
    buffer.drawText("▏", 0, row * linesPerItem, color, background)
  }
}
