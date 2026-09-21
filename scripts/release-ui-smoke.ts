import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { EmbeddedTerminalRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { forceKillOwnedProcessTree } from "../packages/core/src/process/owned-process"

async function verifyToolUi(
  command: string[],
  project: string,
  env: NodeJS.ProcessEnv,
  tool: string,
  expected: string,
) {
  const capture = await createTestRenderer({ width: 120, height: 35 })
  try {
    let terminal: Bun.Terminal | undefined
    let transcript = ""
    const decoder = new TextDecoder()
    const screen = new EmbeddedTerminalRenderable(capture.renderer, {
      id: "packaged-terminal-screen",
      width: 120,
      height: 35,
      cols: 120,
      rows: 35,
      maxScrollback: 0,
      onData(data, source) {
        if (source === "response") terminal?.write(data)
      },
    })
    capture.renderer.root.add(screen)
    const child = Bun.spawn(command, {
      cwd: project,
      env,
      terminal: {
        cols: 120,
        rows: 35,
        data(_pty, data) {
          transcript = (transcript + decoder.decode(data, { stream: true })).slice(-12_000)
          screen.write(data)
        },
      },
    })
    terminal = child.terminal
    const waitFor = async (predicate: () => boolean, label: string) => {
      const deadline = performance.now() + 8_000
      while (!predicate() && performance.now() < deadline && child.exitCode === null)
        await Bun.sleep(20)
      if (!predicate())
        throw new Error(
          `Packaged ${tool} ${label} failed (exit ${child.exitCode}):\n${screen.screen().text}\nTerminal transcript:\n${Bun.stripANSI(transcript)}`,
        )
    }
    try {
      // ANSI output consists of incremental repaint operations, not whole text
      // lines. Assert the emulated visible screen, including after a plasma fade.
      await waitFor(() => screen.screen().text.includes(expected), "opening")
      if (!terminal) throw new Error(`Packaged ${tool} has no terminal`)
      if (tool === "database" || tool === "http") {
        terminal.write("\x1b")
        await Bun.sleep(150)
      }
      if (tool === "database") {
        // First Escape blurs the connection field; the next closes its dialog.
        terminal.write("\x1b")
        await Bun.sleep(150)
      }
      terminal.write("q")
      await waitFor(() => child.exitCode !== null, "shutdown")
      if ((await child.exited) !== 0) throw new Error(`Packaged ${tool} exited unsuccessfully`)
      console.log(`Packaged ${tool} UI opened and closed through native terminal input`)
    } catch (error) {
      // Report the original screen before Windows fixture cleanup can fail on a
      // locked executable. The Node launcher owns a separate native child.
      console.error(error)
      throw error
    } finally {
      if (child.exitCode === null) forceKillOwnedProcessTree(child.pid, () => child.kill("SIGKILL"))
      await child.exited
      terminal?.close()
    }
  } finally {
    capture.renderer.destroy()
  }
}

// Exercise downloaded UI modules in the installed host. All paths and child
// processes belong to the caller's disposable installation, never a user project.
export async function verifyPackagedUi(
  node: string,
  launcher: string,
  root: string,
  environment: Record<string, string>,
) {
  const project = join(root, "empty UI project Ω")
  const config = join(environment.XDG_CONFIG_HOME!, "tuiminal")
  mkdirSync(project)
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, "settings.json"),
    JSON.stringify({ language: "en", layout: "compact" }),
  )
  const env = {
    ...process.env,
    ...environment,
    HOME: root,
    GH_CONFIG_DIR: join(root, "unused-gh-config"),
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    SHELL: undefined,
    TUIMINAL_TEST_SKIP_STARTUP: "1",
    TUIMINAL_TERMINAL_AUTO_MIRROR: "0",
    TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY: "0",
    TUIMINAL_TERMINAL_RESTORE: "0",
    TUIMINAL_TERMINAL_PINNED_TMUX: "0",
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "0",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  }
  for (const [tool, expected] of [
    ["runner", "No project was found in this folder"],
    ["database", "Save and connect"],
    ["git", "No Git repository found"],
    ["http", "READY TO SEND"],
    ["terminal", "FREE TERMINALS IN 2"],
  ] as const)
    await verifyToolUi([node, launcher, tool, project], project, env, tool, expected)
}
