import type { TerminalColors } from "@opentui/core"

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function oscColor(code: string, color: string | null) {
  if (!color || !HEX_COLOR.test(color)) return ""
  const rgb = `${color.slice(1, 3)}/${color.slice(3, 5)}/${color.slice(5, 7)}`
  return `\u001b]${code};rgb:${rgb}\u001b\\`
}

/** Configure the embedded VT with colors reported by the terminal hosting Tuiminal. */
export function hostTerminalPaletteSequence(colors: TerminalColors) {
  let sequence = ""
  for (const [index, color] of colors.palette.slice(0, 16).entries()) {
    if (!color || !HEX_COLOR.test(color)) continue
    sequence += oscColor(`4;${index}`, color)
  }
  sequence += oscColor("10", colors.defaultForeground)
  sequence += oscColor("11", colors.defaultBackground)
  sequence += oscColor("12", colors.cursorColor)
  return sequence
}
