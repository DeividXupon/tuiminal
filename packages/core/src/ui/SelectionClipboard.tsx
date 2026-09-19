import { MouseButton, type MouseEvent } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { type ComponentType, createElement, type ReactNode } from "react"
import { useNotifications } from "../notifications/index"

export function SelectionClipboard({ children }: { children: ReactNode }) {
  const renderer = useRenderer()
  const { notify } = useNotifications()

  function copySelection(event: MouseEvent) {
    if (event.button !== MouseButton.RIGHT || event.defaultPrevented) return
    const selection = renderer.getSelection()
    if (!selection || selection.isDragging) return
    const text = selection.getSelectedText()
    if (!text) return

    event.preventDefault()
    event.stopPropagation()
    let copied = false
    try {
      copied = renderer.copyToClipboardOSC52(text)
    } catch {
      // Keep the selection available for another attempt if the terminal fails.
    }
    if (copied) renderer.clearSelection()
    notify({
      source: "Tuiminal",
      kind: copied ? "success" : "warning",
      message: copied ? "Texto selecionado copiado." : "O terminal não aceitou a cópia OSC52.",
    })
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the application mouse boundary copies native text selection without taking keyboard focus.
    <box onMouseDown={copySelection} style={{ flexGrow: 1 }}>
      {children}
    </box>
  )
}

export function withSelectionClipboard(Component: ComponentType) {
  return function SelectionClipboardApplication() {
    return <SelectionClipboard>{createElement(Component)}</SelectionClipboard>
  }
}
