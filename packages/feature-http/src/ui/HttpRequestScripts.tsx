import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { TextareaRenderable } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { nestedHttpViewCycleDirection } from "../model/nested-view-navigation"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { HttpRequestDefinition } from "../model/types"
import { HTTP_BODY_SYNTAX } from "./http-body-highlights"
import { useHttpBodyHighlighting } from "./use-http-body-highlighting"

type Scripts = NonNullable<HttpRequestDefinition["scripts"]>
export function HttpRequestScripts({
  request,
  visible,
  active,
  onFocus,
  onChange,
}: {
  request: HttpRequestDefinition
  visible: boolean
  active: boolean
  onFocus: () => void
  onChange: (value: Scripts) => void
}) {
  const renderer = useRenderer()
  const [selected, setSelected] = useState<keyof Scripts>("preRequest")
  const latest = useRef(request.scripts ?? { preRequest: "", postResponse: "" })
  latest.current = request.scripts ?? { preRequest: "", postResponse: "" }
  const editors = useRef<Partial<Record<keyof Scripts, TextareaRenderable>>>({})
  useEffect(() => {
    if (!visible || !active) return
    const container = renderer.root.findDescendantById(`http-scripts-${request.id}`)
    // Tab/pane navigation can leave native focus on the previous control or unset.
    // Keep a directly clicked editor focused when entering from another pane.
    if (!Object.values(editors.current).some((editor) => editor.focused)) container?.focus()
    return () => container?.blur()
  }, [visible, active, renderer, request.id])
  const select = (phase: keyof Scripts) => {
    onFocus()
    setSelected(phase)
    renderer.root.findDescendantById(`http-scripts-${request.id}`)?.focus()
  }
  const cycle = () => select(selected === "preRequest" ? "postResponse" : "preRequest")
  useWorkspaceRepaint(`${request.id}-scripts-${selected}`, visible)
  useKeyboard((key) => {
    if (!visible || !active || key.defaultPrevented) return
    const id = renderer.currentFocusedRenderable?.id ?? ""
    if (key.name === "escape" && id.startsWith("http-script-editor-")) {
      renderer.currentFocusedRenderable?.blur()
      renderer.root.findDescendantById(`http-scripts-${request.id}`)?.focus()
    } else if (id.startsWith("http-script-editor-") || key.ctrl || key.meta || key.option) return
    else if (
      !/^http-(scripts-|request-pane-|request-view-scripts$|script-(tab-|previous$|next$))/.test(id)
    )
      return
    else if (nestedHttpViewCycleDirection(key)) cycle()
    else if (["enter", "return"].includes(key.name)) editors.current[selected]?.focus()
    else return
    key.preventDefault()
    key.stopPropagation()
  })
  return (
    <box
      id={`http-scripts-${request.id}`}
      focusable
      visible={visible}
      position="absolute"
      left={0}
      right={0}
      top={0}
      bottom={0}
    >
      <box
        flexDirection="row"
        flexWrap="wrap"
        minHeight={1}
        flexShrink={0}
        backgroundColor={COLORS.panelAlt}
      >
        {active ? (
          <DirectionalButton
            id="http-script-previous"
            level="nested"
            direction={-1}
            accent={COLORS.http}
            onPress={cycle}
          />
        ) : null}
        {(["preRequest", "postResponse"] as const).map((phase) => (
          <InlineButton
            key={phase}
            id={`http-script-tab-${phase}`}
            label={phase === "preRequest" ? "Pre-request" : "Post-response"}
            active={selected === phase}
            accent={COLORS.http}
            onPress={() => select(phase)}
          />
        ))}
        {active ? (
          <DirectionalButton
            id="http-script-next"
            level="nested"
            direction={1}
            accent={COLORS.http}
            onPress={cycle}
          />
        ) : null}
      </box>
      {(["preRequest", "postResponse"] as const).map((phase) => (
        <ScriptEditor
          key={phase}
          id={`http-script-editor-${phase}-${request.id}`}
          value={latest.current[phase]}
          visible={visible && selected === phase}
          register={(editor) => {
            if (editor) editors.current[phase] = editor
            else delete editors.current[phase]
          }}
          onFocus={() => {
            setSelected(phase)
            onFocus()
          }}
          onChange={(value) => {
            latest.current = {
              preRequest: editors.current.preRequest?.plainText ?? latest.current.preRequest,
              postResponse: editors.current.postResponse?.plainText ?? latest.current.postResponse,
              [phase]: value,
            }
            onChange(latest.current)
          }}
        />
      ))}
      <ShortcutText content="[Enter] Editar · [Esc] Sair" fg={COLORS.muted} flexShrink={0} />
    </box>
  )
}
function ScriptEditor({
  id,
  value,
  visible,
  register,
  onFocus,
  onChange,
}: {
  id: string
  value: string
  visible: boolean
  register: (editor: TextareaRenderable | null) => void
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const input = useRef<TextareaRenderable | null>(null)
  const [editorHeight, setEditorHeight] = useState(1)
  const published = useRef(value)
  const initialValue = useRef(value)
  const accepted = useRef(value)
  useEffect(() => {
    const previous = accepted.current
    accepted.current = value
    const editor = input.current
    // A committed prop can lag behind native keystrokes. Only replace text when
    // the buffer still matches the previously accepted value (an external update).
    if (editor && !editor.isDestroyed && editor.plainText === previous && previous !== value) {
      published.current = value
      editor.setText(value)
    }
  }, [value])
  useHttpBodyHighlighting(input, "javascript", value, visible)
  const sync = () => {
    const editor = input.current
    if (editor && !editor.isDestroyed && editor.plainText !== published.current) {
      published.current = editor.plainText
      onChange(editor.plainText)
    }
  }
  return (
    <box
      visible={visible}
      flexGrow={1}
      flexBasis={0}
      minHeight={3}
      overflow="hidden"
      onSizeChange={function () {
        setEditorHeight(Math.max(1, this.height))
      }}
    >
      <textarea
        id={id}
        height={editorHeight}
        ref={(editor) => {
          input.current = editor
          register(editor)
        }}
        initialValue={initialValue.current}
        syntaxStyle={HTTP_BODY_SYNTAX}
        onContentChange={sync}
        onMouseDown={() => {
          onFocus()
          input.current?.focus()
        }}
        onKeyDown={(key) => {
          queueMicrotask(sync)
          if (key.name === "tab" && !key.ctrl && !key.meta && !key.option) {
            key.preventDefault()
            key.stopPropagation()
            input.current?.insertText("  ")
          }
        }}
        style={{
          flexGrow: 0,
          flexShrink: 0,
          minHeight: 0,
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.canvas,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.http,
          wrapMode: "word",
        }}
      />
    </box>
  )
}
