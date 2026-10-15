import { execFile, execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type BenchmarkCase, type BenchmarkResult, measureBenchmark } from "./benchmarks/harness"

const tools = ["database", "git", "runner", "http", "terminal"] as const
type Tool = (typeof tools)[number]

function usage() {
  return "Usage: bun scripts/benchmark.ts [--suite database,git,runner,http,terminal] [--external-database] [--samples N] [--warmup N] [--json] [--output path]"
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index + 1]
  if (!value) throw new Error(`Missing ${option} value. ${usage()}`)
  return value
}

function selectedSuites(value: string): Tool[] {
  const values = value.split(",")
  if (!values.length || values.some((item) => !tools.includes(item as Tool))) {
    throw new Error(`Invalid suite. ${usage()}`)
  }
  return [...new Set(values)] as Tool[]
}

function count(value: string, option: string) {
  const parsed = Number(value)
  const minimum = option === "--samples" ? 1 : 0
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`Invalid ${option} value. ${usage()}`)
  }
  return parsed
}

function options(args: string[]) {
  let suites: Tool[] = [...tools]
  let samples = 20
  let warmup = 3
  let json = false
  let externalDatabase = false
  let output: string | null = null
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage())
        process.exit(0)
        break
      case "--json":
        json = true
        break
      case "--external-database":
        externalDatabase = true
        break
      case "--suite":
        suites = selectedSuites(requiredValue(args, index++, arg))
        break
      case "--samples":
        samples = count(requiredValue(args, index++, arg), arg)
        break
      case "--warmup":
        warmup = count(requiredValue(args, index++, arg), arg)
        break
      case "--output":
        output = requiredValue(args, index++, arg)
        break
      default:
        throw new Error(`Unknown option: ${arg}. ${usage()}`)
    }
  }
  if (externalDatabase && !suites.includes("database")) {
    throw new Error("--external-database requires the database suite")
  }
  return { suites, samples, warmup, json, output, externalDatabase }
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

function worktreeDirty() {
  try {
    return Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
  } catch {
    return null
  }
}

function displayMilliseconds(value: number) {
  return value < 0.01 ? value.toFixed(6) : value.toFixed(3)
}

function isolatedTerminalResults(samples: number, warmup: number): Promise<BenchmarkResult[]> {
  return new Promise((resolve, reject) => {
    const deadlineMs = Math.max(60_000, (samples + warmup) * 3_000)
    execFile(
      process.execPath,
      [
        join(import.meta.dir, "benchmark.ts"),
        "--suite",
        "terminal",
        "--samples",
        String(samples),
        "--warmup",
        String(warmup),
        "--json",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, TUIMINAL_BENCHMARK_TERMINAL_CHILD: "1" },
        timeout: deadlineMs,
        killSignal: "SIGTERM",
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const reason = error.killed
            ? `deadline exceeded after ${deadlineMs} ms`
            : stderr.trim() || error.message
          reject(new Error(`Isolated Terminal benchmark failed: ${reason}`))
          return
        }
        try {
          const report = JSON.parse(stdout) as { results?: BenchmarkResult[] }
          if (
            !Array.isArray(report.results) ||
            report.results.some((item) => item.tool !== "terminal")
          ) {
            throw new Error("Isolated Terminal benchmark returned an invalid report")
          }
          resolve(report.results)
        } catch (parseError) {
          reject(parseError)
        }
      },
    )
  })
}

async function addIsolatedTerminalResults(
  config: ReturnType<typeof options>,
  results: BenchmarkResult[],
) {
  if (
    !config.suites.includes("terminal") ||
    process.env.TUIMINAL_BENCHMARK_TERMINAL_CHILD === "1"
  ) {
    return
  }
  const terminalResults = await isolatedTerminalResults(config.samples, config.warmup)
  results.push(...terminalResults)
  if (config.json) return
  for (const result of terminalResults) {
    console.log(
      `${result.id.padEnd(30)} p50 ${displayMilliseconds(result.p50Ms).padStart(9)} ms  p95 ${displayMilliseconds(result.p95Ms).padStart(9)} ms`,
    )
  }
}

async function addExternalDatabaseCases(
  config: ReturnType<typeof options>,
  cases: BenchmarkCase[],
  cleanup: Array<() => Promise<void>>,
) {
  if (!config.externalDatabase) return
  const suite = await import("./benchmarks/database-drivers")
  const prepared = await suite.externalDatabaseBenchmarks()
  cases.push(...prepared.cases)
  cleanup.push(prepared.cleanup)
}

function isolateBenchmarkEnvironment(root: string) {
  const patch: Record<string, string> = {
    XDG_CONFIG_HOME: join(root, "config"),
    TUIMINAL_WORKDIR: root,
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  }
  const previous = new Map(Object.keys(patch).map((key) => [key, process.env[key]]))
  Object.assign(process.env, patch)
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function main() {
  const config = options(process.argv.slice(2))
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-"))
  const restoreEnvironment = isolateBenchmarkEnvironment(root)
  const cleanup: Array<() => Promise<void>> = []
  let cleanupError: unknown = null
  try {
    const cases: BenchmarkCase[] = []
    let gitRoot: string | null = null
    if (config.suites.includes("database")) {
      const suite = await import("./benchmarks/database")
      const prepared = await suite.databaseBenchmarks(root)
      cases.push(...prepared.cases)
      cleanup.push(prepared.cleanup)
    }
    await addExternalDatabaseCases(config, cases, cleanup)
    if (config.suites.includes("git")) {
      const suite = await import("./benchmarks/git")
      const prepared = await suite.gitBenchmarks(root)
      cases.push(...prepared.cases)
      gitRoot = prepared.root
    }
    if (config.suites.includes("runner")) {
      const suite = await import("./benchmarks/runner")
      const prepared = await suite.runnerBenchmarks(root)
      cases.push(...prepared.cases)
      cleanup.push(prepared.cleanup)
    }
    if (config.suites.includes("http")) {
      const suite = await import("./benchmarks/http")
      const prepared = await suite.httpBenchmarks(root)
      cases.push(...prepared.cases)
      cleanup.push(prepared.cleanup)
    }
    if (
      config.suites.includes("terminal") &&
      process.env.TUIMINAL_BENCHMARK_TERMINAL_CHILD === "1"
    ) {
      const suite = await import("./benchmarks/terminal")
      if (!gitRoot) gitRoot = (await import("./benchmarks/fixtures")).gitFixture(root)
      cases.push(...(await suite.terminalBenchmarks(gitRoot)))
    }
    const results: BenchmarkResult[] = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, config.samples, config.warmup)
      results.push(result)
      if (!config.json) {
        console.log(
          `${result.id.padEnd(30)} p50 ${displayMilliseconds(result.p50Ms).padStart(9)} ms  p95 ${displayMilliseconds(result.p95Ms).padStart(9)} ms`,
        )
      }
    }
    await addIsolatedTerminalResults(config, results)
    const report = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      commit: currentCommit(),
      worktreeDirty: worktreeDirty(),
      runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
      configuration: {
        suites: config.suites,
        samples: config.samples,
        warmup: config.warmup,
        externalDatabase: config.externalDatabase,
      },
      results,
    }
    const serialized = `${JSON.stringify(report, null, 2)}\n`
    if (config.output) writeFileSync(config.output, serialized)
    if (config.json) process.stdout.write(serialized)
  } finally {
    const released = await Promise.allSettled(cleanup.reverse().map((release) => release()))
    try {
      restoreEnvironment()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    const failure = released.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") cleanupError = failure.reason
  }
  if (cleanupError) throw cleanupError
}

await main()
