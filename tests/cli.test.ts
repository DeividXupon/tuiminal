import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import packageMetadata from "../package.json" with { type: "json" }

async function runCli(...args: string[]) {
  return runCliWith({ args })
}

async function runCliWith({
  args,
  forbidUiImports = false,
  language,
}: {
  args: readonly string[]
  forbidUiImports?: boolean
  language?: string
}) {
  const configRoot = mkdtempSync(resolve(tmpdir(), "tuiminal-cli-test-"))
  try {
    if (language) {
      mkdirSync(resolve(configRoot, "tuiminal"))
      writeFileSync(resolve(configRoot, "tuiminal/settings.json"), JSON.stringify({ language }))
    }
    const command = [
      process.execPath,
      ...(forbidUiImports
        ? ["--preload", resolve("tests/fixtures/cli-version-import-guard.ts")]
        : []),
      resolve("bin/tuiminal.ts"),
      ...args,
    ]
    const subprocess = Bun.spawn(command, {
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
    expect(result.stdout.trim()).toBe(packageMetadata.version)
    expect(result.stderr).toBe("")
  })

  test.each(["--version", "-v"])(
    "%s does not load UI configuration or translation modules",
    async (flag) => {
      const result = await runCliWith({ args: [flag], forbidUiImports: true })
      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe(packageMetadata.version)
      expect(result.stderr).toBe("")
    },
  )

  test.each([{ args: ["--version", "--help"] }, { args: ["-h", "-v"] }])(
    "help retains precedence over version and uses the configured language: %j",
    async ({ args }) => {
      const result = await runCliWith({ args, language: "en" })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`Tuiminal ${packageMetadata.version}`)
      expect(result.stdout).toContain("tuiminal <tool> [directory]")
      expect(result.stderr).toBe("")
    },
  )

  test("documents the available isolated tools", async () => {
    const result = await runCli("--help")

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("banco, git, runner, http, terminal")
    expect(result.stdout).not.toMatch(/pomo/i)
    expect(result.stdout).toContain("tuiminal <ferramenta> [diretório]")
  })

  test.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "does not treat the inherited object property %s as an isolated tool",
    async (name) => {
      const result = await runCli(name, "missing-cli-fixture-directory")
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Informe uma ferramenta e, opcionalmente, um diretório.")
      expect(result.stderr).not.toContain("Não foi possível abrir")
      expect(result.stdout).toContain("tuiminal <ferramenta> [diretório]")
    },
  )
})
