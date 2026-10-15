import "./setup"
import { afterEach, expect, mock, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { AgentResumeThread } from "../../packages/feature-terminal/src/model/agent-resume-thread"
import { TerminalActions } from "../../packages/feature-terminal/src/ui/TerminalActions"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function thread(
  id: string,
  providerId: "codex" | "claude" | "opencode",
  updatedAt: number,
): AgentResumeThread {
  return {
    id,
    providerId,
    title: id,
    preview: id,
    lastResponse: "",
    cwd: `/workspace/${id}`,
    projectName: id,
    gitBranch: "",
    updatedAt,
    state: "idle",
  }
}

async function arrow(direction: "up" | "down" | "left" | "right") {
  await act(async () => tui?.mockInput.pressArrow(direction))
  await tui?.renderOnce()
}

async function key(name: string) {
  await act(async () => {
    if (name === "enter") tui?.mockInput.pressEnter()
    else if (name === "escape") tui?.mockInput.pressEscape()
    else tui?.mockInput.pressKey(name)
  })
  await tui?.renderOnce()
}

test("Master Key agents expose provider tabs, loaders, normalized recency and paging", async () => {
  const loadMore = mock(() => undefined)
  tui = await testRender(
    <TerminalActions
      compact
      initialPanel="agents"
      width={60}
      height={28}
      recentThreads={[
        thread("codex-newer", "codex", 1_700_000_001),
        thread("opencode-older", "opencode", 1_700_000_000_500),
        thread("codex-older", "codex", 1_699_999_999),
      ]}
      resumePagination={{
        limits: { codex: 12, claude: 12, opencode: 12 },
        hasMore: { codex: true, claude: false, opencode: false },
        loadingInitial: true,
        loadingInitialProviders: ["codex"],
        loadingMore: [],
      }}
      onLoadMoreThreads={loadMore}
      onAction={() => undefined}
      disabled={() => false}
    />,
    { width: 60, height: 28 },
  )
  await tui.renderOnce()

  expect(tui.renderer.root.findDescendantById("terminal-resume-tab-global")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-resume-tab-codex")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-resume-tab-claude")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-resume-tab-opencode")).toBeDefined()
  const previousTab = tui.renderer.root.findDescendantById("terminal-resume-tab-previous")
  const globalTab = tui.renderer.root.findDescendantById("terminal-resume-tab-global")
  const openCodeTab = tui.renderer.root.findDescendantById("terminal-resume-tab-opencode")
  const nextTab = tui.renderer.root.findDescendantById("terminal-resume-tab-next")
  expect(previousTab?.screenY).toBe(globalTab?.screenY)
  expect((previousTab?.screenX ?? 0) + (previousTab?.width ?? 0)).toBeLessThanOrEqual(
    globalTab?.screenX ?? 0,
  )
  expect(nextTab?.screenY).toBe(openCodeTab?.screenY)
  expect(nextTab?.screenX ?? 0).toBeGreaterThanOrEqual(
    (openCodeTab?.screenX ?? 0) + (openCodeTab?.width ?? 0),
  )
  expect(tui.captureCharFrame().split("\n")[globalTab?.screenY ?? 0]).toContain("◐ Global")
  const codexNewer = tui.renderer.root.findDescendantById("terminal-resume-thread-codex-newer")
  const openCodeOlder = tui.renderer.root.findDescendantById(
    "terminal-resume-thread-opencode-older",
  )
  expect(codexNewer?.screenY).toBeLessThan(openCodeOlder?.screenY ?? 0)

  await act(async () => tui?.mockMouse.click((nextTab?.screenX ?? 0) + 1, nextTab?.screenY ?? 0))
  await tui.renderOnce()
  expect(tui.captureCharFrame().split("\n")[globalTab?.screenY ?? 0]).toContain("◐ Codex")
  expect(
    tui.renderer.root.findDescendantById("terminal-resume-thread-opencode-older"),
  ).toBeUndefined()
  await act(async () =>
    tui?.mockMouse.click((previousTab?.screenX ?? 0) + 1, previousTab?.screenY ?? 0),
  )
  await tui.renderOnce()

  await key("v")
  expect(
    tui.renderer.root.findDescendantById("terminal-resume-thread-opencode-older"),
  ).toBeUndefined()
  await arrow("down")
  await arrow("down")
  expect(loadMore).toHaveBeenCalledWith("codex")

  await act(async () => tui?.mockInput.pressTab())
  await tui.renderOnce()
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeUndefined()
})

test("recent-agent navigation stays on the last row instead of wrapping", async () => {
  const selectThread = mock((_thread: AgentResumeThread) => undefined)
  tui = await testRender(
    <TerminalActions
      compact
      initialPanel="agents"
      width={60}
      height={28}
      recentThreads={[thread("newer", "codex", 2), thread("older", "codex", 1)]}
      onAction={() => undefined}
      onSelectThread={selectThread}
      disabled={() => false}
    />,
    { width: 60, height: 28 },
  )
  await tui.renderOnce()

  await arrow("down")
  await arrow("down")
  await key("enter")

  expect(selectThread).toHaveBeenCalledTimes(1)
  expect(selectThread.mock.calls[0]?.[0].id).toBe("older")
})

test("Claude requests another page at the end by keyboard and mouse", async () => {
  const loadMore = mock(() => undefined)
  tui = await testRender(
    <TerminalActions
      compact
      initialPanel="agents"
      width={60}
      height={28}
      recentThreads={Array.from({ length: 13 }, (_, index) =>
        thread(`claude-${index}`, "claude", 100 - index),
      )}
      resumePagination={{
        limits: { codex: 12, claude: 12, opencode: 12 },
        hasMore: { codex: false, claude: true, opencode: false },
        loadingInitial: false,
        loadingInitialProviders: [],
        loadingMore: [],
      }}
      onLoadMoreThreads={loadMore}
      onAction={() => undefined}
      disabled={() => false}
    />,
    { width: 60, height: 28 },
  )
  await tui.renderOnce()

  const claudeTab = tui.renderer.root.findDescendantById("terminal-resume-tab-claude")
  await act(async () =>
    tui?.mockMouse.click((claudeTab?.screenX ?? 0) + 1, claudeTab?.screenY ?? 0),
  )
  await tui.renderOnce()
  for (let index = 0; index < 12; index++) await arrow("down")
  expect(loadMore).toHaveBeenCalledWith("claude")

  loadMore.mockClear()
  const results = tui.renderer.root.findDescendantById("terminal-agent-results")
  await act(async () => {
    await tui?.mockMouse.scroll((results?.screenX ?? 0) + 1, (results?.screenY ?? 0) + 1, "down")
    await tui?.renderOnce()
  })
  await Promise.resolve()
  expect(loadMore).toHaveBeenCalledWith("claude")
})

test("provider loading stays visible with cached rows and defers empty search results", async () => {
  const selectThread = mock((_thread: AgentResumeThread) => undefined)
  tui = await testRender(
    <TerminalActions
      compact
      initialPanel="agents"
      width={60}
      height={28}
      recentThreads={[thread("opencode-local", "opencode", 2)]}
      resumePagination={{
        limits: { codex: 12, claude: 12, opencode: 12 },
        hasMore: { codex: false, claude: false, opencode: false },
        loadingInitial: true,
        loadingInitialProviders: ["opencode"],
        loadingMore: [],
      }}
      onAction={() => undefined}
      onSelectThread={selectThread}
      disabled={() => false}
    />,
    { width: 60, height: 28 },
  )
  await tui.renderOnce()

  const claudeTab = tui.renderer.root.findDescendantById("terminal-resume-tab-claude")
  await act(async () =>
    tui?.mockMouse.click((claudeTab?.screenX ?? 0) + 1, claudeTab?.screenY ?? 0),
  )
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("Nenhuma conversa de agente disponível para retomar.")

  const openCodeTab = tui.renderer.root.findDescendantById("terminal-resume-tab-opencode")
  await act(async () =>
    tui?.mockMouse.click((openCodeTab?.screenX ?? 0) + 1, openCodeTab?.screenY ?? 0),
  )
  await tui.renderOnce()
  expect(tui.captureCharFrame().split("\n")[openCodeTab?.screenY ?? 0]).toContain("◐ OpenCode")
  expect(
    tui.renderer.root.findDescendantById("terminal-resume-thread-opencode-local"),
  ).toBeDefined()
  await key("enter")
  expect(selectThread).toHaveBeenCalledTimes(1)

  await key("/")
  await act(async () => tui?.mockInput.typeText("missing"))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toContain("Nenhum resultado.")
})
