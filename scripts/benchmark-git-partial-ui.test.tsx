import "../tests/tui/setup"
import { test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import { GitBaseWorkspace } from "../packages/feature-git/src/GitWorkspace"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("Git partial-stage and folder-action latency in the native interface", async () => {
  const { samples, warmup } = benchmarkCounts()
  if (!process.env.TUIMINAL_WORKDIR || !process.env.XDG_CONFIG_HOME) {
    throw new Error("Missing isolated Git TUI fixture")
  }
  const root = mkdtempSync(join(tmpdir(), "tuiminal-benchmark-git-ui-"))
  const previousSettings = getUiSettings()
  const previousGitGlobal = process.env.GIT_CONFIG_GLOBAL
  const previousGitNoSystem = process.env.GIT_CONFIG_NOSYSTEM
  const previousGitPrompt = process.env.GIT_TERMINAL_PROMPT
  process.env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null"
  process.env.GIT_CONFIG_NOSYSTEM = "1"
  process.env.GIT_TERMINAL_PROMPT = "0"
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" })
  const path = join(root, "partial.txt")
  const folder = join(root, "aaa")
  const first = join(folder, "one.txt")
  const second = join(folder, "two.txt")
  const outside = join(root, "zzz.txt")
  const original = "one\ntwo\nthree\nfour\nfive\nsix\n"
  const modified = "one\nADDED_A\ntwo\nthree\nfour\nfive\nADDED_B\nsix\n"
  let tui: Awaited<ReturnType<typeof testRender>> | undefined
  async function waitFor(condition: () => boolean, label: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await tui?.renderOnce()
      if (condition()) return tui?.captureCharFrame() ?? ""
      await act(async () => Bun.sleep(10))
    }
    throw new Error(`Git TUI did not show ${label}:\n${tui?.captureCharFrame()}`)
  }
  async function press(key: string) {
    await act(async () => {
      if (key === "enter") tui?.mockInput.pressEnter()
      else if (key === "space") tui?.mockInput.pressKey(" ")
      else tui?.mockInput.pressKey(key)
    })
    await tui?.renderOnce()
  }
  async function openPartialStage(staged: boolean) {
    await press("s")
    await waitFor(
      () =>
        Boolean(
          tui?.renderer.root.findDescendantById(
            staged
              ? "git-partial-stage-selected-staged-hunk:0"
              : "git-partial-stage-available-unstaged-hunk:0",
          ),
        ),
      "loaded partial-stage hunk",
    )
  }
  async function reset(openPartial: boolean, staged = false) {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
    git("restore", "--staged", "--", "partial.txt")
    writeFileSync(path, modified)
    if (staged) git("add", "--", "partial.txt")
    tui = await act(async () =>
      testRender(createElement(GitBaseWorkspace, { active: true, targetDirectory: root }), {
        width: 120,
        height: 34,
      }),
    )
    await waitFor(
      () => Boolean(tui?.renderer.root.findDescendantById("git-file-list-row-0")),
      "changed file row",
    )
    await waitFor(
      () => (tui?.renderer.currentFocusedRenderable?.id ?? "").startsWith("git-file-list-row-"),
      "focused file row",
    )
    await press("enter")
    await waitFor(
      () => tui?.renderer.currentFocusedRenderable?.id === "git-base-diff",
      "focused Git diff",
    )
    if (openPartial) await openPartialStage(staged)
  }
  async function resetFolder(staged = false) {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
    git("restore", "--staged", "--", ".")
    writeFileSync(path, original)
    writeFileSync(first, "base one\nchanged one\n")
    writeFileSync(second, "base two\nchanged two\n")
    writeFileSync(outside, "base outside\nkeep outside\n")
    if (staged) git("add", "--", "aaa/one.txt", "aaa/two.txt")
    tui = await act(async () =>
      testRender(createElement(GitBaseWorkspace, { active: true, targetDirectory: root }), {
        width: 120,
        height: 34,
      }),
    )
    await waitFor(
      () => Boolean(tui?.renderer.root.findDescendantById("git-file-list-row-0")),
      "changed folder row",
    )
    act(() => tui?.renderer.root.findDescendantById("git-file-list-row-1")?.focus())
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await press("k")
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      if (tui.renderer.currentFocusedRenderable?.id === "git-file-list-row-0") break
    }
    if (tui.renderer.currentFocusedRenderable?.id !== "git-file-list-row-0")
      throw new Error("Missing folder focus")
  }
  try {
    git("init", "-q", "-b", "main")
    git("config", "user.name", "Benchmark")
    git("config", "user.email", "benchmark@example.test")
    writeFileSync(path, original)
    mkdirSync(folder)
    writeFileSync(first, "base one\n")
    writeFileSync(second, "base two\n")
    writeFileSync(outside, "base outside\n")
    git("add", "--", ".")
    git("commit", "-qm", "Partial-stage TUI fixture")
    updateUiSettings({ layout: "framed", language: "pt-BR" })
    const cases = [
      defineBenchmark({
        id: "ui.git_graph_open",
        tool: "git",
        description: "Open the complete mounted commit graph from a focused diff",
        beforeEach: () => reset(false),
        run: async () => {
          await press("g")
          return waitFor(
            () =>
              (tui?.captureCharFrame() ?? "").includes("ÁRVORE DE COMMITS") &&
              (tui?.captureCharFrame() ?? "").includes("Partial-stage TUI fixture"),
            "complete commit graph",
          )
        },
        verify: (frame) => {
          if (
            !frame.includes("ÁRVORE DE COMMITS") ||
            !frame.includes("Partial-stage TUI fixture")
          ) {
            throw new Error("Mounted Git graph did not render the fixture commit")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_log_open",
        tool: "git",
        description: "Open the detailed mounted commit log from a focused diff",
        beforeEach: () => reset(false),
        run: async () => {
          await press("o")
          return waitFor(
            () => Boolean(tui?.renderer.root.findDescendantById("git-base-log-row-0")),
            "detailed commit log",
          )
        },
        verify: (frame) => {
          if (
            !frame.includes("HISTÓRICO DE COMMITS") ||
            !frame.includes("Partial-stage TUI fixture")
          ) {
            throw new Error("Mounted Git log did not render the fixture commit")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_diff_layout",
        tool: "git",
        description: "Switch the mounted file diff from unified to two-column layout",
        beforeEach: () => reset(false),
        run: async () => {
          await press("v")
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("[V] 2 colunas"),
            "two-column diff layout",
          )
        },
        verify: (frame) => {
          if (!frame.includes("[V] 2 colunas") || !frame.includes("ADDED_A")) {
            throw new Error("Mounted Git diff did not switch layout with its content intact")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_partial_open",
        tool: "git",
        description: "Open partial staging from a focused diff until both native panes load",
        beforeEach: () => reset(false),
        run: async () => {
          await openPartialStage(false)
          return tui?.captureCharFrame() ?? ""
        },
        verify: (frame) => {
          if (
            !frame.includes("STAGE PARCIAL · UNIFICADO") ||
            !frame.includes("FORA DO STAGE") ||
            !frame.includes("NO STAGE")
          ) {
            throw new Error("Git partial-stage panes did not render")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_partial_line_apply",
        tool: "git",
        description: "Select one line in the mounted partial-stage panes and apply it",
        beforeEach: () => reset(true),
        run: async () => {
          await press("s")
          await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("[S] Modo: linha"),
            "line mode",
          )
          await press("space")
          await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("1 selecionado(s)"),
            "one selected line",
          )
          await press("enter")
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("Stage parcial aplicado."),
            "applied partial stage",
          )
        },
        verify: (frame) => {
          const indexed = git("diff", "--cached", "--", "partial.txt")
          const worktree = git("diff", "--", "partial.txt")
          if (
            !frame.includes("Stage parcial aplicado.") ||
            !indexed.includes("+ADDED_A") ||
            indexed.includes("+ADDED_B") ||
            !worktree.includes("+ADDED_B") ||
            worktree.includes("+ADDED_A") ||
            readFileSync(path, "utf8") !== modified
          ) {
            throw new Error("Mounted line-level stage changed the wrong Git state")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_partial_line_unstage",
        tool: "git",
        description: "Return one staged line to the worktree from the mounted partial-stage pane",
        beforeEach: () => reset(true, true),
        run: async () => {
          await press("s")
          await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("[S] Modo: linha"),
            "line mode",
          )
          await press("l")
          await waitFor(
            () => tui?.renderer.currentFocusedRenderable?.id === "git-partial-stage-selected",
            "selected partial-stage pane",
          )
          await press("space")
          await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("1 selecionado(s)"),
            "one remaining staged line",
          )
          await press("enter")
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("Stage parcial aplicado."),
            "reversed partial stage",
          )
        },
        verify: (frame) => {
          const indexed = git("diff", "--cached", "--", "partial.txt")
          const worktree = git("diff", "--", "partial.txt")
          if (
            !frame.includes("Stage parcial aplicado.") ||
            indexed.includes("+ADDED_A") ||
            !indexed.includes("+ADDED_B") ||
            !worktree.includes("+ADDED_A") ||
            worktree.includes("+ADDED_B") ||
            readFileSync(path, "utf8") !== modified
          ) {
            throw new Error("Mounted reverse partial stage changed the wrong Git state")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_folder_stage",
        tool: "git",
        description: "Stage a selected two-file folder from the native file tree",
        beforeEach: () => resetFolder(),
        run: async () => {
          await press("space")
          return waitFor(
            () =>
              (tui?.captureCharFrame() ?? "").includes(
                "Alterações selecionadas adicionadas ao stage.",
              ),
            "folder staged",
          )
        },
        verify: (frame) => {
          const indexed = git("diff", "--cached", "--name-only").trim()
          if (
            !frame.includes("Alterações selecionadas adicionadas ao stage.") ||
            indexed !== "aaa/one.txt\naaa/two.txt" ||
            readFileSync(outside, "utf8") !== "base outside\nkeep outside\n"
          ) {
            throw new Error("Mounted folder stage affected the wrong files")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_folder_unstage",
        tool: "git",
        description: "Unstage a selected two-file folder from the native file tree",
        beforeEach: () => resetFolder(true),
        run: async () => {
          await press("space")
          return waitFor(
            () =>
              (tui?.captureCharFrame() ?? "").includes(
                "Alterações selecionadas removidas do stage.",
              ),
            "folder unstaged",
          )
        },
        verify: (frame) => {
          const indexed = git("diff", "--cached", "--name-only").trim()
          const worktree = git("diff", "--name-only").trim()
          if (
            !frame.includes("Alterações selecionadas removidas do stage.") ||
            indexed ||
            worktree !== "aaa/one.txt\naaa/two.txt\nzzz.txt"
          ) {
            throw new Error("Mounted folder unstage affected the wrong files")
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_folder_discard_open",
        tool: "git",
        description: "Open the exact-target folder discard confirmation",
        beforeEach: () => resetFolder(),
        run: async () => {
          await press("d")
          return waitFor(
            () => Boolean(tui?.renderer.root.findDescendantById("git-discard-changes-modal")),
            "folder discard confirmation",
          )
        },
        verify: (frame) => {
          if (
            !frame.includes("DESCARTAR ALTERAÇÕES DO GIT?") ||
            !frame.includes("2 arquivos serão afetados")
          ) {
            throw new Error(
              `Git folder discard confirmation did not identify both files:\n${frame}`,
            )
          }
        },
      }),
      defineBenchmark({
        id: "ui.git_folder_discard_confirm",
        tool: "git",
        description: "Confirm folder discard by keyboard until tracked files are restored",
        beforeEach: async () => {
          await resetFolder()
          await press("d")
          await waitFor(
            () => Boolean(tui?.renderer.root.findDescendantById("git-confirm-discard")),
            "visible discard button",
          )
        },
        run: async () => {
          await press("d")
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("Alterações selecionadas descartadas."),
            "folder discarded",
          )
        },
        verify: (frame) => {
          if (
            !frame.includes("Alterações selecionadas descartadas.") ||
            readFileSync(first, "utf8") !== "base one\n" ||
            readFileSync(second, "utf8") !== "base two\n" ||
            readFileSync(outside, "utf8") !== "base outside\nkeep outside\n" ||
            git("diff", "--name-only").trim() !== "zzz.txt"
          ) {
            throw new Error("Mounted folder discard affected the wrong files")
          }
        },
      }),
    ]
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(26)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
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
    updateUiSettings(previousSettings)
    if (previousGitGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = previousGitGlobal
    if (previousGitNoSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM
    else process.env.GIT_CONFIG_NOSYSTEM = previousGitNoSystem
    if (previousGitPrompt === undefined) delete process.env.GIT_TERMINAL_PROMPT
    else process.env.GIT_TERMINAL_PROMPT = previousGitPrompt
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)
