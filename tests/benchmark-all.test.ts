import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const projectRoot = resolve(import.meta.dir, "..")
const script = join(projectRoot, "scripts", "benchmark-all.ts")

test("aggregate benchmark preserves every raw Git UI sample and suite membership", () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-all-test-"))
  const output = join(root, "all.json")
  try {
    const child = Bun.spawnSync(
      [
        process.execPath,
        script,
        "--suite",
        "git-ui,git-remote-ui,git-inbox-ui,git-pr",
        "--samples",
        "1",
        "--warmup",
        "0",
        "--output",
        output,
      ],
      { cwd: projectRoot, stdout: "pipe", stderr: "pipe" },
    )
    expect(child.exitCode).toBe(0)
    expect(existsSync(output)).toBe(true)
    const report = JSON.parse(readFileSync(output, "utf8")) as {
      runtime: { bun: string }
      suites: Array<{ id: string; caseIds: string[] }>
      results: Array<{ id: string; tool: string; samplesMs: number[] }>
    }
    expect(report.runtime.bun).toBe("1.4.2")
    expect(report.suites.map((suite) => suite.id)).toEqual([
      "git-ui",
      "git-remote-ui",
      "git-inbox-ui",
      "git-pr",
    ])
    expect(report.results.length).toBe(25)
    expect(report.suites.map((suite) => suite.caseIds.length)).toEqual([10, 8, 3, 4])
    expect(report.suites.flatMap((suite) => suite.caseIds)).toEqual(
      report.results.map((result) => result.id),
    )
    expect(
      report.results.every((result) => result.tool === "git" && result.samplesMs.length === 1),
    ).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

test("aggregate benchmark runs the opt-in Terminal stress suite at a reduced scale", () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-all-terminal-stress-"))
  const output = join(root, "all.json")
  try {
    const child = Bun.spawnSync(
      [
        process.execPath,
        script,
        "--suite",
        "terminal-stress",
        "--samples",
        "1",
        "--warmup",
        "0",
        "--output",
        output,
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, TUIMINAL_TERMINAL_STRESS_SCALE: "0.001" },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    expect(new TextDecoder().decode(child.stderr)).toBe("")
    expect(child.exitCode).toBe(0)
    const report = JSON.parse(readFileSync(output, "utf8")) as {
      suites: Array<{ id: string; samples: number; warmup: number; caseIds: string[] }>
      results: Array<{ id: string; tool: string; samplesMs: number[] }>
    }
    expect(report.suites).toEqual([
      {
        id: "terminal-stress",
        samples: 1,
        warmup: 0,
        caseIds: [
          "terminal.stress_output_plain",
          "terminal.stress_output_ansi",
          "terminal.stress_output_screen",
          "terminal.stress_output_observed",
          "terminal.stress_output_resize",
          "terminal.stress_sidebar_unchanged",
        ],
      },
    ])
    expect(report.results).toHaveLength(6)
    expect(
      report.results.every((result) => result.tool === "terminal" && result.samplesMs.length === 1),
    ).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

test("aggregate benchmark rejects an unknown suite before writing a report", () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-all-invalid-"))
  const output = join(root, "all.json")
  try {
    const child = Bun.spawnSync(
      [process.execPath, script, "--suite", "unknown", "--output", output],
      { cwd: projectRoot, stdout: "pipe", stderr: "pipe" },
    )
    expect(child.exitCode).not.toBe(0)
    expect(new TextDecoder().decode(child.stderr)).toContain("Invalid suite")
    expect(existsSync(output)).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
