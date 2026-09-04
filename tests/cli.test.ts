import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

async function runCli(argument: string) {
  const configRoot = mkdtempSync(resolve(tmpdir(), "tuiminal-cli-test-"))
  try {
    const subprocess = Bun.spawn([process.execPath, resolve("bin/tuiminal.ts"), argument], {
      cwd: resolve("."),
      env: { ...process.env, XDG_CONFIG_HOME: configRoot },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  } finally {
    rmSync(configRoot, { recursive: true, force: true })
  }
}

describe("Tuiminal CLI", () => {
  test("prints its version without mounting the TUI", async () => {
    const result = await runCli("--version")

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("0.2.0")
    expect(result.stderr).toBe("")
  })

  test("documents the available isolated tools", async () => {
    const result = await runCli("--help")

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("banco, git, runner, http, terminal")
    expect(result.stdout).not.toMatch(/pomo/i)
    expect(result.stdout).toContain("tuiminal <ferramenta> [diretório]")
  })
})
