import stringWidth from "string-width"

// SVG rasterizers may collapse whitespace even with xml:space="preserve".
// Position visible runs explicitly in terminal cells, including wide graphemes.
export function demoTextRuns(text: string) {
  const runs: Array<{ text: string; column: number; width: number }> = []
  let column = 0
  for (const [part] of text.matchAll(/\s+|\S+/gu)) {
    const width = stringWidth(part)
    if (part.trim()) runs.push({ text: part, column, width })
    column += width
  }
  return runs
}
