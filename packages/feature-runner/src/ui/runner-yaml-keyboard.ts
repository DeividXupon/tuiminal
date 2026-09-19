import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import { runnerYamlNewline } from "../model/yaml-block"

type Options = {
  editor: TextareaRenderable | null
  focused: boolean
  source: string
  row: number
  column: number
  suggestions: string[]
  moveSelection: (step: number) => void
}

export function handleRunnerYamlCompletionKey(key: KeyEvent, options: Options) {
  const { editor, suggestions } = options
  const popupAtCursor = Boolean(
    suggestions.length &&
      editor?.plainText === options.source &&
      editor.logicalCursor.row === options.row &&
      editor.logicalCursor.col === options.column,
  )
  const enter = key.name === "return" || key.name === "enter"
  if (enter && options.focused && !key.ctrl && !key.shift && editor) {
    key.preventDefault()
    key.stopPropagation()
    const indent = runnerYamlNewline(
      editor.plainText,
      editor.logicalCursor.row,
      editor.logicalCursor.col,
    )
    editor.newLine()
    if (indent.length > 1) editor.insertText(indent.slice(1))
    return true
  }
  if (!popupAtCursor || !key.ctrl || !["j", "k"].includes(key.name)) return false
  key.preventDefault()
  key.stopPropagation()
  options.moveSelection(key.name === "k" ? -1 : 1)
  return true
}
