import { expect, test } from "bun:test"
import { resolve } from "node:path"

const script = resolve(import.meta.dir, "../scripts/benchmark.ts")

test("benchmark CLI runs a selected suite and emits raw latency samples", () => {
  const result = Bun.spawnSync(
    [process.execPath, script, "--suite", "database", "--samples", "1", "--warmup", "0", "--json"],
    { cwd: resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
  )
  expect(result.exitCode).toBe(0)
  const report = JSON.parse(new TextDecoder().decode(result.stdout)) as {
    runtime: { bun: string }
    results: Array<{ tool: string; samplesMs: number[] }>
  }
  expect(report.runtime.bun).toBe("1.4.2")
  expect(report.results.length).toBeGreaterThan(0)
  expect(
    report.results.every((item) => item.tool === "database" && item.samplesMs.length === 1),
  ).toBe(true)
})

test("benchmark CLI rejects unknown suites", () => {
  const result = Bun.spawnSync([process.execPath, script, "--suite", "unknown"], {
    cwd: resolve(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).not.toBe(0)
  expect(new TextDecoder().decode(result.stderr)).toContain("Invalid suite")
})

test("external database flag requires the database suite", () => {
  const result = Bun.spawnSync(
    [process.execPath, script, "--suite", "git", "--external-database"],
    { cwd: resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
  )
  expect(result.exitCode).not.toBe(0)
  expect(new TextDecoder().decode(result.stderr)).toContain(
    "--external-database requires the database suite",
  )
})
