import "../tests/tui/setup"
import { test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { Runner } from "../packages/feature-runner/src/RunnerWorkspace"
import { activeProcesses } from "../packages/feature-runner/src/services/process-registry"
import {
  removeRunnerFlow,
  removeSavedRunnerCommand,
  saveRunnerCommand,
  saveRunnerFlow,
} from "../packages/feature-runner/src/storage/runner-settings"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("Runner saved flow launch, restart, and stop latency in the native interface", async () => {
  const projectRoot = process.env.TUIMINAL_WORKDIR
  if (!projectRoot || !process.env.XDG_CONFIG_HOME) {
    throw new Error("Missing isolated Runner TUI fixture")
  }
  const { samples, warmup } = benchmarkCounts()
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-runner-flow-"))
  const marker = join(root, "stages.txt")
  const script = join(root, "stage.cjs")
  const hold = join(root, "hold.txt")
  const running = join(root, "running.txt")
  const ownedBefore = new Set(activeProcesses)
  const commandIds: string[] = []
  const flowId = `flow:${crypto.randomUUID()}`
  let flowSaved = false
  let tui: Awaited<ReturnType<typeof testRender>> | undefined

  function frame() {
    return tui?.captureCharFrame() ?? ""
  }
  function stages() {
    return existsSync(marker) ? readFileSync(marker, "utf8") : ""
  }
  async function waitFor(condition: () => boolean, label: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await act(async () => {
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      if (condition()) return frame()
    }
    throw new Error(`Runner UI did not show ${label}:\n${frame()}`)
  }
  async function press(name: string, ctrl = false) {
    act(() => tui?.mockInput.pressKey(name, { ctrl }))
    await act(async () => Bun.sleep(60))
    await tui?.renderOnce()
  }
  async function click(id: string) {
    const node = tui?.renderer.root.findDescendantById(id)
    if (!node) throw new Error(`Missing ${id}:\n${frame()}`)
    await act(async () => tui?.mockMouse.click(node.screenX + 1, node.screenY))
    await tui?.renderOnce()
  }
  async function stopOwned() {
    await Promise.all(
      [...activeProcesses]
        .filter((handle) => !ownedBefore.has(handle))
        .map((handle) => handle.stop()),
    )
  }
  async function reset() {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
    await stopOwned()
    rmSync(marker, { force: true })
    rmSync(hold, { force: true })
    rmSync(running, { force: true })
    tui = await act(async () =>
      testRender(createElement(Runner, { active: true }), { width: 160, height: 38 }),
    )
    await waitFor(
      () => tui?.renderer.currentFocusedRenderable?.id === "runner-command-list",
      "command list",
    )
    await press("y", true)
    await waitFor(
      () => tui?.renderer.currentFocusedRenderable?.id === "runner-config-yaml",
      "configuration editor",
    )
    await press("ESCAPE")
    if (tui.renderer.root.findDescendantById("runner-config-editor")) await press("ESCAPE")
    await waitFor(
      () =>
        frame().includes("Benchmark flow") &&
        Boolean(tui?.renderer.root.findDescendantById("runner-config-run")),
      "saved flow controls",
    )
  }
  async function completedRuns(count: number) {
    let sawCurrentRun = count === 1
    return waitFor(() => {
      const content = stages()
      const rendered = frame()
      if (!rendered.includes("Final: sucesso")) sawCurrentRun = true
      return (
        sawCurrentRun &&
        content.length === count * 4 &&
        [...content].filter((stage) => stage === "D").length === count &&
        rendered.includes("Final: sucesso")
      )
    }, `${count} completed flow run(s)`)
  }
  function verifyRun(count: number, rendered: string) {
    const content = stages()
    const runs = Array.from({ length: count }, (_, index) =>
      content.slice(index * 4, index * 4 + 4),
    )
    if (content.length !== count * 4 || runs.some((run) => run !== "ABCD" && run !== "ACBD")) {
      throw new Error(`Runner flow stages ran out of order: ${content}`)
    }
    if (!rendered.includes("Final: sucesso")) {
      throw new Error("Runner did not render the final command success")
    }
  }

  try {
    writeFileSync(
      script,
      `const fs = require("node:fs");\n` +
        `const marker = process.env.TUIMINAL_BENCHMARK_MARKER;\n` +
        `const stage = process.env.TUIMINAL_BENCHMARK_STAGE;\n` +
        `const current = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "";\n` +
        `if (stage !== "A" && !current.includes("A")) process.exit(3);\n` +
        `if (stage === "D" && (!current.includes("B") || !current.includes("C"))) process.exit(4);\n` +
        `fs.appendFileSync(marker, stage);\n` +
        `if (stage === "B" && fs.existsSync(${JSON.stringify(hold)})) {\n` +
        `  fs.writeFileSync(${JSON.stringify(running)}, String(process.pid));\n` +
        `  setInterval(() => {}, 1000);\n` +
        `}\n`,
    )
    const labels = { A: "Prepare", B: "Parallel B", C: "Parallel C", D: "Final" }
    const ids = {} as Record<keyof typeof labels, string>
    for (const stage of ["A", "B", "C", "D"] as const) {
      const id = `saved:${crypto.randomUUID()}`
      commandIds.push(id)
      saveRunnerCommand(projectRoot, {
        id,
        label: labels[stage],
        command: `${JSON.stringify(process.execPath)} ${JSON.stringify(script)}`,
        env: {
          TUIMINAL_BENCHMARK_MARKER: marker,
          TUIMINAL_BENCHMARK_STAGE: stage,
        },
      })
      ids[stage] = id
    }
    saveRunnerFlow(projectRoot, {
      id: flowId,
      label: "Benchmark flow",
      autostart: false,
      stages: [
        { commandIds: [ids.A], waitFor: "completed" },
        { commandIds: [ids.B, ids.C], waitFor: "completed" },
        { commandIds: [ids.D], waitFor: "completed" },
      ],
    })
    flowSaved = true

    const cases = [
      defineBenchmark({
        id: "ui.runner_flow_run",
        tool: "runner",
        description: "Visible Run click through four real child processes to rendered flow success",
        beforeEach: reset,
        run: async () => {
          await click("runner-config-run")
          return completedRuns(1)
        },
        verify: (rendered) => verifyRun(1, rendered),
      }),
      defineBenchmark({
        id: "ui.runner_flow_restart",
        tool: "runner",
        description: "Visible Restart click through a second complete four-command flow",
        beforeEach: async () => {
          await reset()
          await click("runner-config-run")
          verifyRun(1, await completedRuns(1))
        },
        run: async () => {
          await click("runner-config-restart")
          return completedRuns(2)
        },
        verify: (rendered) => verifyRun(2, rendered),
      }),
      defineBenchmark({
        id: "ui.runner_flow_stop",
        tool: "runner",
        description: "Visible Stop click through owned child retirement to rendered stopped state",
        beforeEach: async () => {
          await reset()
          writeFileSync(hold, "yes")
          await click("runner-config-run")
          await waitFor(
            () =>
              existsSync(running) &&
              frame().includes("Parallel B: iniciado") &&
              !stages().includes("D"),
            "running middle stage",
          )
        },
        run: async () => {
          const pid = Number(readFileSync(running, "utf8"))
          await click("runner-config-stop")
          const rendered = await waitFor(
            () =>
              frame().includes("Parallel B: parado") &&
              ![...activeProcesses].some((handle) => handle.pid === pid),
            "stopped child and rendered flow state",
          )
          return { rendered, pid }
        },
        verify: ({ rendered, pid }) => {
          if (!rendered.includes("Parallel B: parado") || stages().includes("D")) {
            throw new Error("Runner stop did not cancel the active stage and its dependent")
          }
          if ([...activeProcesses].some((handle) => handle.pid === pid)) {
            throw new Error("Stopped Runner child is still owned by the process registry")
          }
        },
      }),
    ]
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(28)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
      )
    }
    if (process.env.BENCHMARK_OUTPUT) {
      writeFileSync(
        process.env.BENCHMARK_OUTPUT,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
            configuration: { samples, warmup },
            results,
          },
          null,
          2,
        )}\n`,
      )
    }
  } finally {
    if (tui) act(() => tui?.renderer.destroy())
    await stopOwned()
    if (flowSaved) removeRunnerFlow(projectRoot, flowId)
    for (const id of commandIds) removeSavedRunnerCommand(projectRoot, id)
    rmSync(root, { recursive: true, force: true })
  }
}, 180_000)
