import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** Executable fixtures isolate both discovery and capture from the user's tmux. */
export function prepareTerminalMirrorDemo(root: string) {
  const bin = join(root, "mirror-fixture-bin")
  mkdirSync(bin)
  const pane = [
    join(root, "fixture.sock"),
    "$0",
    "workspace",
    "@1",
    "1",
    "agent",
    "%1",
    "0",
    "node",
    "2000000001",
    "/demo/api",
  ].join("\t")
  const screen = [
    "Codex · existing session (simulated)",
    "",
    "Review the API and its tests.",
    "",
    "The agent was already running before Tuiminal opened.",
    "",
    "• Reading src/server.ts (2s • esc to interrupt)",
    "› ",
    "? for shortcuts",
  ].join("\n")
  const stateFile = join(bin, "window.json")
  writeFileSync(
    stateFile,
    JSON.stringify({ width: 110, height: 28, layout: "0000,110x28,0,0,1", mode: null }),
  )
  writeFileSync(
    join(bin, "tmux"),
    `#!/usr/bin/env bun
import { readFileSync, writeFileSync, renameSync } from "node:fs"
const args = process.argv.slice(2)
const stateFile = ${JSON.stringify(stateFile)}
const state = JSON.parse(readFileSync(stateFile, "utf8"))
if (args.includes("-V")) console.log("tmux 3.2")
else if (args.includes("show-options")) console.log([
  ["@1", state.width, state.height, state.layout, state.layout, 0].join("\\t"),
  ...(state.mode ? ["window-size " + state.mode] : []),
  "pane\\t%1\\t" + state.height + "\\t1",
].join("\\n"))
else if (args.includes("list-panes")) console.log(${JSON.stringify(pane)})
else if (args.includes("capture-pane")) console.log(
  [2000000001, 0, "", state.width, state.height, 2, 7, 1, 0, 0, "⠋ Review terminal layout"].join("\\t") + "\\n" + ${JSON.stringify(screen)}
)
else if (args.includes("resize-window")) {
  state.width = Number(args[args.indexOf("-x") + 1])
  state.height = Number(args[args.indexOf("-y") + 1])
  state.mode = "manual"
  if (args.includes("select-layout")) state.layout = args[args.indexOf("select-layout") + 3]
  if (args.includes("set-option")) state.mode = args.includes("-wu") ? null : args.at(-1)
  writeFileSync(stateFile + ".next", JSON.stringify(state))
  renameSync(stateFile + ".next", stateFile)
}
else process.exit(1)
`,
    { mode: 0o755 },
  )
  const processes = [
    "2000000001 1 Ss zsh zsh",
    "2000000002 2000000001 Sl+ node node /demo/codex.js",
  ].join("\n")
  writeFileSync(
    join(bin, "ps"),
    `#!/usr/bin/env bun\nconsole.log(${JSON.stringify(processes)})\n`,
    { mode: 0o755 },
  )
  const previous = {
    PATH: process.env.PATH,
    TMUX: process.env.TMUX,
    TMUX_PANE: process.env.TMUX_PANE,
    TUIMINAL_TERMINAL_AUTO_MIRROR: process.env.TUIMINAL_TERMINAL_AUTO_MIRROR,
    TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY: process.env.TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY,
    TUIMINAL_TERMINAL_RESTORE: process.env.TUIMINAL_TERMINAL_RESTORE,
  }
  process.env.PATH = `${bin}:${previous.PATH ?? ""}`
  process.env.TMUX = ""
  process.env.TMUX_PANE = ""
  process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = "1"
  process.env.TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY = "0"
  process.env.TUIMINAL_TERMINAL_RESTORE = "0"
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
