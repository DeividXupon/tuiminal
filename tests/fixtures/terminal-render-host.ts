import { fileURLToPath } from "node:url"
import { createCliRenderer, EmbeddedTerminalRenderable } from "@opentui/core"
import { startTermAgentsProcess } from "../../packages/feature-terminal/src/services/terminal"

// This child writes through the real stdout backend, including its native write
// thread on macOS. An in-memory test renderer cannot exercise that handoff.
const mode = process.argv[2]
if (mode !== "default" && mode !== "single-thread") throw new Error("Invalid render mode")
const renderer = await createCliRenderer({
  ...(mode === "single-thread" ? { useThread: false } : {}),
  exitOnCtrlC: false,
  exitSignals: [],
  consoleMode: "disabled",
  useMouse: true,
  enableMouseMovement: true,
  useKittyKeyboard: { allKeysAsEscapes: true },
})
let child: ReturnType<typeof startTermAgentsProcess> | undefined
const ended = Promise.withResolvers<number>()
const terminal = new EmbeddedTerminalRenderable(renderer, {
  id: "synthetic-terminal",
  width: "100%",
  height: "100%",
  onData: (data) => child?.write(data),
  onTerminalResize: (columns, rows) => child?.resize(columns, rows),
})
const stop = () => ended.resolve(0)
process.on("SIGTERM", stop)
try {
  renderer.root.add(terminal)
  terminal.focus()
  child = startTermAgentsProcess(
    [process.execPath, fileURLToPath(new URL("./terminal-render-echo.ts", import.meta.url))],
    {
      cwd: process.cwd(),
      columns: renderer.width,
      rows: renderer.height,
      onData: (data) => terminal.write(data),
      onExit: (result) => ended.resolve(result.code ?? 1),
    },
  )
  process.exitCode = await ended.promise
} finally {
  await child?.stop()
  renderer.destroy()
  process.off("SIGTERM", stop)
}
