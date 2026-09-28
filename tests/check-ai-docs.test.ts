import { afterEach, describe, expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-ai-docs-"))
  roots.push(root)
  mkdirSync(join(root, "scripts"))
  mkdirSync(join(root, "docs/ai"), { recursive: true })
  copyFileSync(
    resolve(import.meta.dir, "../scripts/check-ai-docs.ts"),
    join(root, "scripts/check-ai-docs.ts"),
  )
  writeFileSync(join(root, "AGENTS.md"), "# Guide\n\n[Map](docs/ai/index.md)\n")
  for (const name of [
    "index",
    "conventions",
    "feature-installation",
    "git",
    "runner",
    "http",
    "terminal",
    "database",
    "validation",
  ])
    writeFileSync(join(root, `docs/ai/${name}.md`), `# ${name}\n`)
  return root
}

function check(root: string) {
  const result = Bun.spawnSync([process.execPath, join(root, "scripts/check-ai-docs.ts")], {
    cwd: root,
  })
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

describe("agent guidance gate", () => {
  test("checks newly added and nested notes without a manual allowlist update", () => {
    const root = fixture()
    mkdirSync(join(root, "docs/ai/nested"))
    writeFileSync(join(root, "docs/ai/terminal-remote.md"), "# Remote\n\n[Terminal](terminal.md)\n")
    writeFileSync(join(root, "docs/ai/nested/extra.md"), "# Extra\n\n[Map](../index.md)\n")
    expect(check(root).code).toBe(0)
    writeFileSync(join(root, "docs/ai/nested/extra.md"), "[Missing](missing.md)\n")
    const result = check(root)
    expect(result.code).toBe(1)
    expect(result.output).toContain("broken local link missing.md")
  })

  test("requires the entry points", () => {
    const root = fixture()
    rmSync(join(root, "docs/ai/index.md"))
    expect(check(root).output).toContain("Missing agent guide:")
    expect(check(root).code).toBe(1)
  })

  test.each(["AGENTS.md", "docs/ai/index.md", "docs/ai/terminal-remote.md"])(
    "bounds %s",
    (file) => {
      const root = fixture()
      writeFileSync(join(root, file), "x".repeat(file.endsWith("terminal-remote.md") ? 8193 : 3073))
      const result = check(root)
      expect(result.code).toBe(1)
      expect(result.output).toContain("exceeds")
    },
  )

  test("splitting notes cannot evade the total budget", () => {
    const root = fixture()
    for (let index = 0; index < 7; index++)
      writeFileSync(join(root, `docs/ai/extra-${index}.md`), "x".repeat(7500))
    const result = check(root)
    expect(result.code).toBe(1)
    expect(result.output).toContain("exceeds 48 KiB total")
    expect(result.output).not.toContain("exceeds 8 KiB;")
  })
})
