import "../tests/tui/setup"
import { spyOn, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement, useRef, useState } from "react"
import { useRunnerExecution } from "../packages/feature-runner/src/hooks/use-runner-execution"
import type { ExecutionLog, RunnerExecution } from "../packages/feature-runner/src/model/execution"
import type { RunnerCommand } from "../packages/feature-runner/src/model/types"
import { activeProcesses } from "../packages/feature-runner/src/services/process-registry"
import * as runnerService from "../packages/feature-runner/src/services/runner"
import { loadRunnerHistory } from "../packages/feature-runner/src/storage/runner-config"
import { type BenchmarkResult, defineBenchmark, measureBenchmark } from "./benchmarks/harness"

const recordedResults: BenchmarkResult[] = []

function writeReport(samples: number, warmup: number) {
  if (!process.env.BENCHMARK_OUTPUT) return
  writeFileSync(
    process.env.BENCHMARK_OUTPUT,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
        configuration: { samples, warmup },
        results: recordedResults,
      },
      null,
      2,
    )}\n`,
  )
}

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("Runner mounted execution policy and log persistence latency", async () => {
  const { samples, warmup } = benchmarkCounts()
  const projectRoot = process.env.TUIMINAL_WORKDIR ?? ""
  if (!projectRoot || !process.env.XDG_CONFIG_HOME)
    throw new Error("Missing isolated Runner fixture")
  const logs = new Map<string, ExecutionLog[]>()
  let launchCommand: ReturnType<typeof useRunnerExecution>["launchCommand"] | undefined
  let executions: RunnerExecution[] = []
  let processStarts = 0
  let exitCode = 0
  let renderer: Awaited<ReturnType<typeof testRender>> | undefined
  const processStart = spyOn(runnerService, "startRunnerProcess").mockImplementation(
    (_root, _command, callbacks) => {
      processStarts += 1
      queueMicrotask(() => {
        callbacks.onLine("benchmark output", "stdout")
        callbacks.onExit({ code: exitCode, signal: null, stopped: false })
      })
      return {
        pid: null,
        interactive: false,
        write: () => undefined,
        stop: async () => undefined,
      }
    },
  )
  function Harness() {
    const [current, setExecutions] = useState<RunnerExecution[]>([])
    const logSequence = useRef(1)
    executions = current
    launchCommand = useRunnerExecution({
      projectRoot,
      environmentProfiles: [],
      profileSelections: {},
      setExecutions,
      setNow: () => undefined,
      appendLog: (id, text, stream) => {
        const entries = logs.get(id)
        if (!entries) throw new Error(`Missing execution log ${id}`)
        entries.push({ id: logSequence.current++, text, stream, at: Date.now() })
      },
      beginLogs: (id, initial) => {
        const entries = [initial]
        logs.set(id, entries)
        return entries
      },
      finishLogs: (id) => logs.get(id) ?? [],
      logSequence,
      notify: () => "benchmark-notification",
      onStarted: () => undefined,
    }).launchCommand
    return createElement("box", null, createElement("text", null, String(current.length)))
  }
  async function reset() {
    if (renderer) {
      act(() => renderer?.renderer.destroy())
      renderer = undefined
    }
    logs.clear()
    processStarts = 0
    executions = []
    launchCommand = undefined
    renderer = await act(async () => testRender(createElement(Harness), { width: 50, height: 8 }))
    if (!launchCommand) throw new Error("Runner execution hook did not mount")
  }
  const baseCommand: RunnerCommand = {
    id: "benchmark",
    label: "Benchmark",
    category: "custom",
    description: "Disposable Runner hook fixture",
    program: process.execPath,
    args: [],
    displayCommand: "benchmark fixture",
  }
  async function execute(command: RunnerCommand) {
    const launch = launchCommand
    if (!launch) throw new Error("Runner execution hook is unavailable")
    let settled = false
    await act(async () => {
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error("Runner execution did not settle")),
          2_000,
        )
        launch(command, {
          onSettled: (error) => {
            clearTimeout(deadline)
            if (error) reject(error)
            else {
              settled = true
              resolve()
            }
          },
        })
      })
    })
    return { settled, processStarts, executions, history: loadRunnerHistory()[0] }
  }
  try {
    const cases = [
      defineBenchmark({
        id: "ui.runner_auto_restart",
        tool: "runner",
        description:
          "Mounted execution hook: failed process, policy delay, and one automatic restart",
        beforeEach: async () => {
          exitCode = 4
          await reset()
        },
        run: () =>
          execute({
            ...baseCommand,
            restartPolicy: "on-failure",
            restartDelayMs: 25,
            maxRestarts: 1,
          }),
        verify: ({ settled, processStarts, executions, history }) => {
          if (!settled || processStarts !== 2 || executions.length !== 2) {
            throw new Error("Automatic Runner restart did not finish exactly two attempts")
          }
          if (executions.some((execution) => execution.status !== "failed")) {
            throw new Error("Restart attempts should both fail in this fixture")
          }
          if (history?.status !== "failed" || history.logs.length !== 0) {
            throw new Error("Restart history should retain metadata without opt-in logs")
          }
        },
      }),
      ...([false, true] as const).map((persistLogs) =>
        defineBenchmark({
          id: `ui.runner_history_${persistLogs ? "logs" : "metadata"}`,
          tool: "runner",
          description: `Mounted execution hook: successful completion with ${persistLogs ? "opted-in logs" : "metadata-only history"}`,
          beforeEach: async () => {
            exitCode = 0
            await reset()
          },
          run: () => execute({ ...baseCommand, persistLogs }),
          verify: ({ settled, processStarts, executions, history }) => {
            if (!settled || processStarts !== 1 || executions[0]?.status !== "success") {
              throw new Error("Runner completion was not recorded")
            }
            const output = history?.logs.some((log) => log.text === "benchmark output") ?? false
            if (history?.status !== "success" || output !== persistLogs) {
              throw new Error("Runner history did not honor the log persistence option")
            }
            if (!persistLogs && history.logs.length !== 0) {
              throw new Error("Metadata-only history persisted log content")
            }
          },
        }),
      ),
    ]
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      recordedResults.push(result)
      console.log(
        `${result.id.padEnd(28)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
      )
    }
    writeReport(samples, warmup)
  } finally {
    if (renderer) act(() => renderer?.renderer.destroy())
    processStart.mockRestore()
  }
}, 120_000)

