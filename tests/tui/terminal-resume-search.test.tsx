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
import {
  type TerminalActionPanel,
  TerminalActions,
} from "../../packages/feature-terminal/src/ui/TerminalActions"

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

async function fixture(
  initial: Partial<AgentResumePaginationState> = {},
  options: { compact?: boolean; width?: number; initialPanel?: TerminalActionPanel } = {},
) {
  const { compact = true, width = 80, initialPanel = "agents" } = options
  let update: (next: Partial<AgentResumePaginationState>) => void = () => undefined
  let append: (threads: AgentResumeThread[]) => void = () => undefined
  const loadMore = mock((providerId: AgentProviderId) => {
    update({ loadingMore: [providerId] })
  })
  const select = mock((_thread: AgentResumeThread) => undefined)
  const action = mock((_key: string) => undefined)
  const search = mock(() => undefined)
  function Fixture() {
    const [pagination, setPagination] = useState({ ...DEFAULT_AGENT_RESUME_PAGINATION, ...initial })
    const [threads, setThreads] = useState<AgentResumeThread[]>([])
    update = (next) => setPagination((current) => ({ ...current, ...next }))
    append = (next) => setThreads((current) => [...current, ...next])
    return (
      <TerminalActions
        compact={compact}
        width={width}
        height={30}
        initialPanel={initialPanel}
        activeRemoteProfileId="active"
        recentThreads={threads}
        resumePagination={pagination}
        onLoadMoreThreads={loadMore}
        onSearchThreads={search}
        onSelectThread={select}
        onAction={action}
        disabled={() => false}
      />
    )
  }
  tui = await testRender(<Fixture />, { width, height: 30 })
  await tui.renderOnce()
  return {
    loadMore,
    select,
    action,
    search,
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
  expect(view.select).not.toHaveBeenCalled()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-actions")
  await key("enter")
  expect(view.select).toHaveBeenCalledWith(match)

  await key("/")
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
  await key("enter")
  await waitFor(() => view.loadMore.mock.calls.length === 4)
  expect(view.search).toHaveBeenCalledTimes(1)
  expect(
    view.loadMore.mock.calls
      .slice(1)
      .map(([provider]) => provider)
      .sort(),
  ).toEqual(["claude", "codex", "opencode"])
  expect(view.select).not.toHaveBeenCalled()
  expect(view.action).not.toHaveBeenCalled()
  await view.update({ loadingMore: [], limits: { codex: 120, claude: 120, opencode: 120 } })
  await act(async () => Bun.sleep(250))
  expect(view.loadMore).toHaveBeenCalledTimes(4)
})

test.each([
  { compact: false, width: 120, mouse: false },
  { compact: false, width: 120, mouse: true },
  { compact: true, width: 34, mouse: false },
  { compact: true, width: 34, mouse: true },
])("search action submits from Actions without launching a conversation: %j", async (options) => {
  const view = await fixture({}, { ...options, initialPanel: "actions" })
  const find = (id: string) => tui?.renderer.root.findDescendantById(id)
  const match = thread("agente", "claude")
  await view.update({}, [match, thread("unrelated", "opencode")])
  expect(find("terminal-action-search-submit")).toBeUndefined()
  await key("/")
  await type("   ")
  expect(find("terminal-action-search-submit")).toBeUndefined()
  await clearQuery(3)
  await type("agente")
  const input = find("terminal-action-search")
  const submit = find("terminal-action-search-submit")
  const modal = find("terminal-actions")
  if (!input || !submit || !modal) throw new Error("Missing Master Key search controls")
  expect(tui?.captureCharFrame()).toContain("[Enter] Pesquisar agente")
  expect(submit.screenY).toBe(input.screenY)
  expect(submit.screenX).toBeGreaterThanOrEqual(input.screenX + input.width)
  expect(input.width).toBeGreaterThan(0)
  expect(submit.screenX + submit.width).toBeLessThanOrEqual(modal.screenX + modal.width)
  if (options.mouse) {
    await act(async () => tui?.mockMouse.click(submit.screenX + 1, submit.screenY))
    await tui?.renderOnce()
  } else await key("enter")
  expect(view.select).not.toHaveBeenCalled()
  expect(view.action).not.toHaveBeenCalled()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-actions")
  expect(view.search).toHaveBeenCalledTimes(1)
  expect(find("terminal-agent-panel-active")).toBeDefined()
  expect(find("terminal-resume-thread-agente")).toBeDefined()
  expect(find("terminal-resume-thread-unrelated")).toBeUndefined()
  await key("enter")
  expect(view.select).toHaveBeenCalledTimes(1)
  expect(view.select).toHaveBeenCalledWith(match)
  await key("/")
  expect(find("terminal-action-search")).toBe(input)
  await clearQuery(6)
  expect(find("terminal-action-search-submit")).toBeUndefined()
  await key("escape")
  await waitFor(() => tui?.renderer.currentFocusedRenderable?.id === "terminal-actions")
  expect(view.action).not.toHaveBeenCalled()
  await key("escape")
  await waitFor(() => view.action.mock.calls.length === 1)
  expect(view.action).toHaveBeenCalledWith("escape")
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
