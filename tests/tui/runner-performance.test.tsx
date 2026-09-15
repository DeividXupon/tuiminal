import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import * as service from "../../packages/feature-runner/src/services/runner"
import * as rendering from "../../packages/feature-runner/src/rendering/log-document"
import * as storage from "../../packages/feature-runner/src/storage/runner-config"
import {
  RUNNER_LOG_BUFFER_LIMIT,
  RUNNER_LOG_BUFFER_MAX_CHARS,
  RUNNER_LOG_ENTRY_MAX_CHARS,
  RUNNER_LOG_FLUSH_INTERVAL_MS,
} from "../../packages/feature-runner/src/model/log-buffer"

let tui: TestRendererSetup | undefined
let callbacks: service.RunnerProcessCallbacks | undefined
const restores: Array<() => void> = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  callbacks = undefined
  for (const restore of restores.splice(0)) restore()
})

async function mountRunner(pid: number | null = null) {
  // Simulated process exits must not become persisted history for sibling TUI fixtures.
  const history = spyOn(storage, "saveRunnerHistoryEntry").mockImplementation(() => {})
  restores.push(() => history.mockRestore())
  const spawn = spyOn(service, "startRunnerProcess").mockImplementation(
    (_root, _command, handlers) => {
      callbacks = handlers
      return { pid, interactive: false, write: () => {}, stop: async () => {} }
    },
  )
  restores.push(() => spawn.mockRestore())
  tui = await testRender(<Runner active />, { width: 140, height: 32 })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(5))
    await tui.renderOnce()
    if (tui.renderer.currentFocusedRenderable?.id === "runner-command-list") break
  }
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-command-list")
  await act(async () => {
    tui?.renderer.root.findDescendantById("runner-command-input")?.focus()
    await tui?.mockInput.typeText("fixture-output")
  })
  await act(async () => tui?.mockInput.pressEnter())
  await tui.renderOnce()
  expect(callbacks).toBeDefined()
}

async function flush() {
  await act(async () => Bun.sleep(RUNNER_LOG_FLUSH_INTERVAL_MS + 20))
  await tui?.renderOnce()
}

test("Runner resolves the launch scope only once despite log and resize renders", async () => {
  const scope = spyOn(service, "resolveRunnerSessionScope")
  restores.push(() => scope.mockRestore())
  await mountRunner()
  const initialCalls = scope.mock.calls.length
  expect(initialCalls).toBe(1)
  act(() => callbacks?.onLine("new output", "stdout"))
  await flush()
  await act(async () => tui?.resize(150, 36))
  await tui?.renderOnce()
  expect(scope.mock.calls).toHaveLength(initialCalls)
})

test("clearing logs also discards output waiting for the next batched render", async () => {
  await mountRunner()
  act(() => {
    callbacks?.onLine("BEFORE_CLEAR", "stdout")
    tui?.mockInput.pressKey("c")
  })
  await flush()
  expect(tui?.captureCharFrame()).not.toContain("BEFORE_CLEAR")
  act(() => callbacks?.onLine("AFTER_CLEAR", "stdout"))
  await flush()
  expect(tui?.captureCharFrame()).toContain("AFTER_CLEAR")
})

test("single and multi Runner logs preserve original output in another UI language", async () => {
  const settings = getUiSettings()
  try {
    updateUiSettings({ language: "en" })
    await mountRunner()
    act(() => callbacks?.onLine("Nenhum processo ativo.", "stdout"))
    await flush()
    expect(tui?.captureCharFrame()).toContain("Nenhum processo ativo.")
    act(() => tui?.mockInput.pressKey("m"))
    await tui?.renderOnce()
    expect(tui?.captureCharFrame()).toContain("MULTI")
    expect(tui?.captureCharFrame()).toContain("Nenhum processo ativo.")
  } finally {
    updateUiSettings(settings)
  }
})

test("a log burst gives the renderer the same line and text budgets as retained output", async () => {
  const document = spyOn(rendering, "buildRunnerLogDocument")
  restores.push(() => document.mockRestore())
  await mountRunner()
  const calls = document.mock.calls.length
  act(() => {
    for (let index = 0; index < 2_000; index += 1) {
      callbacks?.onLine(`${index}: ${"x".repeat(RUNNER_LOG_ENTRY_MAX_CHARS * 2)}`, "stdout")
    }
    callbacks?.onLine("BURST_END", "stdout")
  })
  await flush()
  const logs = document.mock.calls.at(-1)?.[0] ?? []
  expect(logs.length).toBeGreaterThan(0)
  expect(logs.length).toBeLessThanOrEqual(RUNNER_LOG_BUFFER_LIMIT)
  expect(Math.max(...logs.map((log) => log.text.length))).toBeLessThanOrEqual(
    RUNNER_LOG_ENTRY_MAX_CHARS,
  )
  expect(logs.reduce((total, log) => total + log.text.length, 0)).toBeLessThanOrEqual(
    RUNNER_LOG_BUFFER_MAX_CHARS,
  )
  expect(logs.at(-1)?.text).toBe("BURST_END")
  expect(document.mock.calls.length - calls).toBe(1)
})

test("exit includes the unflushed tail and releases the execution's live buffer", async () => {
  const document = spyOn(rendering, "buildRunnerLogDocument")
  restores.push(() => document.mockRestore())
  await mountRunner()
  act(() => {
    callbacks?.onLine("LAST_OUTPUT", "stdout")
    callbacks?.onExit({ code: 0, signal: null, stopped: false })
  })
  await tui?.renderOnce()
  const completed = document.mock.calls.at(-1)?.[0] ?? []
  expect(completed.map((log) => log.text)).toContain("LAST_OUTPUT")
  expect(completed.at(-1)?.text).toBe("processo concluído")
  const calls = document.mock.calls.length
  act(() => callbacks?.onLine("LATE_OUTPUT", "stdout"))
  await flush()
  expect(document.mock.calls).toHaveLength(calls)
  expect(tui?.captureCharFrame()).not.toContain("LATE_OUTPUT")
})

test("port polling waits for each probe and aborts the pending one on unmount", async () => {
  const pending: Array<(ports: service.RunnerListeningPort[]) => void> = []
  const probe = spyOn(service, "discoverRunnerListeningPorts").mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  )
  restores.push(() => probe.mockRestore())
  try {
    await mountRunner(42)
    expect(probe).toHaveBeenCalledTimes(1)
    await act(async () => Bun.sleep(1_600))
    expect(probe).toHaveBeenCalledTimes(1)
    await act(async () => pending[0]?.([]))
    await act(async () => Bun.sleep(1_600))
    expect(probe).toHaveBeenCalledTimes(2)
    const signal = probe.mock.calls[1]?.[1]
    expect(signal?.aborted).toBe(false)
    act(() => tui?.renderer.destroy())
    tui = undefined
    expect(signal?.aborted).toBe(true)
  } finally {
    await act(async () => {
      for (const resolve of pending) resolve([])
    })
  }
}, 10_000)
