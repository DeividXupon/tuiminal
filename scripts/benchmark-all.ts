import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { BenchmarkResult } from "./benchmarks/harness"

const suiteIds = [
  "service",
  "startup",
  "tui",
  "runner-execution",
  "runner-flow",
  "http-response",
  "git-ui",
  "git-remote-ui",
  "git-inbox-ui",
  "git-pr",
  "http-ui",
  "database-ui",
] as const
type SuiteId = (typeof suiteIds)[number]
const testFiles: Partial<Record<SuiteId, string>> = {
  tui: "benchmark-tui.test.ts",
  "runner-execution": "benchmark-runner-execution.test.tsx",
  "runner-flow": "benchmark-runner-flow-ui.test.tsx",
  "http-response": "benchmark-http-response.test.tsx",
  "git-ui": "benchmark-git-partial-ui.test.tsx",
  "git-remote-ui": "benchmark-git-remote-ui.test.tsx",
  "git-inbox-ui": "benchmark-git-inbox-ui.test.tsx",
  "http-ui": "benchmark-http-ui.test.tsx",
  "database-ui": "benchmark-database-ui.test.tsx",
}
const projectRoot = resolve(import.meta.dir, "..")

function usage() {
  return "Usage: bun run benchmark:all [--suite service,startup,tui,runner-execution,runner-flow,http-response,git-ui,git-remote-ui,git-inbox-ui,git-pr,http-ui,database-ui] [--samples N] [--warmup N] [--startup-samples N] [--startup-warmup N] [--external-database] [--output path]"
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index + 1]
  if (!value) throw new Error(`Missing ${option} value. ${usage()}`)
  return value
}

function selectedSuites(value: string): SuiteId[] {
  const requested = value.split(",")
  if (requested.some((id) => !suiteIds.includes(id as SuiteId))) {
    throw new Error(`Invalid suite. ${usage()}`)
  }
  return [...new Set(requested)] as SuiteId[]
}

function count(value: string, minimum: number, option: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`Invalid ${option} value. ${usage()}`)
  }
  return parsed
}

function options(args: string[]) {
  const config = {
    suites: [...suiteIds] as SuiteId[],
    samples: 20,
    warmup: 3,
    startupSamples: 5,
    startupWarmup: 1,
    externalDatabase: false,
    output: join(projectRoot, "dist", "benchmarks", "all.json"),
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage())
        process.exit(0)
        break
      case "--external-database":
        config.externalDatabase = true
        break
      case "--suite":
        config.suites = selectedSuites(requiredValue(args, index++, arg))
        break
      case "--output":
        config.output = resolve(requiredValue(args, index++, arg))
        break
      case "--samples":
        config.samples = count(requiredValue(args, index++, arg), 1, arg)
        break
      case "--warmup":
        config.warmup = count(requiredValue(args, index++, arg), 0, arg)
        break
      case "--startup-samples":
        config.startupSamples = count(requiredValue(args, index++, arg), 1, arg)
        break
      case "--startup-warmup":
        config.startupWarmup = count(requiredValue(args, index++, arg), 0, arg)
        break
      default:
        throw new Error(`Unknown option: ${arg}. ${usage()}`)
    }
  }
  if (!config.suites.length) throw new Error(`Select at least one suite. ${usage()}`)
  if (config.externalDatabase && !config.suites.includes("service")) {
    throw new Error("--external-database requires the service suite")
  }
  return config
}

function sourceState() {
  try {
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: projectRoot,
        encoding: "utf8",
      }).trim(),
      worktreeDirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: projectRoot,
          encoding: "utf8",
        }).trim(),
      ),
    }
  } catch {
    return { commit: null, worktreeDirty: null }
  }
}

