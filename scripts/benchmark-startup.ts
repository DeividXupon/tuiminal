import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EmbeddedTerminalRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { forceKillOwnedProcessTree } from "../packages/core/src/process/owned-process"
import { type BenchmarkResult, percentile } from "./benchmarks/harness"

const tools = [
  { id: "database", expected: ["Save and connect"] },
  { id: "git", expected: ["No Git repository found", "Nenhum repositório Git encontrado"] },
  { id: "runner", expected: ["No project was found in this folder"] },
  { id: "http", expected: ["READY TO SEND"] },
  { id: "terminal", expected: ["FREE TERMINALS IN 2", "New terminal"] },
] as const

function usage() {
  return "Usage: bun scripts/benchmark-startup.ts [--samples N] [--warmup N] [--skip-animation] [--json] [--output path]"
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index + 1]
  if (!value) throw new Error(`Missing ${option} value. ${usage()}`)
  return value
}

function count(value: string, minimum: number, option: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`Invalid ${option}. ${usage()}`)
  }
  return parsed
}

function options(args: string[]) {
  let samples = 5
  let warmup = 1
  let skipAnimation = false
  let json = false
  let output: string | null = null
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage())
        process.exit(0)
        break
      case "--skip-animation":
        skipAnimation = true
        break
      case "--json":
        json = true
        break
      case "--samples":
        samples = count(requiredValue(args, index++, arg), 1, arg)
        break
      case "--warmup":
        warmup = count(requiredValue(args, index++, arg), 0, arg)
        break
      case "--output":
        output = requiredValue(args, index++, arg)
        break
      default:
        throw new Error(`Unknown option: ${arg}. ${usage()}`)
    }
  }
  return { samples, warmup, skipAnimation, json, output }
}

function fixtureEnvironment(root: string, skipAnimation: boolean) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: root,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    TUIMINAL_HTTP_HOME: join(root, "http"),
    TUIMINAL_PROJECT_ROOTS: root,
    TUIMINAL_SOURCE_FEATURES: "1",
    TUIMINAL_TERMINAL_BACKEND: "native",
    TUIMINAL_TERMINAL_AUTO_MIRROR: "0",
    TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY: "0",
    TUIMINAL_TERMINAL_RESTORE: "0",
    TUIMINAL_TERMINAL_PINNED_TMUX: "0",
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "0",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    TUIMINAL_GH_EXECUTABLE: join(root, "no-gh"),
    GH_CONFIG_DIR: join(root, "unused-gh-config"),
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    DATABASE_URL: undefined,
    MYSQL_URL: undefined,
    POSTGRES_URL: undefined,
    TUIMINAL_MYSQL_MCP_COMMAND: undefined,
    SHELL: undefined,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  }
  if (skipAnimation) environment.TUIMINAL_TEST_SKIP_STARTUP = "1"
  else delete environment.TUIMINAL_TEST_SKIP_STARTUP
  return environment
}

