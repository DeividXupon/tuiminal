import { basename } from "node:path"
import {
  type ConfigurationWarning,
  getYamlConfigurationWarnings,
} from "@xupon/tuiminal-core/config/index"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import { useCallback, useEffect, useRef, useState } from "react"

export function useConfigurationWarnings(initialWarnings?: ConfigurationWarning[]) {
  const { notify } = useNotifications()
  const [warnings] = useState(() => initialWarnings ?? getYamlConfigurationWarnings())
  const [open, setOpen] = useState(warnings.length > 0)
  const close = useCallback(() => setOpen(false), [])
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current) return
    shown.current = true
    if (!warnings.length) return
    // Full paths and diagnostics are available in the scrollable startup dialog.
    notify({
      source: "YAML",
      kind: "warning",
      title: translateUi("Configurações"),
      message: warnings.map(({ file }) => basename(file)).join(", "),
      onPress: () => setOpen(true),
      durationMs: 30_000,
    })
  }, [notify, warnings])
  return { warnings, open, close }
}
