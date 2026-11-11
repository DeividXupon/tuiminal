import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { useAgentResumeThreads } from "../../packages/feature-terminal/src/hooks/use-agent-resume-threads"
import type { AgentProviderId } from "../../packages/feature-terminal/src/model/agent-provider"
import type {
  AgentResumeSource,
  AgentResumeThread,
} from "../../packages/feature-terminal/src/model/agent-resume-thread"
import {
  mergeClaudeResumeThreads,
  resetClaudeResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/claude-resume-threads"
import {
  publishCodexResumeThreads,
  resetCodexResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/codex-resume-threads"
import {
  publishOpenCodeResumeThreads,
  resetOpenCodeResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/opencode-resume-threads"
import * as claude from "../../packages/feature-terminal/src/services/claude-background"
import * as localClaude from "../../packages/feature-terminal/src/services/claude-local-resume"
import * as claudeStore from "../../packages/feature-terminal/src/services/claude-resume-store"
import * as codex from "../../packages/feature-terminal/src/services/codex-app-server"
import * as opencode from "../../packages/feature-terminal/src/services/opencode-server"
import { TerminalActions } from "../../packages/feature-terminal/src/ui/TerminalActions"

let tui: TestRendererSetup | undefined
const restorers: (() => void)[] = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const restore of restorers.splice(0).reverse()) restore()
  resetClaudeResumeThreadsForTests()
  resetCodexResumeThreadsForTests()
  resetOpenCodeResumeThreadsForTests()
})

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!predicate() && Date.now() < deadline) {
    await act(async () => Bun.sleep(5))
    await tui?.renderOnce()
  }
  expect(predicate()).toBe(true)
  await tui?.renderOnce()
}

async function fixture(remote = true, initialFailures: AgentResumeSource[] = []) {
  const settings = getUiSettings()
  restorers.push(() => updateUiSettings(settings))
  const profile = { id: "synthetic-host", name: "Synthetic host", host: "synthetic-host" }
  updateUiSettings({
    terminalRemoteCodexProfiles: remote ? [profile] : [],
    terminalRemoteCodexActiveProfileId: remote ? profile.id : "",
  })
  for (const provider of ["CODEX", "CLAUDE", "OPENCODE"]) {
    const name = `TUIMINAL_TERMINAL_${provider}_RESUME`
    const previous = process.env[name]
    restorers.push(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
    process.env[name] = "1"
  }
  let fresh = false
  const failures = new Set<AgentResumeSource>(initialFailures)
  const calls: AgentResumeSource[] = []
  const requestedLimits: number[] = []
  let heldSource: AgentResumeSource | undefined
  const pending: { signal: AbortSignal; release: () => void }[] = []
  const page = async (
    provider: AgentProviderId,
    origin: "local" | "remote",
    signal: AbortSignal,
    limit = 12,
  ) => {
    const source: AgentResumeSource = `${provider}:${origin}`
    calls.push(source)
    requestedLimits.push(limit)
    signal.throwIfAborted()
    if (heldSource === source)
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener("abort", abort, { once: true })
        pending.push({
          signal,
          release: () => {
            signal.removeEventListener("abort", abort)
            resolve()
          },
        })
      })
    signal.throwIfAborted()
    if (failures.has(source)) throw new Error("synthetic source unavailable")
    const threads: AgentResumeThread[] = fresh
      ? [
          {
            id: `fresh-${provider}-${origin}`,
            title: `fresh ${provider} ${origin}`,
            preview: "",
            lastResponse: "",
            cwd: "/synthetic/project",
            projectName: "project",
            gitBranch: "main",
            state: "idle",
            updatedAt: Date.now(),
            ...(origin === "remote"
              ? { remoteProfileId: profile.id, remoteProfileName: profile.name }
              : {}),
          },
        ]
      : []
    const publish = {
      codex: publishCodexResumeThreads,
      claude: mergeClaudeResumeThreads,
      opencode: publishOpenCodeResumeThreads,
    }[provider]
    publish(threads, origin === "remote" ? profile.id : undefined)
    return { threads, nextCursor: null, hasMore: false }
  }
  const mocks = [
    spyOn(codex, "loadCodexResumeThreadsPage").mockImplementation((_cwd, signal, options) =>
      page("codex", "local", signal, options?.limit),
    ),
    spyOn(codex, "loadRemoteCodexResumeThreadsPage").mockImplementation(
      (_profile, signal, options) => page("codex", "remote", signal, options?.limit),
    ),
    spyOn(opencode, "loadOpenCodeResumeThreadsPage").mockImplementation((_cwd, signal, limit) =>
      page("opencode", "local", signal, limit),
    ),
    spyOn(opencode, "loadRemoteOpenCodeResumeThreadsPage").mockImplementation(
      (_profile, signal, limit) => page("opencode", "remote", signal, limit),
    ),
    spyOn(localClaude, "loadLocalClaudeResumeThreadsPage").mockImplementation((signal, limit) =>
      page("claude", "local", signal, limit),
    ),
    spyOn(claude, "loadRemoteClaudeResumeThreadsPage").mockImplementation(
      (_profile, signal, limit) => page("claude", "remote", signal, limit),
    ),
    spyOn(claudeStore, "loadClaudeResumeThreadsPage").mockReturnValue({
      threads: [],
      nextCursor: null,
      hasMore: false,
    }),
  ]
  restorers.push(...mocks.map((mock) => () => mock.mockRestore()))
  let resume: ReturnType<typeof useAgentResumeThreads> | undefined
  function Fixture() {
    resume = useAgentResumeThreads(true)
    return (
      <TerminalActions
        width={120}
        height={40}
        initialPanel="agents"
        recentThreads={resume.recentThreads}
        activeRemoteProfileId={resume.activeRemoteProfileId}
        resumePagination={resume.pagination}
        onLoadMoreThreads={resume.loadMoreThreads}
        onSearchThreads={resume.refreshAllThreads}
        onAction={() => undefined}
        disabled={() => false}
      />
    )
  }
  await act(async () => {
    tui = await testRender(<Fixture />, { width: 120, height: 40 })
  })
  await waitFor(() => resume?.pagination.loadingInitial === false)
  calls.length = 0
  requestedLimits.length = 0
  fresh = true
  return {
    calls,
    requestedLimits,
    failures,
    pending,
    hold(source: AgentResumeSource) {
      heldSource = source
    },
    get resume() {
      return resume
    },
    async search() {
      await act(async () => tui?.mockInput.pressKey("/"))
      await act(async () => tui?.mockInput.pressEnter())
      await tui?.renderOnce()
      await waitFor(() => resume?.pagination.loadingInitial === false)
    },
  }
}

