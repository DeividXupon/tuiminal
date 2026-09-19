import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import type { ColorPalette } from "@xupon/tuiminal-core/settings/theme"
import type { HttpJsonTokenKind, HttpJsonTree } from "../model/json-tree"

function tokenColor(kind: HttpJsonTokenKind, palette: ColorPalette) {
  switch (kind) {
    case "marker":
      return palette.focus
    case "property":
      return palette.http
    case "string":
      return palette.success
    case "number":
    case "constant":
      return palette.warning
    case "summary":
      return palette.muted
    case "punctuation":
      return palette.focus
    default:
      return palette.text
  }
}

export function buildHttpJsonDocument(
  tree: Pick<HttpJsonTree, "lines" | "selectedPath"> | HttpJsonTree,
  options: {
    palette: ColorPalette
    lineNumbers: boolean
    focused: boolean
    highlightSelection?: boolean
  },
) {
  const chunks: TextChunk[] = []
  const colors = new Map<string, RGBA>()
  const canvas = RGBA.fromHex(options.palette.canvas)
  const selectedBackground = RGBA.fromHex(
    options.focused ? options.palette.panelRaised : options.palette.panelAlt,
  )
  const digits = String(tree.lines.length).length

  const color = (value: string) => {
    const known = colors.get(value)
    if (known) return known
    const parsed = RGBA.fromHex(value)
    colors.set(value, parsed)
    return parsed
  }

  tree.lines.forEach((line, lineIndex) => {
    const selected = options.highlightSelection !== false && line.path === tree.selectedPath
    const background = selected ? selectedBackground : canvas
    if (options.lineNumbers) {
      chunks.push({
        __isChunk: true,
        text: `${String(lineIndex + 1).padStart(digits)} │ `,
        fg: color(options.palette.muted),
        bg: background,
      })
    }
    for (const token of line.tokens) {
      chunks.push({
        __isChunk: true,
        text: token.text,
        fg: color(tokenColor(token.kind, options.palette)),
        bg: background,
      })
    }
    if (lineIndex < tree.lines.length - 1) {
      chunks.push({ __isChunk: true, text: "\n", fg: color(options.palette.text), bg: background })
    }
  })
  return new StyledText(chunks)
}
