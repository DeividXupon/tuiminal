import type { COLORS } from "@xupon/tuiminal-core/settings/theme"

type LiveDiffColors = Pick<
  typeof COLORS,
  "canvas" | "diffAddedBg" | "diffGutterBg" | "diffRecentBg" | "diffRemovedBg" | "panel"
>

/** Gutter/content backgrounds for a Live Diff patch, with recent lines in blue. */
export function decoratedLineColors(
  patch: string,
  highlightedLines: ReadonlySet<number>,
  separatorLines: ReadonlySet<number>,
  colors: LiveDiffColors,
) {
  const result = new Map<number, { gutter: string; content: string }>()
  let inHunk = false
  let codeLine = 0
  for (const text of patch.split("\n")) {
    if (text.startsWith("@@ ")) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    const marker = text[0]
    if (marker === "+")
      result.set(codeLine++, { gutter: colors.diffAddedBg, content: colors.diffAddedBg })
    else if (marker === "-")
      result.set(codeLine++, { gutter: colors.diffRemovedBg, content: colors.diffRemovedBg })
    else if (marker === " ")
      result.set(codeLine++, { gutter: colors.diffGutterBg, content: colors.panel })
  }
  for (const line of separatorLines)
    result.set(line, { gutter: colors.canvas, content: colors.canvas })
  for (const line of highlightedLines)
    result.set(line, { gutter: colors.diffRecentBg, content: colors.diffRecentBg })
  return result
}
