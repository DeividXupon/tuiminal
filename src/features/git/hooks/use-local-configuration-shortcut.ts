import { useKeyboard, useRenderer } from "@opentui/react"
import { focusedRenderableId, ownsKeyboardFocus } from "../../../core/keyboard/scope"
import { gitKeyboardScope } from "../keyboard"

export function useLocalConfigurationShortcut(active: boolean, onOpen?: (() => void) | undefined) {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (
      !active ||
      !onOpen ||
      key.defaultPrevented ||
      !key.ctrl ||
      key.name !== "p" ||
      key.shift ||
      key.meta ||
      key.option ||
      key.super ||
      key.repeated ||
      key.eventType !== "press"
    )
      return
    const focusedId = focusedRenderableId(renderer.currentFocusedRenderable)
    if (
      ownsKeyboardFocus(gitKeyboardScope, focusedId) ||
      focusedId?.startsWith("git-partial-stage-")
    )
      return
    key.preventDefault()
    key.stopPropagation()
    onOpen()
  })
}