test("Enter refreshes all six sources even from a provider tab with an exhausted cached list", async () => {
  const view = await fixture()
  await act(async () => tui?.mockInput.pressKey("v")) // Codex tab.
  await act(async () => tui?.mockInput.pressKey("/"))
  await act(async () => tui?.mockInput.typeText("fresh"))
  await tui?.renderOnce()
  expect(view.calls).toEqual([])
  expect(tui?.captureCharFrame()).toContain("Nenhum resultado.")
  await act(async () => tui?.mockInput.pressEnter())
  await waitFor(
    () => view.resume?.recentThreads.length === 6 && !view.resume?.pagination.loadingInitial,
  )
  expect(view.calls.sort()).toEqual([
    "claude:local",
    "claude:remote",
    "codex:local",
    "codex:remote",
    "opencode:local",
    "opencode:remote",
  ])
  expect(view.requestedLimits).toEqual([120, 120, 120, 120, 120, 120])
  expect(view.resume?.pagination.limits).toEqual({ codex: 120, claude: 120, opencode: 120 })
  for (const source of view.calls) {
    const id = `terminal-resume-thread-fresh-${source.replace(":", "-")}`
    expect(tui?.renderer.root.findDescendantById(id)).toBeDefined()
  }
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-actions")

  // Explicit retry bypasses the normal 30-second remote refresh throttle.
  view.calls.length = 0
  await view.search()
  expect(view.calls).toHaveLength(6)
})

test("one unavailable remote source leaves local results usable and is retried by Enter", async () => {
  const view = await fixture(true, ["claude:remote"])
  expect(view.resume?.pagination.failedSources).toContain("claude:remote")
  expect(tui?.renderer.root.findDescendantById("terminal-resume-errors")).toBeUndefined()
  await act(async () => tui?.mockInput.pressKey("/"))
  await act(async () => tui?.mockInput.typeText("fresh"))
  await tui?.renderOnce()
  expect(tui?.renderer.root.findDescendantById("terminal-resume-errors")).toBeUndefined()
  await act(async () => tui?.mockInput.pressEnter())
  await waitFor(() => view.resume?.pagination.failedSources?.includes("claude:remote") === true)
  expect(view.resume?.recentThreads).toHaveLength(5)
  expect(tui?.captureCharFrame()).toContain("Falha ao carregar agentes.")
  expect(tui?.captureCharFrame()).toMatch(/Claude ·[\s│]*Remoto/)
  view.failures.clear()
  view.calls.length = 0
  await view.search()
  expect(view.calls).toHaveLength(6)
  expect(view.resume?.recentThreads).toHaveLength(6)
  expect(tui?.renderer.root.findDescendantById("terminal-resume-errors")).toBeUndefined()
})

test("without an active remote profile Enter refreshes all three local providers", async () => {
  const view = await fixture(false)
  await act(async () => tui?.mockInput.pressKey("/"))
  await act(async () => tui?.mockInput.typeText("fresh"))
  await act(async () => tui?.mockInput.pressEnter())
  await waitFor(() => view.resume?.recentThreads.length === 3)
  expect(view.calls.sort()).toEqual(["claude:local", "codex:local", "opencode:local"])
})

test("a repeated search cancels its previous remote read without losing fresh local results", async () => {
  const view = await fixture()
  view.hold("codex:remote")
  await act(async () => tui?.mockInput.pressKey("/"))
  await act(async () => tui?.mockInput.typeText("fresh"))
  await act(async () => tui?.mockInput.pressEnter())
  await waitFor(() => view.pending.length === 1)
  expect(view.resume?.recentThreads).toHaveLength(5)
  expect(view.resume?.pagination.loadingInitial).toBe(true)
  await act(async () => tui?.mockInput.pressKey("/"))
  await act(async () => tui?.mockInput.pressEnter())
  await waitFor(() => view.pending.length === 2)
  expect(view.pending[0]?.signal.aborted).toBe(true)
  expect(view.pending[1]?.signal.aborted).toBe(false)
  await act(async () => view.pending[1]?.release())
  await waitFor(() => view.resume?.pagination.loadingInitial === false)
  expect(view.resume?.recentThreads).toHaveLength(6)
  expect(view.resume?.pagination.failedSources).toEqual([])
})
