import "./setup"
import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { useAgentResumeThreads } from "../../packages/feature-terminal/src/hooks/use-agent-resume-threads"
import { resetClaudeResumeThreadsForTests } from "../../packages/feature-terminal/src/model/claude-resume-threads"
import { claudeResumeStorePath } from "../../packages/feature-terminal/src/services/claude-resume-store"
import { TerminalActions } from "../../packages/feature-terminal/src/ui/TerminalActions"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  resetClaudeResumeThreadsForTests()
})

function storedSessions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Claude ${index}`,
    preview: "",
    lastResponse: "",
    cwd: `/workspace/project-${index}`,
    projectName: `project-${index}`,
    gitBranch: "",
    updatedAt: index + 1,
    state: "idle",
  }))
}

function writeClaudeIndex(count: number) {
  const path = claudeResumeStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ version: 1, sessions: storedSessions(count) })}\n`)
}

test("Claude load-more re-reads the local resume index", async () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-claude-hook-pages-"))
  const previous = {
    dataHome: process.env.XDG_DATA_HOME,
    workspaceState: process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE,
    claude: process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME,
    codex: process.env.TUIMINAL_TERMINAL_CODEX_RESUME,
    openCode: process.env.TUIMINAL_TERMINAL_OPENCODE_RESUME,
  }
  process.env.XDG_DATA_HOME = root
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  process.env.TUIMINAL_TERMINAL_CLAUDE_RESUME = "1"
  process.env.TUIMINAL_TERMINAL_CODEX_RESUME = "0"
  process.env.TUIMINAL_TERMINAL_OPENCODE_RESUME = "0"
  let resume: ReturnType<typeof useAgentResumeThreads> | undefined

  function Fixture() {
    resume = useAgentResumeThreads(true)
    return <text content={String(resume.pagination.limits.claude)} />
  }

  try {
    writeClaudeIndex(13)
    tui = await testRender(<Fixture />, { width: 20, height: 4 })
    await tui.renderOnce()
    expect(resume?.recentThreads).toHaveLength(13)
    expect(resume?.pagination.hasMore.claude).toBe(true)

    writeClaudeIndex(25)
    await act(async () => resume?.loadMoreThreads("claude"))
    await tui.renderOnce()

    expect(resume?.pagination.limits.claude).toBe(24)
    expect(resume?.recentThreads).toHaveLength(25)
    expect(resume?.pagination.hasMore.claude).toBe(true)
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    const restore = (key: keyof NodeJS.ProcessEnv, value: string | undefined) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restore("XDG_DATA_HOME", previous.dataHome)
    restore("TUIMINAL_TERMINAL_WORKSPACE_STATE", previous.workspaceState)
    restore("TUIMINAL_TERMINAL_CLAUDE_RESUME", previous.claude)
    restore("TUIMINAL_TERMINAL_CODEX_RESUME", previous.codex)
    restore("TUIMINAL_TERMINAL_OPENCODE_RESUME", previous.openCode)
    rmSync(root, { recursive: true, force: true })
  }
})

test("Master Key search expands the Claude roster through the real pagination hook", async () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-claude-search-"))
  const environment = {
    XDG_DATA_HOME: root,
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
    TUIMINAL_TERMINAL_CLAUDE_RESUME: "1",
    TUIMINAL_TERMINAL_CODEX_RESUME: "0",
    TUIMINAL_TERMINAL_OPENCODE_RESUME: "0",
  }
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, environment)
  let resume: ReturnType<typeof useAgentResumeThreads> | undefined
  function Fixture() {
    resume = useAgentResumeThreads(true)
    return (
      <TerminalActions
        width={80}
        height={30}
        initialPanel="agents"
        recentThreads={resume.recentThreads}
        resumePagination={resume.pagination}
        onLoadMoreThreads={resume.loadMoreThreads}
        onAction={() => undefined}
        disabled={() => false}
      />
    )
  }
  try {
    writeClaudeIndex(25)
    tui = await testRender(<Fixture />, { width: 80, height: 30 })
    await tui.renderOnce()
    const id = "terminal-resume-thread-00000000-0000-4000-8000-000000000000"
    expect(tui.renderer.root.findDescendantById(id)).toBeUndefined()
    await act(async () => tui?.mockInput.pressKey("/"))
    await act(async () => tui?.mockInput.typeText("Claude 0"))
    const deadline = Date.now() + 2_000
    while (resume?.pagination.hasMore.claude && Date.now() < deadline) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
    }
    expect(resume?.pagination.hasMore.claude).toBe(false)
    expect(resume?.pagination.limits.claude).toBe(36)
    expect(tui.renderer.root.findDescendantById(id)).toBeDefined()
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
})
