import { withShortcutContext } from "@xupon/tuiminal-core/keyboard/react"
import { useTerminalDimensions } from "@opentui/react"
import { useConfiguredKeyboard as useKeyboard } from "@xupon/tuiminal-core/keyboard/react"
import type { HttpCollectionSettings } from "../hooks/use-http-collection-settings"
import { HttpDiscardDocumentModal } from "./HttpDiscardDocumentModal"

function HttpCollectionSettingsConfirmationView({
  settings,
}: {
  settings: HttpCollectionSettings
}) {
  const terminal = useTerminalDimensions()
  useKeyboard((key) => {
    if (key.defaultPrevented || !settings.pending || !["escape", "d"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") settings.cancel()
    else settings.confirm()
  })
  return (
    <HttpDiscardDocumentModal
      requestName={settings.pending?.target.name ?? ""}
      terminalWidth={terminal.width}
      terminalHeight={terminal.height}
      onClose={settings.cancel}
      onConfirm={settings.confirm}
    />
  )
}

export const HttpCollectionSettingsConfirmation = withShortcutContext(
  "http",
  "collection-settings-confirmation",
  HttpCollectionSettingsConfirmationView,
  "http-discard-document-modal",
)
