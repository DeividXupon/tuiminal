import { describe, expect, test } from "bun:test"
import {
  type AgentProviderId,
  agentProvider,
} from "../packages/feature-terminal/src/model/agent-provider"
import {
  type AgentResumeThread,
  agentResumeThreadsForTab,
  compareAgentResumeThreads,
  DEFAULT_AGENT_RESUME_PAGINATION,
} from "../packages/feature-terminal/src/model/agent-resume-thread"
import {
  claudeResumeThreadsSnapshot,
  publishClaudeResumeThreads,
  resetClaudeResumeThreadsForTests,
} from "../packages/feature-terminal/src/model/claude-resume-threads"
import {
  codexResumeThreadsSnapshot,
  publishCodexResumeThreads,
  resetCodexResumeThreadsForTests,
} from "../packages/feature-terminal/src/model/codex-resume-threads"
import {
  openCodeResumeThreadsSnapshot,
  publishOpenCodeResumeThreads,
  resetOpenCodeResumeThreadsForTests,
} from "../packages/feature-terminal/src/model/opencode-resume-threads"
import { resolveAgentResumeCommand } from "../packages/feature-terminal/src/services/agent-resume-command"

function thread(
  providerId: AgentProviderId,
  id: string,
  updatedAt: number,
  remoteProfileId?: string,
): AgentResumeThread {
  return {
    id,
    title: id,
    preview: id,
    lastResponse: "",
    cwd: `/workspace/${id}`,
    projectName: id,
    gitBranch: "",
    updatedAt,
    state: "idle",
    providerId,
    ...(remoteProfileId ? { remoteProfileId } : {}),
  }
}

