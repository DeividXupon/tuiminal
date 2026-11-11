import { getTreeSitterClient, type TextareaRenderable } from "@opentui/core"
import { useEffect, type RefObject } from "react"
import { subscribeUiTheme } from "@xupon/tuiminal-core/settings/theme"
import type { HttpBodyKind } from "../model/types"
import { applyHttpVariableHighlights } from "./http-variable-rendering"
import { applyHttpBodyHighlights } from "./http-body-highlights"

const MAX_HIGHLIGHT_CHARACTERS = 50_000

export function useHttpBodyHighlighting(
  input: RefObject<TextareaRenderable | null>,
  kind: HttpBodyKind | "javascript",
  source: string,
  visible: boolean,
) {
  useEffect(() => {
    const editor = input.current
    if (!editor || editor.isDestroyed) return
    editor.editBuffer.clearAllHighlights()
    if (kind !== "javascript") applyHttpVariableHighlights(editor, source)
    editor.requestRender()
    if (!visible || !["json", "xml", "javascript"].includes(kind)) return
    let disposed = false
    const timer = setTimeout(async () => {
      const text = source.slice(0, MAX_HIGHLIGHT_CHARACTERS)
      try {
        const result = await getTreeSitterClient().highlightOnce(text, kind)
        if (disposed || editor.isDestroyed || editor.plainText !== source) return
        applyHttpBodyHighlights(editor, text, result.highlights ?? [])
        if (kind !== "javascript") applyHttpVariableHighlights(editor, text)
      } catch {
        // Syntax coloring must never interrupt editing or submit the body.
      }
    }, 60)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [input, kind, source, visible])
  useEffect(() => {
    const unsubscribe = subscribeUiTheme(() => input.current?.requestRender())
    return () => {
      unsubscribe()
    }
  }, [input])
}