async function waitForExit(child: ReturnType<typeof Bun.spawn>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      child.exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function stopOwnedChild(child: ReturnType<typeof Bun.spawn>) {
  if (child.exitCode === null) {
    child.kill("SIGTERM")
    await waitForExit(child, 1_000)
  }
  if (child.exitCode === null) {
    forceKillOwnedProcessTree(child.pid, () => child.kill("SIGKILL"))
  }
  if (!(await waitForExit(child, 4_000))) {
    throw new Error(`Owned startup process ${child.pid} did not exit`)
  }
}

async function firstReadyFrame(
  tool: (typeof tools)[number],
  project: string,
  environment: NodeJS.ProcessEnv,
) {
  const capture = await createTestRenderer({ width: 120, height: 35 })
  let child: ReturnType<typeof Bun.spawn> | undefined
  let terminal: Bun.Terminal | undefined
  try {
    const ready = Promise.withResolvers<number>()
    let settled = false
    let startedAt = 0
    const screen = new EmbeddedTerminalRenderable(capture.renderer, {
      id: "startup-benchmark-screen",
      width: 120,
      height: 35,
      cols: 120,
      rows: 35,
      maxScrollback: 0,
      onData(data, source) {
        if (source === "response") terminal?.write(data)
      },
    })
    capture.renderer.root.add(screen)
    const checkReady = () => {
      if (settled) return
      try {
        if (tool.expected.some((text) => screen.screen().text.includes(text))) {
          settled = true
          ready.resolve(performance.now() - startedAt)
        }
      } catch (error) {
        settled = true
        ready.reject(error)
      }
    }
    startedAt = performance.now()
    child = Bun.spawn(
      [
        process.execPath,
        "--preload",
        join(import.meta.dir, "benchmarks/startup-preload.ts"),
        join(import.meta.dir, "../apps/cli/bin/tuiminal.ts"),
        tool.id,
        project,
      ],
      {
        cwd: project,
        env: environment,
        terminal: {
          cols: 120,
          rows: 35,
          data(_pty, data) {
            if (settled) return
            try {
              screen.write(data)
              checkReady()
            } catch (error) {
              settled = true
              ready.reject(error)
            }
          },
        },
      },
    )
    terminal = child.terminal
    if (!terminal) throw new Error(`Startup ${tool.id} has no terminal`)
    const poll = setInterval(checkReady, 5)
    void child.exited.then((code) => {
      if (settled) return
      settled = true
      ready.reject(new Error(`Startup ${tool.id} exited ${code}:\n${screen.screen().text}`))
    })
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        ready.promise,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error(`Startup ${tool.id} timed out:\n${screen.screen().text}`)),
            10_000,
          )
        }),
      ])
    } finally {
      clearTimeout(deadline)
      clearInterval(poll)
    }
  } finally {
    try {
      if (child) await stopOwnedChild(child)
    } finally {
      terminal?.close()
      capture.renderer.destroy()
    }
  }
}

function result(tool: (typeof tools)[number], samplesMs: number[]): BenchmarkResult {
  const ordered = [...samplesMs].sort((left, right) => left - right)
  return {
    id: `startup.${tool.id}`,
    tool: tool.id,
    description: `Cold CLI launch until ${tool.id} content appears on an emulated terminal`,
    operationsPerSample: 1,
    samplesMs,
    minMs: percentile(ordered, 0),
    p50Ms: percentile(ordered, 0.5),
    p95Ms: percentile(ordered, 0.95),
    maxMs: percentile(ordered, 1),
    meanMs: samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length,
  }
}

async function main() {
  const config = options(process.argv.slice(2))
  const root = mkdtempSync(join(tmpdir(), "tuiminal-startup-benchmark-"))
  try {
    const project = join(root, "empty-project")
    mkdirSync(project)
    mkdirSync(join(root, "config", "tuiminal"), { recursive: true })
    writeFileSync(
      join(root, "config", "tuiminal", "settings.json"),
      JSON.stringify({ language: "en", layout: "compact" }),
    )
    const environment = fixtureEnvironment(root, config.skipAnimation)
    const results: BenchmarkResult[] = []
    for (const tool of tools) {
      for (let index = 0; index < config.warmup; index += 1) {
        await firstReadyFrame(tool, project, environment)
      }
      const samplesMs: number[] = []
      for (let index = 0; index < config.samples; index += 1) {
        samplesMs.push(await firstReadyFrame(tool, project, environment))
      }
      const measured = result(tool, samplesMs)
      results.push(measured)
      if (!config.json) {
        console.log(
          `${measured.id.padEnd(18)} p50 ${measured.p50Ms.toFixed(3)} ms  p95 ${measured.p95Ms.toFixed(3)} ms`,
        )
      }
    }
    const report = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
      configuration: config,
      results,
    }
    const serialized = `${JSON.stringify(report, null, 2)}\n`
    if (config.output) writeFileSync(config.output, serialized)
    if (config.json) process.stdout.write(serialized)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

await main()
