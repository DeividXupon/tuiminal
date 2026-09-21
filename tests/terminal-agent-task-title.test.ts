import { describe, expect, test } from "bun:test"
import {
  AgentTaskTitle,
  agentTaskTitle,
  cleanAgentTaskTitle,
} from "../packages/feature-terminal/src/model/agent-task-title"
import { identifyProcessAgent } from "../packages/feature-terminal/src/model/agent-detection"
import {
  observeAgent,
  sameAgentStatus,
  type AgentIdentity,
} from "../packages/feature-terminal/src/model/agent-state"

function identity(command: string): AgentIdentity {
  return identifyProcessAgent({ pid: 123, parentPid: 1, executable: command, command })!
}

describe("agent-published task titles", () => {
  test.each([
    ["codex", "⠋ Fix login timeout | website", "Fix login timeout | website"],
    ["codex", "[ ! ] Action Required | Fix login", "Fix login"],
    ["codex", "Codex | Working | Fix login ⠋", "Fix login"],
    ["claude", "✳ Fix authentication", "Fix authentication"],
    ["claude", "⠋ Fix authentication", "Fix authentication"],
    ["opencode", "OC | Add integration tests", "Add integration tests"],
    ["qwen", "◐ Add integration tests", "Add integration tests"],
    ["qwen", "✳︎ Add integration tests", "Add integration tests"],
    ["qwen", "Add integration tests", "Add integration tests"],
    ["gemini", "✦ Fixing login validation (website)   ", "Fixing login validation"],
    ["pi", "pi - Fix login - website", "Fix login"],
    ["pi", "π - Fix login - website", "Fix login"],
    ["kimi", "Kimi: Fix login", "Fix login"],
    ["copilot", "GitHub Copilot - Fix login", "Fix login"],
    ["aider", "Fix database migration", "Fix database migration"],
    ["goose", "Fix database migration", "Fix database migration"],
    ["amp", "Fix database migration", "Fix database migration"],
    ["cursor-agent", "修复登录错误", "修复登录错误"],
    ["my-ai-agent", "Corrigir autenticação", "Corrigir autenticação"],
  ])("%s: %s", (command, raw, expected) => {
    expect(agentTaskTitle(identity(command!), raw!)).toBe(expected)
  })

  test("configured agent titles do not require a built-in activity profile", () => {
    const agent = identifyProcessAgent(
      { pid: 123, parentPid: 1, executable: "private-bot", command: "private-bot" },
      ["private-bot"],
    )!
    expect(agentTaskTitle(agent, "private-bot: Update reports")).toBe("Update reports")
  })

  test.each([
    ["codex", "⠋"],
    ["codex", "[ . ] Action Required"],
    ["gemini", "✋ Action Required (website)"],
    ["gemini", "◇ Ready (website)"],
    ["gemini", "⏲ Working… (website)"],
    ["claude", "Thinking…"],
    ["aider", "zsh"],
    ["aider", "MainThread"],
    ["aider", "user@host:~/project"],
    ["aider", "/home/user/project"],
    ["aider", "C:\\Users\\User\\project"],
  ])("ignores status and shell metadata for %s: %s", (command, raw) => {
    expect(agentTaskTitle(identity(command!), raw!)).toBeUndefined()
  })

  test.each([
    ["opencode", "OpenCode"],
    ["qwen", "Qwen - website"],
    ["claude", "Claude Code v2.1.132"],
    ["pi", "π - website"],
    ["pi", "pi - website"],
    ["gemini", "Gemini CLI (website)"],
    ["codex", ""],
  ])("clears titles on %s session reset: %s", (command, raw) => {
    expect(agentTaskTitle(identity(command!), raw!)).toBeNull()
  })

  test("preserves summaries through transient status, replaces them on rename and clears on reset", () => {
    const title = new AgentTaskTitle(identity("claude"))
    expect(title.observe("⠋ Fix login", 1)).toBe("Fix login")
    expect(title.observe("⠙ Fix login", 2)).toBe("Fix login")
    expect(title.observe("Working…", 3)).toBe("Fix login")
    expect(title.observe("✳ Add tests", 4)).toBe("Add tests")
    expect(title.observe("", 5)).toBeNull()
    expect(new AgentTaskTitle(identity("claude")).observe("Ready", 1)).toBeNull()
  })

  test("does not adopt a shell title observed before agent recognition", () => {
    const title = new AgentTaskTitle(identity("codex"), 8)
    expect(title.observe("Shell window", 8)).toBeNull()
    expect(title.observe("Fix login", 9)).toBe("Fix login")
  })

  test("sanitizes untrusted metadata and limits whole Unicode graphemes", () => {
    expect(cleanAgentTaskTitle("  Fix\tlogin\n\x1b[31mnow\u202e\u2066\x07 ")).toBe("Fix login now")
    expect(cleanAgentTaskTitle("👩‍💻".repeat(200))).toBe("👩‍💻".repeat(160))
  })

  test("title-only changes update metadata without interpreting the summary as activity", () => {
    const agent = identity("opencode")
    const before = observeAgent(undefined, agent, { state: "unknown" }, false, 0).status
    const after = { ...before, taskTitle: "Working on approval detection" }
    expect(sameAgentStatus(before, after)).toBe(false)
    expect(sameAgentStatus(after, { ...after })).toBe(true)
    expect(after.state).toBe("unknown")
  })
})
