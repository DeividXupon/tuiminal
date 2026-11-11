import { RGBA, type TextareaRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { HttpRequestDefinition } from "../model/types"
import { HTTP_BODY_SYNTAX } from "./http-body-highlights"
import { useHttpBodyHighlighting } from "./use-http-body-highlighting"

export function HttpBodyEditor({
  request,
  visible,
  register,
  onFocus,
  onChange,
  onSend,
}: {
  request: HttpRequestDefinition
  visible: boolean
  register: (editor: TextareaRenderable | null) => void
  onFocus: () => void
  onChange: (value: string) => void
  onSend: () => void
}) {
  const input = useRef<TextareaRenderable | null>(null)
  const publishedText = useRef(request.body.text)
  publishedText.current = request.body.text
  const syncText = () => {
    const editor = input.current
    if (!editor || editor.isDestroyed || editor.plainText === publishedText.current) return
    publishedText.current = editor.plainText
    onChange(editor.plainText)
  }
  useHttpBodyHighlighting(input, request.body.kind, request.body.text, visible)
  return (
    <textarea
      ref={(editor) => {
        input.current = editor
        register(editor)
      }}
      id={`http-body-editor-${request.id}`}
      visible={visible && ["json", "xml", "text"].includes(request.body.kind)}
      initialValue={request.body.text}
      syntaxStyle={HTTP_BODY_SYNTAX}
      placeholder={'{\n  "name": "Tuiminal"\n}'}
      onMouseDown={() => {
        onFocus()
        input.current?.focus()
      }}
      onContentChange={syncText}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return
        // Native undo/redo can restore text without a content-change notification.
        queueMicrotask(syncText)
        if (event.name !== "tab") return
        event.preventDefault()
        event.stopPropagation()
        if (!event.shift && !event.ctrl && !event.meta && !event.option)
          input.current?.insertText("  ")
      }}
      onSubmit={onSend}
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        focusedBackgroundColor: COLORS.canvas,
        textColor: COLORS.text,
        focusedTextColor: COLORS.text,
        cursorColor: COLORS.http,
        selectionBg: RGBA.fromHex("#5a351d"),
        wrapMode: "word",
      }}
    />
  )
}
