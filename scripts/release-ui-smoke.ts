import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Exercise the downloaded UI modules in the installed host, with real terminal
// input. Every path and process belongs to the caller's disposable installation.
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
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  }
  for (const [tool, expected] of [
    ["database", "Save and connect"],
    ["git", "No Git repository found"],
    ["runner", "No project was found in this folder"],
    ["http", "READY TO SEND"],
    ["terminal", "FREE TERMINALS IN 2"],
  ]) {
    let output = ""
    const decoder = new TextDecoder()
    const child = Bun.spawn([node, launcher, tool!, project], {
      cwd: project,
      env,
      terminal: {
        cols: 120,
        rows: 35,
        data(_terminal, data) {
          output = (output + decoder.decode(data, { stream: true })).slice(-150_000)
        },
      },
    })
    const waitFor = async (predicate: () => boolean, label: string) => {
      const deadline = performance.now() + 8_000
      while (!predicate() && performance.now() < deadline && child.exitCode === null)
        await Bun.sleep(20)
      if (!predicate())
        throw new Error(`Packaged ${tool} ${label} failed: ${Bun.stripANSI(output).slice(-6_000)}`)
    }
    try {
      await waitFor(() => Bun.stripANSI(output).includes(expected!), "opening")
      if (!child.terminal) throw new Error(`Packaged ${tool} has no terminal`)
      // Database starts in its connection dialog; HTTP focuses its URL field.
      if (tool === "database" || tool === "http") {
        child.terminal.write("\x1b")
        await Bun.sleep(150)
      }
      if (tool === "database") {
        // First Escape blurs the connection field; the next closes its dialog.
        child.terminal.write("\x1b")
        await Bun.sleep(150)
      }
      child.terminal.write("q")
      await waitFor(() => child.exitCode !== null, "shutdown")
      if ((await child.exited) !== 0) throw new Error(`Packaged ${tool} exited unsuccessfully`)
      console.log(`Packaged ${tool} UI opened and closed through native terminal input`)
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
      child.terminal?.close()
    }
  }
}
