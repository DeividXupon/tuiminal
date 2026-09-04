import { RGBA, SyntaxStyle } from "@opentui/core"
import { COLORS } from "../../../core/settings/theme"

export const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
export const FILES_PANEL_WIDTH = 31
export const DIFF_SYNTAX_STYLE = SyntaxStyle.fromStyles({
  default: { fg: COLORS.text },
  keyword: { fg: "#c792ea", bold: true },
  string: { fg: "#c3e88d" },
  comment: { fg: COLORS.muted, italic: true },
  number: { fg: "#f78c6c" },
  function: { fg: "#82aaff" },
  type: { fg: "#ffcb6b" },
  property: { fg: "#80cbc4" },
  operator: { fg: "#89ddff" },
  constant: { fg: "#f78c6c" },
  punctuation: { fg: "#a6accd" },
})
export const DIFF_CHANGED_HIGHLIGHT = RGBA.fromHex(COLORS.diffChangedBg)
export const DIFF_REMOVED_HIGHLIGHT = RGBA.fromHex(COLORS.diffRemovedChangedBg)
