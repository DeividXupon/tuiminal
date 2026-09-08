import { RGBA } from "@opentui/core"
import { COLORS, subscribeUiTheme } from "../../../core/settings/theme"
import { createUiSyntaxStyle } from "../../../shared/ui/syntax-style"

export const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
export const FILES_PANEL_WIDTH = 31
export const DIFF_SYNTAX_STYLE = createUiSyntaxStyle()
export let DIFF_CHANGED_HIGHLIGHT = RGBA.fromHex(COLORS.diffChangedBg)
export let DIFF_REMOVED_HIGHLIGHT = RGBA.fromHex(COLORS.diffRemovedChangedBg)
subscribeUiTheme(() => {
  DIFF_CHANGED_HIGHLIGHT = RGBA.fromHex(COLORS.diffChangedBg)
  DIFF_REMOVED_HIGHLIGHT = RGBA.fromHex(COLORS.diffRemovedChangedBg)
})
