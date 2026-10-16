import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("standalone executable highlights offline from another project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-syntax-bundle-"))
  try {
    const executable = join(root, process.platform === "win32" ? "syntax.exe" : "syntax")
    const project = join(root, "empty-project")
    await mkdir(project)
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, "fixtures/syntax-bundle.ts")],
      compile: { outfile: executable, autoloadDotenv: false, autoloadBunfig: false },
    })
    expect(build.success).toBe(true)
    const child = Bun.spawn([executable, join(root, "cache")], {
      cwd: project,
      env: {
        ...process.env,
        XDG_DATA_HOME: join(root, "data"),
        XDG_CONFIG_HOME: join(root, "config"),
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const timer = setTimeout(() => child.kill(), 15_000)
    try {
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
      expect(stdout).toContain("Embedded syntax assets work from an empty project")
    } finally {
      clearTimeout(timer)
      if (child.exitCode === null) child.kill()
      await child.exited
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
