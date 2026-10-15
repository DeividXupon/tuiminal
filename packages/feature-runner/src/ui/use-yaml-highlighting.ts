import type { TextareaRenderable } from "@opentui/core"
import { useEffect, type RefObject } from "react"
import { displayWidth } from "@xupon/tuiminal-core/i18n/index"
import { subscribeUiTheme } from "@xupon/tuiminal-core/settings/theme"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import { runnerYamlSyntax } from "../model/yaml-syntax"

export const runnerYamlStyle = createUiSyntaxStyle()
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function columns(line: string, tabWidth: number) {
  const offsets = new Array<number>(line.length + 1)
  let column = 0
  for (const { segment, index } of graphemes.segment(line)) {
    for (let i = index; i < index + segment.length; i++) offsets[i] = column
    column += segment === "\t" ? tabWidth - (column % tabWidth) : displayWidth(segment)
  }
  offsets[line.length] = column
  return offsets
}

export function highlightRunnerYaml(editor: TextareaRenderable, source: string) {
  const spans = runnerYamlSyntax(source)
  editor.editBuffer.clearAllHighlights()
  let offset = 0
  let index = 0
  const lines = source.split("\n")
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!
    const end = offset + line.length
    const positions = columns(line, editor.editBuffer.getTabWidth())
    while (index < spans.length && spans[index]!.end <= offset) index++
    for (let i = index; i < spans.length && spans[i]!.start < end; i++) {
      const span = spans[i]!
      const startColumn = positions[Math.max(0, span.start - offset)]!
      const endColumn = positions[Math.min(line.length, span.end - offset)]!
      const styleId = runnerYamlStyle.getStyleId(span.group)
      if (endColumn > startColumn && styleId != null)
        editor.editBuffer.addHighlight(row, {
          start: startColumn,
          end: endColumn,
          styleId,
          priority: 20,
        })
    }
    offset = end + 1
  }
  editor.requestRender()
}

export function useYamlHighlighting(input: RefObject<TextareaRenderable | null>, source: string) {
  useEffect(() => {
    if (input.current) highlightRunnerYaml(input.current, source)
  }, [input, source])
  useEffect(() => {
    const unsubscribe = subscribeUiTheme(() => input.current?.requestRender())
    return () => {
      unsubscribe()
    }
  }, [input])
}
