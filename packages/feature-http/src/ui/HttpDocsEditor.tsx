import { RGBA, type TextareaRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"

export function HttpDocsEditor({
  requestId,
  value,
  active,
  onChange,
  onPreview,
  onFocus,
}: {
  requestId: string
  value: string
  active: boolean
  onChange: (value: string) => void
  onPreview: () => void
  onFocus: () => void
}) {
  const input = useRef<TextareaRenderable | null>(null)
  const published = useRef(value)
  published.current = value
  const syncText = () => {
    const editor = input.current
    if (!editor || editor.isDestroyed || editor.plainText === published.current) return
    published.current = editor.plainText
    onChange(editor.plainText)
  }
  useEffect(() => {
    const editor = input.current
    if (editor && editor.plainText !== value) editor.setText(value)
  }, [value])
  useEffect(() => {
    if (!active) return
    const editor = input.current
    editor?.focus()
    return () => editor?.blur()
  }, [active])
  return (
    <textarea
      ref={input}
      id={`http-docs-editor-${requestId}`}
      initialValue={value}
      placeholder={translateUi("Escreva a documentação em Markdown…")}
      onMouseDown={() => {
        onFocus()
        input.current?.focus()
      }}
      onContentChange={syncText}
      onKeyDown={(key) => {
        queueMicrotask(syncText)
        if (key.name === "escape") {
          key.preventDefault()
          key.stopPropagation()
          onPreview()
        } else if (key.name === "tab") {
          key.preventDefault()
          key.stopPropagation()
          if (!key.shift && !key.ctrl && !key.meta && !key.option) input.current?.insertText("  ")
        }
      }}
      style={{
        flexGrow: 1,
        minHeight: 0,
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
