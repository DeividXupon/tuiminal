import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { initializeUiSettings } from "@xupon/tuiminal-core/settings/theme"

initializeUiSettings()
// Feature syntax styles must be created only after the user's palette is loaded.
const { App } = await import("./App")

const renderer = await createCliRenderer({
  // Avoid the separate native output thread on macOS; Linux already disables it.
  // Compare both paths with tests/terminal-render-output.test.ts.
  ...(process.platform === "darwin" ? { useThread: false } : {}),
  exitOnCtrlC: false,
  useMouse: true,
  enableMouseMovement: true,
  useKittyKeyboard: { allKeysAsEscapes: true },
})

createRoot(renderer).render(<App />)
