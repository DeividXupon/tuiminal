import "../tests/tui/setup"
import { Database } from "bun:sqlite"
import { spyOn, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { App } from "../apps/cli/src/App"
import { updateUiSettings } from "../packages/core/src/settings/theme"
import * as codexServer from "../packages/feature-terminal/src/services/codex-app-server"
import * as terminalProcesses from "../packages/feature-terminal/src/services/terminal"
import { stopAllFreeTerminalProcesses } from "../packages/feature-terminal/src/services/terminal-resources"
import { type BenchmarkCase, defineBenchmark, measureBenchmark } from "./benchmarks/harness"
import { tuiActionBenchmarks } from "./benchmarks/tui-actions"

const BENCHMARK_KEYPRESS_LISTENER_BUDGET = 16

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("tab-switch and Terminal action latency in the native renderer", async () => {
  const { samples, warmup } = benchmarkCounts()
  const configRoot = process.env.XDG_CONFIG_HOME
  const project = process.env.TUIMINAL_WORKDIR
  if (!configRoot || !project) throw new Error("Missing isolated TUI fixture")
  const filename = join(project, "benchmark.sqlite")
  const database = new Database(filename, { create: true, strict: true })
  database.exec("CREATE TABLE benchmark (id INTEGER PRIMARY KEY, value TEXT)")
  database.close()
  const settings = join(configRoot, "tuiminal")
  mkdirSync(settings, { recursive: true })
  writeFileSync(
    join(settings, "databases.json"),
    JSON.stringify({
      version: 1,
      defaultConnectionId: "benchmark",
      connections: [
        {
          id: "benchmark",
          name: "Benchmark",
          driver: "sqlite",
          source: "saved",
          filename,
          ssl: false,
          writeEnabled: false,
        },
      ],
      savedQueries: {},
      queryHistory: [],
    }),
  )
  const previousOnlyTab = process.env.TUIMINAL_ONLY_TAB
  const previousHome = process.env.HOME
  const previousGitConfig = process.env.GIT_CONFIG_GLOBAL
  const previousGitNoSystem = process.env.GIT_CONFIG_NOSYSTEM
  const previousGitPrompt = process.env.GIT_TERMINAL_PROMPT
  delete process.env.TUIMINAL_ONLY_TAB
  process.env.HOME = project
  process.env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null"
  process.env.GIT_CONFIG_NOSYSTEM = "1"
  process.env.GIT_TERMINAL_PROMPT = "0"
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", project, ...args], { stdio: "pipe" })
  git("init", "-q", "-b", "main")
  git("config", "user.name", "Benchmark")
  git("config", "user.email", "benchmark@example.test")
  git("add", "--", "package.json")
  git("commit", "-qm", "Benchmark fixture")
  writeFileSync(join(project, "benchmark-git.txt"), "untracked benchmark fixture\n")
  writeFileSync(join(project, "benchmark.http"), "GET http://127.0.0.1:1/fixture\n")
  updateUiSettings({ language: "en" })
  let terminalPid = 900_000
  let codexEvents: codexServer.CodexAppServerEvents | undefined
  const terminalStart = spyOn(terminalProcesses, "startFreeTerminalProcess").mockImplementation(
    () => ({
      pid: ++terminalPid,
      write: () => undefined,
      resize: () => undefined,
      stop: async () => undefined,
    }),
  )
  const codexStart = spyOn(codexServer, "startCodexAppServerTerminal").mockImplementation(
    async (_options, events) => {
      codexEvents = events
      return {
        pid: ++terminalPid,
        backend: "native",
        write: () => undefined,
        resize: () => undefined,
        stop: async () => undefined,
      }
    },
  )
  const codexRefresh = spyOn(codexServer, "refreshCodexResumeThreads").mockResolvedValue([])
  const tui = await act(async () => testRender(createElement(App), { width: 160, height: 40 }))
  tui.renderer.keyInput.setMaxListeners(BENCHMARK_KEYPRESS_LISTENER_BUDGET)
  try {
    const destinations = [
      { tool: "database", key: "1", label: "Database" },
      { tool: "git", key: "2", label: "Git" },
      { tool: "runner", key: "3", label: "Runner" },
      { tool: "http", key: "4", label: "HTTP" },
      { tool: "terminal", key: "5", label: "Terminal" },
    ] as const
    async function switchTo(key: string, label: string) {
      await act(async () => tui.mockInput.pressKey(key, { meta: true }))
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await tui.renderOnce()
        const frame = tui.captureCharFrame()
        if (frame.includes(`◆ ${label} [Alt+${key}]`)) return frame
        await act(async () => Bun.sleep(5))
      }
      throw new Error(`Tab ${label} did not render`)
    }
    async function clickTab(key: string, label: string) {
      const header = tui.captureCharFrame().split("\n")[0] ?? ""
      const x = header.indexOf(`${label} [Alt+${key}]`)
      if (x < 0) throw new Error(`Missing ${label} tab in header`)
      await act(async () => tui.mockMouse.click(x + 2, 0, 0, { delayMs: 0 }))
      await tui.renderOnce()
      const frame = tui.captureCharFrame()
      if (!frame.includes(`◆ ${label} [Alt+${key}]`)) {
        throw new Error(`Mouse could not select ${label}`)
      }
      return frame
    }
    async function waitForUi(condition: () => boolean, action: string) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await act(async () => tui.renderOnce())
        if (condition()) return tui.captureCharFrame()
        await act(async () => Bun.sleep(5))
      }
      throw new Error(`${action} did not render:\n${tui.captureCharFrame()}`)
    }
    async function focus(id: string) {
      const target = tui.renderer.root.findDescendantById(id)
      if (!target) throw new Error(`Missing focus target ${id}`)
      act(() => target.focus())
      await tui.renderOnce()
    }
    async function click(id: string) {
      const target = tui.renderer.root.findDescendantById(id)
      if (!target) throw new Error(`Missing mouse target ${id}`)
      await act(async () =>
        tui.mockMouse.click(
          target.screenX + Math.max(0, Math.floor(target.width / 2)),
          target.screenY + Math.max(0, Math.floor(target.height / 2)),
          0,
          { delayMs: 0 },
        ),
      )
      await tui.renderOnce()
    }
    await switchTo("3", "Runner")
    const cases: BenchmarkCase[] = destinations.flatMap((destination) => [
      defineBenchmark({
        id: `ui.tab_${destination.tool}`,
        tool: destination.tool,
        description: `Keyboard tab switch to ${destination.label}, input to rendered frame`,
        beforeEach: async () => {
          if (destination.key === "3") await clickTab("2", "Git")
          else await clickTab("3", "Runner")
        },
        run: () => switchTo(destination.key, destination.label),
        verify: (frame) => {
          if (!frame.includes(`◆ ${destination.label} [Alt+${destination.key}]`)) {
            throw new Error(`Missing ${destination.label} frame`)
          }
        },
      }),
      defineBenchmark({
        id: `ui.mouse_tab_${destination.tool}`,
        tool: destination.tool,
        description: `Mouse tab switch to ${destination.label}, click to rendered frame`,
        beforeEach: async () => {
          if (destination.key === "3") await clickTab("2", "Git")
          else await clickTab("3", "Runner")
        },
        run: () => clickTab(destination.key, destination.label),
        verify: (frame) => {
          if (!frame.includes(`◆ ${destination.label} [Alt+${destination.key}]`)) {
            throw new Error(`Missing ${destination.label} mouse frame`)
          }
        },
      }),
    ])
    let masterKeyOpen = false
    cases.push(
      defineBenchmark({
        id: "ui.terminal_master_key",
        tool: "terminal",
        description: "Open the Terminal Master Key action strip from keyboard input",
        beforeEach: async () => {
          if (masterKeyOpen) {
            await act(async () => tui.mockInput.pressKey("escape"))
            await tui.renderOnce()
            masterKeyOpen = false
          }
          await clickTab("5", "Terminal")
          await act(async () => tui.mockMouse.click(80, 10, 0, { delayMs: 0 }))
          await tui.renderOnce()
        },
        run: async () => {
          await act(async () => tui.mockInput.pressKey("b", { ctrl: true }))
          for (let attempt = 0; attempt < 100; attempt += 1) {
            await tui.renderOnce()
            const frame = tui.captureCharFrame()
            if (frame.includes("Master Key")) {
              masterKeyOpen = true
              return frame
            }
            await act(async () => Bun.sleep(5))
          }
          throw new Error("Terminal Master Key did not render")
        },
        verify: (frame) => {
          if (!frame.includes("Master Key")) throw new Error("Terminal actions missing")
        },
      }),
    )
    cases.push(
      ...tuiActionBenchmarks({
        tui,
        switchTo,
        clickTab,
        waitForUi,
        focus,
        click,
        codexEvents: () => codexEvents,
      }),
    )
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(22)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
      )
    }
    const keypressListeners = tui.renderer.keyInput.listenerCount("keypress")
    if (keypressListeners > BENCHMARK_KEYPRESS_LISTENER_BUDGET) {
      throw new Error(`TUI benchmark exceeded its keypress listener budget: ${keypressListeners}`)
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
    act(() => {
      tui.renderer.destroy()
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    })
    await stopAllFreeTerminalProcesses()
    terminalStart.mockRestore()
    codexStart.mockRestore()
    codexRefresh.mockRestore()
    if (previousOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
    else process.env.TUIMINAL_ONLY_TAB = previousOnlyTab
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousGitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = previousGitConfig
    if (previousGitNoSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM
    else process.env.GIT_CONFIG_NOSYSTEM = previousGitNoSystem
    if (previousGitPrompt === undefined) delete process.env.GIT_TERMINAL_PROMPT
    else process.env.GIT_TERMINAL_PROMPT = previousGitPrompt
  }
}, 120_000)
