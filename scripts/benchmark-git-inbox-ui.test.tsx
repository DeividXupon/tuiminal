import "../tests/tui/setup"
import { test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import { InboxWorkspace } from "../packages/feature-git/src/InboxWorkspace"
import { installBenchmarkGh } from "./benchmarks/fake-gh"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("Git Inbox remote list load, pagination, and refresh latency", async () => {
  if (!process.env.TUIMINAL_WORKDIR || !process.env.XDG_CONFIG_HOME) {
    throw new Error("Missing isolated Git TUI fixture")
  }
  const { samples, warmup } = benchmarkCounts()
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-git-inbox-ui-"))
  const revisionFile = join(root, "revision.txt")
  const settings = getUiSettings()
  const envKeys = [
    "TUIMINAL_GH_EXECUTABLE",
    "BENCHMARK_GH_INBOX_REVISION_FILE",
    "TUIMINAL_GIT_INBOX_DEMO",
    "GH_CONFIG_DIR",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_TERMINAL_PROMPT",
  ] as const
  const previousEnv = envKeys.map((key) => process.env[key])
  let tui: Awaited<ReturnType<typeof testRender>> | undefined

  function frame() {
    return tui?.captureCharFrame() ?? ""
  }
  function revision() {
    return existsSync(revisionFile) ? Number(readFileSync(revisionFile, "utf8")) : 0
  }
  async function waitFor(condition: () => boolean, label: string) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await act(async () => {
        await Bun.sleep(10)
        await tui?.renderOnce()
      })
      if (condition()) return frame()
    }
    throw new Error(`Git Inbox did not show ${label}:\n${frame()}`)
  }
  async function clear() {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
      await Bun.sleep(20)
    }
    rmSync(revisionFile, { force: true })
  }
  async function mount() {
    tui = await act(async () =>
      testRender(createElement(InboxWorkspace, { active: true }), { width: 140, height: 36 }),
    )
    return waitFor(
      () =>
        frame().includes("Benchmark notification 1 revision 1") &&
        Boolean(tui?.renderer.root.findDescendantById("git-inbox-row-0")),
      "first remote page",
    )
  }
  async function refresh() {
    act(() => tui?.mockInput.pressKey("r"))
    await tui?.renderOnce()
    return waitFor(
      () => frame().includes("Benchmark notification 1 revision 2"),
      "refreshed remote page",
    )
  }
  async function press(key: string) {
    await act(async () => tui?.mockInput.pressKey(key))
    await tui?.renderOnce()
  }
  async function moveNearPageEnd() {
    for (let index = 0; index < 18; index += 1) await press("j")
    await waitFor(
      () => (frame().match(/▶[^\n]*●[^\n]*team\/repo/) ?? []).length === 1,
      "penultimate first-page notification",
    )
  }

  try {
    process.env.TUIMINAL_GH_EXECUTABLE = installBenchmarkGh(root)
    process.env.BENCHMARK_GH_INBOX_REVISION_FILE = revisionFile
    delete process.env.TUIMINAL_GIT_INBOX_DEMO
    process.env.GH_CONFIG_DIR = join(root, "gh-config")
    process.env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null"
    process.env.GIT_CONFIG_NOSYSTEM = "1"
    process.env.GIT_TERMINAL_PROMPT = "0"
    delete process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
    updateUiSettings({ layout: "framed", language: "pt-BR" })

    const cases = [
      defineBenchmark({
        id: "ui.git_inbox_remote_open",
        tool: "git",
        description: "Mount Inbox through fake gh authentication and first rendered page",
        beforeEach: clear,
        run: mount,
        verify: (rendered) => {
          if (!rendered.includes("Benchmark notification 1 revision 1") || revision() !== 1) {
            throw new Error("Inbox initial remote page did not load exactly once")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_inbox_remote_pagination",
        tool: "git",
        description: "Select the final notification and render the automatically loaded next page",
        beforeEach: async () => {
          await clear()
          await mount()
          await moveNearPageEnd()
        },
        run: async () => {
          await press("j")
          return waitFor(
            () => Boolean(tui?.renderer.root.findDescendantById("git-inbox-row-24")),
            "second notification page",
          )
        },
        verify: () => {
          if (!tui?.renderer.root.findDescendantById("git-inbox-row-24") || revision() !== 2) {
            throw new Error("Inbox automatic pagination did not render exactly one next page")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_inbox_remote_refresh",
        tool: "git",
        description: "Refresh mounted Inbox until the next fake gh page renders",
        beforeEach: async () => {
          await clear()
          await mount()
        },
        run: refresh,
        verify: (rendered) => {
          if (!rendered.includes("Benchmark notification 1 revision 2") || revision() !== 2) {
            throw new Error("Inbox refresh did not render a new remote response")
          }
        },
      }),
    ]
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(30)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
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
    await clear()
    updateUiSettings(settings)
    for (const [index, key] of envKeys.entries()) {
      const previous = previousEnv[index]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)
