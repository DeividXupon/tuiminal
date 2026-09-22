import "../tests/tui/setup"
import { test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import { IssuesWorkspace } from "../packages/feature-git/src/IssuesWorkspace"
import { PullRequestsWorkspace } from "../packages/feature-git/src/PullRequestsWorkspace"
import {
  ISSUE_CONFIG_PATH,
  loadIssueConfig,
  saveIssueConfig,
} from "../packages/feature-git/src/storage/issue/config"
import {
  loadPullRequestConfig,
  PULL_REQUEST_CONFIG_PATH,
  savePullRequestConfig,
} from "../packages/feature-git/src/storage/pr/config"
import { installBenchmarkGh } from "./benchmarks/fake-gh"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("Git remote PR and Issue list load and refresh latency", async () => {
  const projectRoot = process.env.TUIMINAL_WORKDIR ?? ""
  if (!projectRoot || !process.env.XDG_CONFIG_HOME) {
    throw new Error("Missing isolated Git TUI fixture")
  }
  const { samples, warmup } = benchmarkCounts()
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-git-remote-ui-"))
  const revisionFile = join(root, "revision.txt")
  const settings = getUiSettings()
  const configPaths = [PULL_REQUEST_CONFIG_PATH, ISSUE_CONFIG_PATH]
  const configSnapshots = configPaths.map((path) => (existsSync(path) ? readFileSync(path) : null))
  const envKeys = [
    "TUIMINAL_GH_EXECUTABLE",
    "BENCHMARK_GH_REVISION_FILE",
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
    throw new Error(`Git remote UI did not show ${label}:\n${frame()}`)
  }
  async function clear() {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
      await Bun.sleep(20)
    }
    rmSync(revisionFile, { force: true })
  }
  async function mount(kind: "pr" | "issue") {
    tui = await act(async () =>
      testRender(
        createElement(kind === "pr" ? PullRequestsWorkspace : IssuesWorkspace, { active: true }),
        { width: 140, height: 36 },
      ),
    )
    return waitFor(
      () =>
        frame().includes("Benchmark item 1 revision 1") &&
        Boolean(tui?.renderer.root.findDescendantById(`git-${kind}-row-0`)),
      `${kind} first remote page`,
    )
  }
  async function refresh(kind: "pr" | "issue") {
    act(() => tui?.mockInput.pressKey("r"))
    await tui?.renderOnce()
    return waitFor(
      () =>
        frame().includes("Benchmark item 1 revision 2") &&
        !frame().includes("ATUALIZANDO TODAS AS SEÇÕES"),
      `${kind} refreshed remote page`,
    )
  }

  try {
    process.env.TUIMINAL_GH_EXECUTABLE = installBenchmarkGh(root)
    process.env.BENCHMARK_GH_REVISION_FILE = revisionFile
    process.env.GH_CONFIG_DIR = join(root, "gh-config")
    process.env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null"
    process.env.GIT_CONFIG_NOSYSTEM = "1"
    process.env.GIT_TERMINAL_PROMPT = "0"
    delete process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
    updateUiSettings({ layout: "framed", language: "pt-BR" })
    const prConfig = loadPullRequestConfig().config
    prConfig.profiles[projectRoot] = {
      host: "github.com",
      repositories: ["team/repo"],
      sections: [{ id: "mine", title: "My PRs", query: "is:open author:@me" }],
    }
    savePullRequestConfig(prConfig)
    const issueConfig = loadIssueConfig().config
    issueConfig.profiles[projectRoot] = {
      host: "github.com",
      repositories: ["team/repo"],
      sections: [{ id: "created", title: "Benchmark Issues", query: "is:open author:@me" }],
    }
    saveIssueConfig(issueConfig)

    const cases = (["pr", "issue"] as const).flatMap((kind) => [
      defineBenchmark({
        id: `ui.git_${kind}_remote_open`,
        tool: "git",
        description: `Mount ${kind} dashboard through fake gh authentication and first rendered page`,
        beforeEach: clear,
        run: () => mount(kind),
        verify: (rendered) => {
          if (!rendered.includes("Benchmark item 1 revision 1") || revision() !== 1) {
            throw new Error(`${kind} initial remote page did not load exactly once`)
          }
        },
      }),
      defineBenchmark({
        id: `ui.git_${kind}_remote_refresh`,
        tool: "git",
        description: `Refresh mounted ${kind} dashboard until the next fake gh page renders`,
        beforeEach: async () => {
          await clear()
          await mount(kind)
        },
        run: () => refresh(kind),
        verify: (rendered) => {
          if (!rendered.includes("Benchmark item 1 revision 2") || revision() !== 2) {
            throw new Error(`${kind} refresh did not render a new remote response`)
          }
        },
      }),
    ])
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
    for (const [index, path] of configPaths.entries()) {
      const snapshot = configSnapshots[index]
      if (snapshot) writeFileSync(path, snapshot)
      else rmSync(path, { force: true })
    }
    for (const [index, key] of envKeys.entries()) {
      const previous = previousEnv[index]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)
