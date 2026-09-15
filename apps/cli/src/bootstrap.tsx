import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { initializeUiSettings } from "@xupon/tuiminal-core/settings/theme"

initializeUiSettings()
// Feature syntax styles must be created only after the user's palette is loaded.
const { App } = await import("./App")

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
  enableMouseMovement: true,
  useKittyKeyboard: { allKeysAsEscapes: true },
})

createRoot(renderer).render(<App />)
