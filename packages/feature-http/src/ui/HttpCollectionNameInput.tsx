import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import { useRenderer } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

export type HttpCollectionNameEdit = {
  name: string
  busy: boolean
  onChange: (name: string) => void
  onApply: (name: string) => void
  onCancel: () => void
}

export function HttpCollectionNameInput({
  name,
  busy,
  onChange,
  onApply,
  onCancel,
}: HttpCollectionNameEdit) {
  const ref = useRef<InputRenderable | null>(null)
  const renderer = useRenderer()
  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.focus()
      ref.current?.selectAll()
    }, 20)
    return () => {
      clearTimeout(timer)
      const focused = renderer.currentFocusedRenderable
      if (
        !focused ||
        focused === ref.current ||
        focused.isDestroyed ||
        focused.id.startsWith("http-collection-action-")
      )
        renderer.root.findDescendantById("http-navigation-collection")?.focus()
    }
  }, [renderer])
  return (
    <box height={1} width={0} flexGrow={1} flexShrink={1} flexDirection="row">
      <input
        id="http-collection-name-input"
        ref={ref}
        value={name}
        placeholder={translateUi("Nome")}
        onInput={(value) => {
          if (!busy) onChange(value)
        }}
        onPaste={(event) => {
          if (!busy) return
          event.preventDefault()
          event.stopPropagation()
        }}
        onMouseDown={() => ref.current?.focus()}
        onKeyDown={(event) => {
          if (event.name === "return" || event.name === "enter") {
            event.preventDefault()
            event.stopPropagation()
            const current = ref.current?.value ?? name
            if (!busy && current.trim()) onApply(current)
          } else if (event.name === "escape") {
            event.preventDefault()
            event.stopPropagation()
            if (!busy) onCancel()
          } else if (event.name === "tab" || busy) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        style={{
          width: 0,
          flexGrow: 1,
          flexShrink: 1,
          textColor: COLORS.text,
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      {busy ? <HttpCollectionSavingIndicator /> : null}
    </box>
  )
}

const SAVING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function HttpCollectionSavingIndicator() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => (current + 1) % SAVING_FRAMES.length), 80)
    return () => clearInterval(timer)
  }, [])
  return (
    <text
      id="http-collection-name-loading"
      content={` ${SAVING_FRAMES[frame]}`}
      fg={COLORS.http}
      width={2}
      height={1}
      flexShrink={0}
      selectable={false}
    />
  )
}