describe("Master Key recent agents", () => {
  test.each(["codex", "claude", "opencode"] as const)(
    "%s carries the selected local or remote title as display-only launch metadata",
    (providerId) => {
      const profile = { id: "work", name: "Work", host: "work" }
      for (const remoteProfileId of [undefined, profile.id]) {
        const selected = {
          ...thread(providerId, "resume-title", 100, remoteProfileId),
          title: "  Fix\n\u001b[31mlogin\u001b[0m\u202e  ",
        }
        const { command, error } = resolveAgentResumeCommand(selected, [profile])
        expect(error).toBeNull()
        expect(command?.agentLaunch).toMatchObject({
          providerId,
          resumeThreadId: selected.id,
          resumeTitle: "Fix login",
        })
        expect(command?.workingDirectory).toBe(selected.cwd)
        expect(command?.agentLaunch?.remote).toEqual(
          remoteProfileId ? { profile, workingDirectory: selected.cwd } : undefined,
        )
        expect(command?.command).not.toContain("Fix login")
        expect(command?.displayCommand).not.toContain("Fix login")
        expect(selected.title).toContain("\u001b")
      }
    },
  )

  test.each(["codex", "claude", "opencode"] as const)(
    "%s leaves genuinely untitled resumes without a task-title placeholder",
    (providerId) => {
      for (const title of ["", "\n\u202e", agentProvider(providerId).label]) {
        const { command } = resolveAgentResumeCommand(
          { ...thread(providerId, "untitled", 100), title },
          [],
        )
        expect(command?.agentLaunch).toBeDefined()
        expect(command?.agentLaunch).not.toHaveProperty("resumeTitle")
      }
    },
  )

  test("bounds resume titles without splitting graphemes", () => {
    const { command } = resolveAgentResumeCommand(
      { ...thread("codex", "long-title", 100), title: "👩‍💻".repeat(170) },
      [],
    )
    expect(command?.agentLaunch?.resumeTitle).toBe("👩‍💻".repeat(160))
  })

  test("sorts mixed provider timestamp units by the actual last interaction", () => {
    const threads = [
      thread("opencode", "millisecond-older", 1_700_000_000_500),
      thread("codex", "second-newer", 1_700_000_001),
      thread("claude", "unknown", 0),
    ]

    expect(threads.sort(compareAgentResumeThreads).map(({ id }) => id)).toEqual([
      "second-newer",
      "millisecond-older",
      "unknown",
    ])
  })

  test("balances Global by provider and origin, then applies one chronological order", () => {
    const providers: readonly AgentProviderId[] = ["codex", "claude", "opencode"]
    const threads = providers.flatMap((providerId, providerIndex) =>
      Array.from({ length: 14 }, (_, index) => [
        thread(providerId, `${providerId}-local-${index}`, 10_000 - providerIndex * 100 - index),
        thread(
          providerId,
          `${providerId}-remote-${index}`,
          9_000 - providerIndex * 100 - index,
          "active",
        ),
        thread(
          providerId,
          `${providerId}-inactive-${index}`,
          20_000 - providerIndex * 100 - index,
          "inactive",
        ),
      ]).flat(),
    )

    const global = agentResumeThreadsForTab(
      threads,
      "global",
      "active",
      DEFAULT_AGENT_RESUME_PAGINATION.limits,
    )
    expect(global).toHaveLength(42)
    expect(global.some(({ remoteProfileId }) => remoteProfileId === "inactive")).toBe(false)
    for (const providerId of providers) {
      const provider = global.filter((candidate) => candidate.providerId === providerId)
      expect(provider.filter(({ remoteProfileId }) => !remoteProfileId)).toHaveLength(7)
      expect(provider.filter(({ remoteProfileId }) => remoteProfileId === "active")).toHaveLength(7)
    }
    expect(global.map(({ updatedAt }) => updatedAt)).toEqual(
      global.map(({ updatedAt }) => updatedAt).sort((left, right) => right - left),
    )

    const codex = agentResumeThreadsForTab(
      threads,
      "codex",
      "active",
      DEFAULT_AGENT_RESUME_PAGINATION.limits,
    )
    expect(codex.filter(({ remoteProfileId }) => !remoteProfileId)).toHaveLength(12)
    expect(codex.filter(({ remoteProfileId }) => remoteProfileId === "active")).toHaveLength(12)
  })

  test("keeps same-id local and remote Codex response caches isolated", () => {
    resetCodexResumeThreadsForTests()
    try {
      const local = thread("codex", "shared", 100)
      publishCodexResumeThreads([{ ...local, lastResponse: "local response" }])
      publishCodexResumeThreads(
        [{ ...local, lastResponse: "", remoteProfileId: "active" }],
        "active",
      )

      expect(
        codexResumeThreadsSnapshot().find(
          (candidate) => candidate.id === "shared" && candidate.remoteProfileId === "active",
        )?.lastResponse,
      ).toBe("")
    } finally {
      resetCodexResumeThreadsForTests()
    }
  })

  test.each(["global", "codex", "claude", "opencode"] as const)(
    "%s searches past recent-row limits while preserving provider and origin scope",
    (tab) => {
      const providers: readonly AgentProviderId[] = ["codex", "claude", "opencode"]
      const roster = providers.flatMap((providerId) =>
        [undefined, "active", "inactive"].flatMap((origin) =>
          Array.from({ length: 30 }, (_, index) => ({
            ...thread(providerId, `${providerId}-${origin}-${index}`, 100 - index, origin),
            gitBranch: index >= 13 ? "fix/old-issue" : "main",
          })),
        ),
      )
      const results = agentResumeThreadsForTab(
        roster,
        tab,
        "active",
        DEFAULT_AGENT_RESUME_PAGINATION.limits,
        "  OLD-ISSUE  ",
      )
      expect(results).toHaveLength((tab === "global" ? 3 : 1) * 2 * 17)
      expect(results.every(({ gitBranch }) => gitBranch === "fix/old-issue")).toBe(true)
      expect(results.some(({ remoteProfileId }) => remoteProfileId === "inactive")).toBe(false)
      if (tab !== "global") expect(results.every(({ providerId }) => providerId === tab)).toBe(true)
      expect(results).toEqual([...results].sort(compareAgentResumeThreads))
      expect(agentResumeThreadsForTab(roster, tab, "active")).toHaveLength(
        tab === "global" ? 42 : 24,
      )
    },
  )

  test("caps every provider and local/remote origin independently", () => {
    const roster = (providerId: AgentProviderId, remoteProfileId?: string) =>
      Array.from({ length: 121 }, (_, index) =>
        thread(providerId, `${remoteProfileId ?? "local"}-${index}`, index + 1, remoteProfileId),
      )
    resetCodexResumeThreadsForTests()
    resetOpenCodeResumeThreadsForTests()
    resetClaudeResumeThreadsForTests()
    try {
      publishCodexResumeThreads(roster("codex"))
      publishCodexResumeThreads(roster("codex", "active"), "active")
      publishOpenCodeResumeThreads(roster("opencode"))
      publishOpenCodeResumeThreads(roster("opencode", "active"), "active")
      publishClaudeResumeThreads([...roster("claude"), ...roster("claude", "active")])

      for (const snapshot of [
        codexResumeThreadsSnapshot(),
        openCodeResumeThreadsSnapshot(),
        claudeResumeThreadsSnapshot(),
      ]) {
        expect(snapshot.filter(({ remoteProfileId }) => !remoteProfileId)).toHaveLength(120)
        expect(snapshot.filter(({ remoteProfileId }) => remoteProfileId === "active")).toHaveLength(
          120,
        )
      }
    } finally {
      resetCodexResumeThreadsForTests()
      resetOpenCodeResumeThreadsForTests()
      resetClaudeResumeThreadsForTests()
    }
  })
})
