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
  await act(async () => tui?.mockInput.pressKey(name))
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
  expect(tui.renderer.root.findDescendantById("terminal-resume-initial-loader")).toBeDefined()
  const codexNewer = tui.renderer.root.findDescendantById("terminal-resume-thread-codex-newer")
  const openCodeOlder = tui.renderer.root.findDescendantById(
    "terminal-resume-thread-opencode-older",
  )
  expect(codexNewer?.screenY).toBeLessThan(openCodeOlder?.screenY ?? 0)

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