test("Runner automatic restart latency with real child processes", async () => {
  const { samples, warmup } = benchmarkCounts()
  const projectRoot = process.env.TUIMINAL_WORKDIR ?? ""
  if (!projectRoot || !process.env.XDG_CONFIG_HOME) {
    throw new Error("Missing isolated Runner fixture")
  }
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-runner-restart-"))
  const attemptsPath = join(root, "attempts.txt")
  const scriptPath = join(root, "restart.cjs")
  const ownedBefore = new Set(activeProcesses)
  let launchCommand: ReturnType<typeof useRunnerExecution>["launchCommand"] | undefined
  let executions: RunnerExecution[] = []
  let renderer: Awaited<ReturnType<typeof testRender>> | undefined
  const logs = new Map<string, ExecutionLog[]>()

  function Harness() {
    const [current, setExecutions] = useState<RunnerExecution[]>([])
    const logSequence = useRef(1)
    executions = current
    launchCommand = useRunnerExecution({
      projectRoot,
      environmentProfiles: [],
      profileSelections: {},
      setExecutions,
      setNow: () => undefined,
      appendLog: (id, text, stream) => {
        logs.get(id)?.push({ id: logSequence.current++, text, stream, at: Date.now() })
      },
      beginLogs: (id, initial) => {
        const entries = [initial]
        logs.set(id, entries)
        return entries
      },
      finishLogs: (id) => logs.get(id) ?? [],
      logSequence,
      notify: () => "benchmark-notification",
      onStarted: () => undefined,
    }).launchCommand
    return createElement("box", null, createElement("text", null, String(current.length)))
  }
  async function stopOwned() {
    await Promise.all(
      [...activeProcesses]
        .filter((handle) => !ownedBefore.has(handle))
        .map((handle) => handle.stop()),
    )
  }
  async function reset() {
    if (renderer) {
      act(() => renderer?.renderer.destroy())
      renderer = undefined
    }
    await stopOwned()
    rmSync(attemptsPath, { force: true })
    logs.clear()
    launchCommand = undefined
    executions = []
    renderer = await act(async () => testRender(createElement(Harness), { width: 50, height: 8 }))
    if (!launchCommand) throw new Error("Runner execution hook did not mount")
  }
  async function execute() {
    const launch = launchCommand
    if (!launch) throw new Error("Runner execution hook is unavailable")
    await act(async () => {
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error("Real Runner restart did not settle")),
          5000,
        )
        launch(
          {
            id: "benchmark-real-restart",
            label: "Benchmark real restart",
            category: "custom",
            description: "Disposable child fails once, then succeeds",
            program: process.execPath,
            args: [scriptPath],
            displayCommand: "benchmark restart fixture",
            restartPolicy: "on-failure",
            restartDelayMs: 25,
            maxRestarts: 1,
          },
          {
            onSettled: (error) => {
              clearTimeout(deadline)
              if (error) reject(error)
              else resolve()
            },
          },
        )
      })
    })
    return {
      attempts: existsSync(attemptsPath) ? readFileSync(attemptsPath, "utf8") : "",
      executions,
      history: loadRunnerHistory()[0],
    }
  }
  try {
    writeFileSync(
      scriptPath,
      `const fs = require("node:fs");\n` +
        `const path = ${JSON.stringify(attemptsPath)};\n` +
        `const count = fs.existsSync(path) ? Number(fs.readFileSync(path, "utf8")) : 0;\n` +
        `fs.writeFileSync(path, String(count + 1));\n` +
        `process.exit(count === 0 ? 7 : 0);\n`,
    )
    const benchmark = defineBenchmark({
      id: "ui.runner_auto_restart_real",
      tool: "runner",
      description: "Mounted execution hook: first real child fails, policy launches second child",
      beforeEach: reset,
      run: execute,
      verify: ({ attempts, executions, history }) => {
        if (attempts !== "2" || executions.length !== 2) {
          throw new Error("Runner did not launch exactly two real child attempts")
        }
        if (executions[0]?.status !== "success" || executions[1]?.status !== "failed") {
          throw new Error("Runner did not record the failed attempt and successful restart")
        }
        if (history?.status !== "success" || history.logs.length !== 0) {
          throw new Error("Runner restart history did not retain the final success")
        }
      },
    })
    const result = await measureBenchmark(benchmark, samples, warmup)
    console.log(
      `${result.id.padEnd(28)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
    )
    recordedResults.push(result)
    writeReport(samples, warmup)
  } finally {
    if (renderer) act(() => renderer?.renderer.destroy())
    await stopOwned()
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)
