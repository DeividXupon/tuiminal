import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { directionalShortcutDirection } from "@xupon/tuiminal-core/ui/directional-shortcut"
import { httpAuthForKind, HTTP_AUTH_KINDS } from "../model/nested-view-navigation"
import type { HttpCollectionSettingsDocument } from "../model/collection-settings"
import type { HttpCollectionSettings } from "./use-http-collection-settings"
import { focusHttpRequestForm } from "../ui/HttpRequestForm"

export function useHttpCollectionSettingsKeyboard({
  active,
  document,
  settings,
  focus,
  cycle,
  onBack,
}: {
  active: boolean
  document: HttpCollectionSettingsDocument
  settings: HttpCollectionSettings
  focus: () => void
  cycle: (direction: number) => void
  onBack: () => void
}) {
  const renderer = useRenderer()
  const leave = () => {
    const control = renderer.currentFocusedRenderable
    if (control instanceof InputRenderable || control instanceof TextareaRenderable) focus()
    else {
      control?.blur()
      onBack()
    }
  }
  const cycleAuth = (nested: number) => {
    const kinds = document.target.folderId
      ? (["inherit", ...HTTP_AUTH_KINDS] as const)
      : HTTP_AUTH_KINDS
    const index = kinds.findIndex((kind) => kind === document.auth.kind)
    const kind = kinds[(index + nested + kinds.length) % kinds.length]!
    settings.edit(document.id, { auth: kind === "inherit" ? { kind } : httpAuthForKind(kind) })
  }
  const editForm = () => {
    if (document.tab === "authorization") focusHttpRequestForm(renderer.root, `auth-${document.id}`)
    else if (document.tab === "variables")
      focusHttpRequestForm(renderer.root, `collection-variables-${document.id}`)
    else return false
    return true
  }
  useKeyboard((key) => {
    if (!active || key.defaultPrevented) return
    if (key.name === "escape") {
      leave()
      key.preventDefault()
      key.stopPropagation()
      return
    }
    const control = renderer.currentFocusedRenderable
    if (control instanceof InputRenderable || control instanceof TextareaRenderable) return
    const primary = directionalShortcutDirection(key)
    const nested = directionalShortcutDirection(key, "nested")
    if (primary) cycle(primary)
    else if (nested && document.tab === "authorization") {
      cycleAuth(nested)
    } else if (["return", "enter", "tab"].includes(key.name) && !key.ctrl) {
      if (!editForm()) return
    } else return
    key.preventDefault()
    key.stopPropagation()
  })
}
