import { CliRenderEvents, TextareaRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { urlVariableCompletion } from "../model/url-query"
import {
  httpVariableInput,
  type HttpCompletionKey,
  type HttpVariableSuggestion,
} from "../model/variable-completion"

type Candidate = NonNullable<ReturnType<typeof urlVariableCompletion>> & {
  editor: TextareaRenderable
}
export function useHttpVariableCompletion({
  active,
  requestId,
  suggestions,
  keyRef,
}: {
  active: boolean
  requestId: string
  suggestions: HttpVariableSuggestion[]
  keyRef: RefObject<((key: HttpCompletionKey) => boolean) | null>
}) {
  const renderer = useRenderer()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [index, setIndex] = useState(0)
  const current = useRef<Candidate | null>(null)
  const selected = useRef(0)
  const snapshot = useRef("")
  const names = suggestions.map((v) => v.name)
  const namesKey = JSON.stringify(names)
  const close = useCallback(() => {
    current.current = null
    setCandidate(null)
  }, [])
  useEffect(() => {
    snapshot.current = ""
    const update = () => {
      const editor = renderer.currentFocusedRenderable
      if (!active || !(editor instanceof TextareaRenderable) || !httpVariableInput(editor.id)) {
        snapshot.current = ""
        if (current.current) close()
        return
      }
      const offset = editor.cursorOffset
      const before = editor.getTextRange(Math.max(0, offset - 256), offset)
      const signature = JSON.stringify([requestId, editor.id, offset, before])
      if (snapshot.current === signature) return
      snapshot.current = signature
      const after = editor.getTextRange(offset, offset + 256)
      const match = /^[\w$.\s-]*\}\}/.test(after)
        ? null
        : urlVariableCompletion(before, before.length, JSON.parse(namesKey))
      const next = match
        ? { ...match, start: offset - (before.length - match.start), end: offset, editor }
        : null
      current.current = next
      selected.current = 0
      setIndex(0)
      setCandidate(next)
    }
    update()
    renderer.on(CliRenderEvents.FRAME, update)
    return () => {
      renderer.off(CliRenderEvents.FRAME, update)
    }
  }, [active, requestId, namesKey, renderer, close])
  const complete = (selection: number) => {
    const item = current.current
    const name = item?.suggestions[selection]
    if (!item || !name || item.editor.isDestroyed) return
    const editor = item.editor
    if (renderer.currentFocusedRenderable !== editor) return
    const suffix = editor.getTextRange(item.end, item.end + 2).match(/^}{1,2}/)?.[0].length ?? 0
    close()
    editor.setSelection(item.start, item.end + suffix)
    editor.insertText(`{{${name}}}`)
  }
  keyRef.current = (key) => {
    const item = current.current
    if (
      !active ||
      !item ||
      key.ctrl ||
      key.meta ||
      key.option ||
      key.shift ||
      renderer.currentFocusedRenderable !== item.editor
    )
      return false
    if (key.name === "tab") complete(selected.current)
    else if (key.name === "down" || key.name === "up") {
      selected.current =
        (selected.current + (key.name === "down" ? 1 : item.suggestions.length - 1)) %
        item.suggestions.length
      setIndex(selected.current)
    } else if (key.name === "escape") close()
    else return false
    key.preventDefault()
    key.stopPropagation()
    return true
  }
  useEffect(
    () => () => {
      keyRef.current = null
    },
    [keyRef],
  )
  return { candidate: active ? candidate : null, index, complete }
}