function command(id: SuiteId, file: string, config: ReturnType<typeof options>) {
  if (id === "service") {
    return [
      join(import.meta.dir, "benchmark.ts"),
      "--samples",
      String(config.samples),
      "--warmup",
      String(config.warmup),
      "--output",
      file,
      ...(config.externalDatabase ? ["--external-database"] : []),
    ]
  }
  if (id === "startup") {
    return [
      join(import.meta.dir, "benchmark-startup.ts"),
      "--samples",
      String(config.startupSamples),
      "--warmup",
      String(config.startupWarmup),
      "--output",
      file,
    ]
  }
  if (id === "git-pr") return [join(import.meta.dir, "benchmark-git-pr.ts")]
  const testFile = testFiles[id]
  if (!testFile) throw new Error(`Missing benchmark test for ${id}`)
  return ["test", "--preload", "./tests/tui/setup.ts", join(import.meta.dir, testFile)]
}

function resultsFrom(path: string, expectedSamples: number, id: SuiteId) {
  const report = JSON.parse(readFileSync(path, "utf8")) as {
    schemaVersion?: number
    runtime?: { bun?: string }
    results?: BenchmarkResult[]
  }
  if (
    report.schemaVersion !== 1 ||
    report.runtime?.bun !== Bun.version ||
    !Array.isArray(report.results) ||
    !report.results.length ||
    report.results.some(
      (result) =>
        typeof result.id !== "string" ||
        !result.id ||
        !Array.isArray(result.samplesMs) ||
        result.samplesMs.length !== expectedSamples ||
        result.samplesMs.some((sample) => !Number.isFinite(sample) || sample < 0),
    ) ||
    new Set(report.results.map((result) => result.id)).size !== report.results.length
  ) {
    throw new Error(`Invalid ${id} benchmark report`)
  }
  return report.results
}

async function main() {
  const config = options(process.argv.slice(2))
  const temporary = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-all-"))
  const results: BenchmarkResult[] = []
  const suites: Array<{ id: SuiteId; samples: number; warmup: number; caseIds: string[] }> = []
  let child: ReturnType<typeof Bun.spawn> | undefined
  let interrupted = false
  const interrupt = () => {
    interrupted = true
    child?.kill("SIGTERM")
  }
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", interrupt)
  try {
    for (const id of config.suites) {
      if (interrupted) throw new Error("Benchmark run interrupted")
      const file = join(temporary, `${id}.json`)
      const count = id === "startup" ? config.startupSamples : config.samples
      const warmup = id === "startup" ? config.startupWarmup : config.warmup
      console.log(`\n== ${id} ==`)
      child = Bun.spawn([process.execPath, ...command(id, file, config)], {
        cwd: projectRoot,
        env: {
          ...process.env,
          BENCHMARK_OUTPUT: file,
          BENCHMARK_SAMPLES: String(config.samples),
          BENCHMARK_WARMUP: String(config.warmup),
        },
        stdout: "inherit",
        stderr: "inherit",
      })
      const exitCode = await child.exited
      child = undefined
      if (interrupted) throw new Error("Benchmark run interrupted")
      if (exitCode !== 0) throw new Error(`${id} benchmark exited with code ${exitCode}`)
      const measured = resultsFrom(file, count, id)
      const seen = new Set(results.map((result) => result.id))
      if (measured.some((result) => seen.has(result.id))) {
        throw new Error(`${id} benchmark reused a result ID`)
      }
      results.push(...measured)
      suites.push({ id, samples: count, warmup, caseIds: measured.map((result) => result.id) })
    }
    const report = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      ...sourceState(),
      runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
      configuration: {
        samples: config.samples,
        warmup: config.warmup,
        startupSamples: config.startupSamples,
        startupWarmup: config.startupWarmup,
        externalDatabase: config.externalDatabase,
      },
      suites,
      results,
    }
    mkdirSync(dirname(config.output), { recursive: true })
    writeFileSync(config.output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`\n${results.length} cases across ${suites.length} suites: ${config.output}`)
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    if (child && child.exitCode === null) child.kill("SIGTERM")
    rmSync(temporary, { recursive: true, force: true })
  }
}

await main()
