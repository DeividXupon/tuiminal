import "./setup"
import { afterEach, expect, mock, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import type { AgentProviderId } from "../../packages/feature-terminal/src/model/agent-provider"
import {
  type AgentResumePaginationState,
  type AgentResumeThread,
  DEFAULT_AGENT_RESUME_PAGINATION,
} from "../../packages/feature-terminal/src/model/agent-resume-thread"
import { TerminalActions } from "../../packages/feature-terminal/src/ui/TerminalActions"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function thread(id: string, providerId: AgentProviderId, updatedAt = 1): AgentResumeThread {
  return {
    id,
    providerId,
    title: id,
    preview: "",
    lastResponse: "",
    cwd: "/workspace/project",
    projectName: "project",
    gitBranch: "main",
    updatedAt,
    state: "idle",
  }
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!predicate() && Date.now() < deadline) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
  }
  expect(predicate()).toBe(true)
}

async function key(name: string) {
  await act(async () => {
    if (name === "escape") tui?.mockInput.pressEscape()
    else if (name === "enter") tui?.mockInput.pressEnter()
    else tui?.mockInput.pressKey(name)
  })
  await tui?.renderOnce()
}

async function type(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
  await tui?.renderOnce()
}

async function clearQuery(length: number) {
  await act(async () => {
    for (let index = 0; index < length; index++) tui?.mockInput.pressBackspace()
  })
  await tui?.renderOnce()
}

async function fixture(initial: Partial<AgentResumePaginationState> = {}, inactive = false) {
  let update: (next: Partial<AgentResumePaginationState>) => void = () => undefined
  let append: (threads: AgentResumeThread[]) => void = () => undefined
  const loadMore = mock((providerId: AgentProviderId) => {
    update({ loadingMore: [providerId] })
  })
  const select = mock((_thread: AgentResumeThread) => undefined)
  function Fixture() {
    const [pagination, setPagination] = useState({ ...DEFAULT_AGENT_RESUME_PAGINATION, ...initial })
    const [threads, setThreads] = useState<AgentResumeThread[]>([])
    update = (next) => setPagination((current) => ({ ...current, ...next }))
    append = (next) => setThreads((current) => [...current, ...next])
    return (
      <TerminalActions
        compact
        width={80}
        height={30}
        initialPanel="agents"
        activeRemoteProfileId="active"
        recentThreads={threads}
        resumePagination={pagination}
        onLoadMoreThreads={loadMore}
        onSelectThread={select}
        onAction={() => undefined}
        disabled={() => false}
        inactive={inactive}
      />
    )
  }
  tui = await testRender(<Fixture />, { width: 80, height: 30 })
  await tui.renderOnce()
  return {
    loadMore,
    select,
    async update(next: Partial<AgentResumePaginationState>, threads: AgentResumeThread[] = []) {
      await act(async () => {
        update(next)
        append(threads)
      })
      await tui?.renderOnce()
    },
  }
}

test("Global search loads unseen pages from every provider and opens an older remote match", async () => {
  const view = await fixture({ hasMore: { codex: true, claude: true, opencode: true } })
  expect(view.loadMore).not.toHaveBeenCalled()
  await key("/")
  await type("needle")
  expect(tui?.captureCharFrame()).not.toContain("Nenhum resultado.")
  expect(tui?.renderer.root.findDescendantById("terminal-resume-more-loader")).toBeDefined()
  await waitFor(() => view.loadMore.mock.calls.length === 3)
  expect(view.loadMore.mock.calls.map(([provider]) => provider).sort()).toEqual([
    "claude",
    "codex",
    "opencode",
  ])

  await view.update(
    {
      limits: { codex: 24, claude: 24, opencode: 24 },
      hasMore: { codex: true, claude: false, opencode: false },
      loadingMore: [],
    },
    Array.from({ length: 24 }, (_, index) => thread(`newer-${index}`, "codex", 100 - index)),
  )
  expect(tui?.captureCharFrame()).not.toContain("Nenhum resultado.")
  await waitFor(() => view.loadMore.mock.calls.length === 4)
  expect(view.loadMore.mock.calls[3]).toEqual(["codex"])
  const match = { ...thread("needle", "codex"), remoteProfileId: "active" }
  await view.update(
    {
      limits: { codex: 36, claude: 24, opencode: 24 },
      hasMore: { codex: false, claude: false, opencode: false },
      loadingMore: [],
    },
    [
      ...Array.from({ length: 24 }, (_, index) => ({
        ...thread(`remote-${index}`, "codex", 100 - index),
        remoteProfileId: "active",
      })),
      match,
      { ...thread("needle-inactive", "codex"), remoteProfileId: "inactive" },
    ],
  )
  expect(tui?.renderer.root.findDescendantById("terminal-resume-thread-needle")).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById("terminal-resume-thread-needle-inactive"),
  ).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-resume-more-loader")).toBeUndefined()
  await key("enter")
  expect(view.select).toHaveBeenCalledWith(match)

  await clearQuery(6)
  expect(tui?.renderer.root.findDescendantById("terminal-resume-thread-needle")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-resume-thread-newer-0")).toBeDefined()
})

test("provider search waits for initial loading, avoids retry loops and honors the source cap", async () => {
  const view = await fixture({
    hasMore: { codex: true, claude: true, opencode: true },
    loadingInitialProviders: ["codex"],
  })
  await key("v")
  await key("/")
  await type("missing")
  await act(async () => Bun.sleep(200))
  expect(view.loadMore).not.toHaveBeenCalled()
  await view.update({ loadingInitialProviders: [] })
  await waitFor(() => view.loadMore.mock.calls.length === 1)
  expect(view.loadMore.mock.calls[0]).toEqual(["codex"])

  // Failed page: loading ends without advancing the limit or exhausting the source.
  await view.update({ loadingMore: [] })
  await act(async () => Bun.sleep(250))
  expect(view.loadMore).toHaveBeenCalledTimes(1)
  expect(tui?.captureCharFrame()).toContain("Nenhum resultado.")
  await clearQuery(7)
  await type("missing")
  await waitFor(() => view.loadMore.mock.calls.length === 2)
  await view.update({ loadingMore: [], limits: { codex: 120, claude: 12, opencode: 12 } })
  await act(async () => Bun.sleep(250))
  expect(view.loadMore).toHaveBeenCalledTimes(2)
})

test("clearing search or closing its modal stops automatic pagination", async () => {
  const view = await fixture({ hasMore: { codex: true, claude: false, opencode: false } })
  await key("/")
  await type("old")
  await waitFor(() => view.loadMore.mock.calls.length === 1)
  await clearQuery(3)
  await view.update({ loadingMore: [], limits: { codex: 24, claude: 12, opencode: 12 } })
  await act(async () => Bun.sleep(250))
  expect(view.loadMore).toHaveBeenCalledTimes(1)
  await type("old")
  act(() => tui?.renderer.destroy())
  tui = undefined
  await act(async () => Bun.sleep(250))
  expect(view.loadMore).toHaveBeenCalledTimes(1)
})

test("ongoing roster refreshes do not postpone search pagination", async () => {
  const view = await fixture({ hasMore: { codex: true, claude: false, opencode: false } })
  await key("/")
  await type("older")
  const deadline = Date.now() + 2_000
  while (!view.loadMore.mock.calls.length && Date.now() < deadline) {
    await view.update({ loadingInitial: false })
    await act(async () => Bun.sleep(10))
  }
  expect(view.loadMore).toHaveBeenCalledTimes(1)
})
