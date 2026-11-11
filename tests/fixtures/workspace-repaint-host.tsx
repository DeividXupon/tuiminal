import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { prepareFeatureHost } from "../../apps/cli/src/features/host-modules"
import { importVerifiedFeature } from "../../apps/cli/src/features/loader"
import { initializeUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { WorkspaceRepaintBoundary } from "../../packages/core/src/ui/workspace-repaint"
import type { GitViewer as SourceGitViewer } from "../../packages/feature-git/src/GitFeatureWorkspace"

// Exercise the production payload binding and real stdout backend, including the
// native output thread. All state and projects come from the parent's test root.
const [payload, version, mode] = process.argv.slice(2)
if (!payload || !version || !["default", "single-thread"].includes(mode ?? ""))
  throw new Error("Invalid fixture arguments")
initializeUiSettings()
updateUiSettings({ language: "en", layout: "compact" })
process.env.TUIMINAL_GIT_PR_DEMO = "1"
process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
process.env.TUIMINAL_GIT_INBOX_DEMO = "1"
prepareFeatureHost(version, () => {
  throw new Error("This fixture must not start a database")
})
const { GitViewer } = (await importVerifiedFeature(await Bun.file(payload).bytes())) as {
  GitViewer: typeof SourceGitViewer
}
const renderer = await createCliRenderer({
  ...(mode === "single-thread" ? { useThread: false } : {}),
  exitOnCtrlC: false,
  exitSignals: [],
  consoleMode: "disabled",
})
const ended = Promise.withResolvers<void>()
const stop = () => ended.resolve()
process.on("SIGTERM", stop)
function Harness() {
  useKeyboard((key) => {
    if (key.ctrl && key.name === "x") stop()
  })
  return (
    <box flexGrow={1} backgroundColor="#123456">
      <text content="HEADER café 中 🧪" fg="#ddee44" height={1} flexShrink={0} />
      <WorkspaceRepaintBoundary transitionKey="native-payload">
        <GitViewer active />
      </WorkspaceRepaintBoundary>
    </box>
  )
}
const root = createRoot(renderer)
try {
  root.render(<Harness />)
  await ended.promise
} finally {
  root.unmount()
  renderer.destroy()
  process.off("SIGTERM", stop)
}
