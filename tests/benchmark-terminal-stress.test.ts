import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { measureBenchmark } from "../scripts/benchmarks/harness"
import {
  type TerminalStressOptions,
  terminalStressBenchmarks,
} from "../scripts/benchmarks/terminal-stress"

const tinyWorkload: TerminalStressOptions = {
  outputChunks: 20,
  monitoredChunks: 10,
  observedChunks: 20,
  observationInterval: 5,
  resizeCycles: 4,
  sidebarPublications: 50,
}

describe("Free Terminal stress benchmarks", () => {
  test("run every workload repeatedly without leaking fixture state", async () => {
    const cases = terminalStressBenchmarks(tinyWorkload)
    expect(cases.map((benchmark) => benchmark.id)).toEqual([
      "terminal.stress_output_plain",
      "terminal.stress_output_ansi",
      "terminal.stress_output_screen",
      "terminal.stress_output_observed",
      "terminal.stress_output_resize",
      "terminal.stress_sidebar_unchanged",
    ])
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, 2, 1)
      expect(result.samplesMs).toHaveLength(2)
      expect(result.samplesMs.every((sample) => Number.isFinite(sample) && sample >= 0)).toBe(true)
    }
  })

  test("rejects invalid workload sizes before measuring", () => {
    expect(() => terminalStressBenchmarks({ ...tinyWorkload, resizeCycles: 0 })).toThrow(
      "Invalid resize cycle count",
    )
  })

  test("writes a standard isolated JSON report", () => {
    const root = mkdtempSync(join(tmpdir(), "tuiminal-terminal-stress-test-"))
    const output = join(root, "stress.json")
    try {
      const child = Bun.spawnSync([process.execPath, "scripts/benchmark-free-terminal.ts"], {
        cwd: join(import.meta.dir, ".."),
        env: {
          ...process.env,
          BENCHMARK_SAMPLES: "1",
          BENCHMARK_WARMUP: "0",
          BENCHMARK_OUTPUT: output,
          TUIMINAL_TERMINAL_STRESS_SCALE: "0.001",
        },
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(new TextDecoder().decode(child.stderr)).toBe("")
      expect(child.exitCode).toBe(0)
      const report = JSON.parse(readFileSync(output, "utf8")) as {
        schemaVersion: number
        configuration: {
          samples: number
          warmup: number
          scale: number
          workloads: TerminalStressOptions
        }
        results: Array<{ id: string; tool: string; samplesMs: number[] }>
      }
      expect(report.schemaVersion).toBe(1)
      expect(report.configuration).toEqual({
        samples: 1,
        warmup: 0,
        scale: 0.001,
        workloads: {
          outputChunks: 20,
          monitoredChunks: 5,
          observedChunks: 10,
          observationInterval: 1,
          resizeCycles: 1,
          sidebarPublications: 100,
        },
      })
      expect(report.results).toHaveLength(6)
      expect(
        report.results.every(
          (result) => result.tool === "terminal" && result.samplesMs.length === 1,
        ),
      ).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
