import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

test("the generated sidebar command preserves explicit YAML selection over a stale server environment", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "tuiminal-sidebar-config-"))
  try {
    const selected = resolve(root, "selected with spaces", "custom.yml")
    const stale = resolve(root, "stale", "config.yml")
    const xdg = resolve(root, "xdg")
    // Invalid positional arguments stop before any renderer, socket or tmux access.
    const sidebarArgs = ["invalid-socket", "%42", "tmux", "/unused-endpoint"]
    const loader = pathToFileURL(resolve("apps/cli/src/features/loader.ts")).href
    const host = pathToFileURL(resolve("packages/core/src/runtime/feature-host.ts")).href
    const generator = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `const { loadFeature } = await import(${JSON.stringify(loader)});
         const { installedTerminalSidebarCommand } = await import(${JSON.stringify(host)});
         await loadFeature("terminal");
         console.log(JSON.stringify(installedTerminalSidebarCommand(${JSON.stringify(sidebarArgs)})));`,
      ],
      {
        env: { ...process.env, TUIMINAL_SOURCE_FEATURES: "1", TUIMINAL_CONFIG: selected },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [generatedExit, generatedOutput, generatedError] = await Promise.all([
      generator.exited,
      new Response(generator.stdout).text(),
      new Response(generator.stderr).text(),
    ])
    expect(generatedExit).toBe(0)
    expect(generatedError).toBe("")
    const command = JSON.parse(generatedOutput) as string[]
    expect(command.slice(2)).toEqual([
      "--internal-terminal-sidebar",
      ...sidebarArgs,
      "--config",
      selected,
    ])
    const sidebar = Bun.spawn(command, {
      env: {
        ...process.env,
        TUIMINAL_SOURCE_FEATURES: "1",
        TUIMINAL_CONFIG: stale,
        XDG_CONFIG_HOME: xdg,
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exit, stdout, stderr] = await Promise.all([
      sidebar.exited,
      new Response(sidebar.stdout).text(),
      new Response(sidebar.stderr).text(),
    ])
    expect(exit).toBe(2)
    expect(stdout).toBe("")
    expect(stderr).toBe("")
    expect(readFileSync(selected, "utf8")).toContain("shortcuts:")
    expect(readFileSync(resolve(root, "selected with spaces", "terminal.yml"), "utf8")).toContain(
      "sidebar:",
    )
    expect(existsSync(resolve(root, "stale"))).toBe(false)
    expect(existsSync(xdg)).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
