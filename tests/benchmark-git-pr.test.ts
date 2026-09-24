import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const projectRoot = resolve(import.meta.dir, "..")
const script = join(projectRoot, "scripts", "benchmark-git-pr.ts")

test("large PR benchmark emits verified standard results", () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-git-pr-test-"))
  const output = join(root, "git-pr.json")
  try {
    const child = Bun.spawnSync([process.execPath, script], {
      cwd: projectRoot,
      env: {
        ...process.env,
        BENCHMARK_SAMPLES: "1",
        BENCHMARK_WARMUP: "0",
        BENCHMARK_OUTPUT: output,
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode).toBe(0)
    expect(existsSync(output)).toBe(true)
    const report = JSON.parse(readFileSync(output, "utf8")) as {
      runtime: { bun: string }
      configuration: { samples: number; warmup: number }
      results: Array<{ id: string; tool: string; operationsPerSample: number; samplesMs: number[] }>
    }
    expect(report.runtime.bun).toBe(Bun.version)
    expect(report.configuration).toEqual({ samples: 1, warmup: 0 })
    expect(report.results.map((result) => result.id)).toEqual([
      "git.pr_large_selection",
      "git.pr_large_merge",
      "git.pr_large_markdown",
      "git.pr_large_diff",
    ])
    expect(report.results[0]?.operationsPerSample).toBe(100_000)
    expect(
      report.results.every((result) => result.tool === "git" && result.samplesMs.length === 1),
    ).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
