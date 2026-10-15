import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { measureBenchmark } from "./benchmarks/harness"
import {
  DEFAULT_TERMINAL_STRESS_OPTIONS,
  type TerminalStressOptions,
  terminalStressBenchmarks,
} from "./benchmarks/terminal-stress"

function positiveNumber(value: string | undefined, fallback: number, name: string) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid ${name}`)
  return parsed
}

function count(value: string | undefined, fallback: number, minimum: number, name: string) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`Invalid ${name}`)
  return parsed
}

function scaledOptions(scale: number): TerminalStressOptions {
  const scaled = (value: number) => Math.max(1, Math.round(value * scale))
  return {
    outputChunks: scaled(DEFAULT_TERMINAL_STRESS_OPTIONS.outputChunks),
    monitoredChunks: scaled(DEFAULT_TERMINAL_STRESS_OPTIONS.monitoredChunks),
    observedChunks: scaled(DEFAULT_TERMINAL_STRESS_OPTIONS.observedChunks),
    observationInterval: scaled(DEFAULT_TERMINAL_STRESS_OPTIONS.observationInterval),
    resizeCycles: scaled(DEFAULT_TERMINAL_STRESS_OPTIONS.resizeCycles),
    sidebarPublications: scaled(DEFAULT_TERMINAL_STRESS_OPTIONS.sidebarPublications),
  }
}

function sourceState() {
  try {
    const run = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
    return {
      commit: run(["rev-parse", "HEAD"]),
      worktreeDirty: Boolean(run(["status", "--porcelain"])),
    }
  } catch {
    return { commit: null, worktreeDirty: null }
  }
}

const samples = count(process.env.BENCHMARK_SAMPLES, 7, 1, "BENCHMARK_SAMPLES")
const warmup = count(process.env.BENCHMARK_WARMUP, 1, 0, "BENCHMARK_WARMUP")
const scale = positiveNumber(process.env.TUIMINAL_TERMINAL_STRESS_SCALE, 1, "stress scale")
const workloads = scaledOptions(scale)
const results = []
for (const benchmark of terminalStressBenchmarks(workloads)) {
  const result = await measureBenchmark(benchmark, samples, warmup)
  results.push(result)
  console.log(
    `${result.id.padEnd(36)} p50 ${result.p50Ms.toFixed(6)} ms/op  p95 ${result.p95Ms.toFixed(6)} ms/op`,
  )
}

if (process.env.BENCHMARK_OUTPUT) {
  const output = resolve(process.env.BENCHMARK_OUTPUT)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        ...sourceState(),
        runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
        configuration: { samples, warmup, scale, workloads },
        results,
      },
      null,
      2,
    )}\n`,
  )
}
