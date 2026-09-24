import { describe, expect, test } from "bun:test"
import { COLORS } from "../packages/core/src/settings/theme"
import {
  agentMessageElapsedLabel,
  agentMessageModelLabel,
  cleanAgentMessage,
  EMPTY_AGENT_MESSAGE_TURN_DETAIL,
} from "../packages/feature-terminal/src/model/agent-message-history"
import {
  cleanTerminalName,
  DEFAULT_FOLDER,
  MAX_TERMINALS_PER_SECTION,
  masterKeyShortcutLabel,
  normalizeSectionLayout,
  orderedRunningAgents,
  type TerminalSession,
  terminalSections,
  visibleTerminalShortcutTargets,
} from "../packages/feature-terminal/src/model/sessions"
import {
  AGENT_WORKING_FRAMES,
  agentPresentation,
  codexActivityIndicators,
} from "../packages/feature-terminal/src/rendering/agent-presentation"
import {
  terminalSessionDetail,
  terminalStatusLabel,
  terminalStatusMarker,
} from "../packages/feature-terminal/src/rendering/presentation"
import { tmuxAgentNotice } from "../packages/feature-terminal/src/rendering/tmux-agent-notice"
import {
  codexAppServerActivity,
  codexAppServerState,
} from "../packages/feature-terminal/src/services/codex-app-server"
import { createCodexAgentCommand } from "../packages/feature-terminal/src/services/terminal"

export function session(id: string, patch: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id,
    sectionId: "one",
    folderId: DEFAULT_FOLDER,
    row: 0,
    column: 0,
    title: id,
    agent: null,
    status: "running",
    pid: 100,
    startedAt: 1,
    exitCode: null,
    kind: "shell",
    label: "Terminal",
    shortLabel: "TTY",
    displayCommand: "/bin/sh",
    command: ["/bin/sh"],
    accent: "#64d8ff",
    ...patch,
  }
}

describe("Free Terminal presentation", () => {
  test("bounds and formats integrated agent message history", () => {
    expect(agentMessageElapsedLabel(0, 1_000)).toBe("—")
    expect(agentMessageElapsedLabel(1_000, 1_999)).toBe("0s")
    expect(agentMessageElapsedLabel(1_000, 62_000)).toBe("1m")
    expect(agentMessageElapsedLabel(1_000, 7_202_000)).toBe("2h")
    expect(agentMessageElapsedLabel(1_000, 172_802_000)).toBe("2d")
    expect(cleanAgentMessage("  hello\n\u202eright-to-left\tworld  ")).toBe(
      "hello right-to-left world",
    )
    expect(cleanAgentMessage("a".repeat(4_001))).toHaveLength(4_000)
    expect(
      agentMessageModelLabel({
        id: "message-1",
        turnId: "turn-1",
        text: "hello",
        sentAt: 1,
        durationMs: 1_080_000,
        status: "completed",
        hasImage: false,
        hasAudio: false,
        hasSkill: false,
        model: "gpt-6-sol",
        effort: "medium",
        serviceTier: "fast",
        ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
      }),
    ).toBe("gpt-6-sol · medium · fast")
  })
  test("keeps the working loader", () => {
    expect(AGENT_WORKING_FRAMES).toEqual(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
    expect(agentPresentation("working", 1)).toMatchObject({
      marker: "⠙",
      shortLabel: "Trabalhando",
      color: COLORS.terminal,
    })
  })
  test("opens the official Codex TUI against an owned app-server", () => {
    expect(createCodexAgentCommand()).toMatchObject({
      kind: "custom",
      label: "Codex",
      displayCommand: "codex --remote",
      command: ["codex"],
      codex: { appServer: true },
    })
    expect(createCodexAgentCommand("thread-123")).toMatchObject({
      displayCommand: "codex resume thread-123 --remote",
      codex: { appServer: true, resumeThreadId: "thread-123" },
    })
  })
  test("derives agent state from public app-server events", () => {
    expect(codexAppServerState({ method: "turn/started" })).toBe("working")
    expect(
      codexAppServerActivity({
        method: "item/started",
        params: { item: { type: "commandExecution" } },
      }),
    ).toBe("running")
    expect(
      codexAppServerActivity({
        method: "item/started",
        params: { item: { type: "mcpToolCall" } },
      }),
    ).toBe("tooling")
    for (const phase of ["commentary", "final_answer"])
      expect(
        codexAppServerActivity({
          method: "item/started",
          params: { item: { type: "agentMessage", phase } },
        }),
      ).toBe("writing")
    expect(
      codexAppServerActivity({
        method: "item/agentMessage/delta",
        params: { itemId: "message-1", delta: "Update for the user" },
      }),
    ).toBe("writing")
    expect(
      codexAppServerActivity({
        method: "turn/plan/updated",
        params: { turnId: "turn-1", plan: [{ step: "Update the panel" }] },
      }),
    ).toBe("updating")
    expect(
      codexAppServerState({
        method: "thread/status/changed",
        params: { status: { type: "active", activeFlags: ["waitingOnApproval"] } },
      }),
    ).toBe("blocked")
    expect(
      codexAppServerState({ method: "turn/completed", params: { turn: { status: "completed" } } }),
    ).toBe("done")
    expect(codexAppServerActivity({ method: "item/reasoning/textDelta" })).toBeNull()
  })
  test("presents portable Codex activity indicators", () => {
    expect(codexActivityIndicators("working", "coding", 0)).toEqual([
      { key: "thinking", marker: "...", active: false, bright: false },
      { key: "code", marker: "{}", active: true, bright: true },
      { key: "command", marker: ">_", active: false, bright: false },
      { key: "text", marker: "txt", active: false, bright: false },
      { key: "tool", marker: "●", active: false, bright: false },
    ])
    expect(codexActivityIndicators("working", "tooling", 3)).toEqual([
      { key: "thinking", marker: "...", active: false, bright: false },
      { key: "code", marker: "{}", active: false, bright: false },
      { key: "command", marker: ">_", active: false, bright: false },
      { key: "text", marker: "txt", active: false, bright: false },
      { key: "tool", marker: "●", active: true, bright: false },
    ])
    expect(codexActivityIndicators("working", "thinking", 0)[0]).toEqual({
      key: "thinking",
      marker: "...",
      active: true,
      bright: true,
    })
    expect(codexActivityIndicators("working", "updating", 0)).toContainEqual({
      key: "text",
      marker: "txt",
      active: true,
      bright: true,
    })
    expect(codexActivityIndicators("working", "writing", 0)).toContainEqual({
      key: "text",
      marker: "txt",
      active: true,
      bright: true,
    })
    expect(codexActivityIndicators("idle", null, 0).every((indicator) => !indicator.active)).toBe(
      true,
    )
  })
  test("explains the richer Tuiminal path for tmux agents", () => {
    expect(tmuxAgentNotice(null)).toBeNull()
    expect(tmuxAgentNotice({ label: "Codex" })).toMatchObject({
      source: "Terminal",
      kind: "info",
      title: "Agente no tmux",
      message: "Execute este agente no Tuiminal para mais funcionalidades.",
    })
  })
  test.each([DEFAULT_FOLDER, "work"])("keeps an agent's paired section in %s", (folderId) => {
    const first = session("shell", { folderId })
    const second = session("agent", {
      folderId,
      agent: {
        key: "101:codex",
        label: "Codex",
        profile: "codex",
        state: "working",
        activity: null,
      },
      column: 1,
    })
    expect(MAX_TERMINALS_PER_SECTION).toBe(2)
    expect(terminalSections([first, second])).toEqual([
      { id: "one", panes: [first, second], folderId },
    ])
    expect(terminalSections([first, { ...second, agent: null }])[0]?.folderId).toBe(folderId)
    expect(terminalSections([first, { ...second, status: "exited" }])[0]?.folderId).toBe(folderId)
    expect(terminalSections([first, { ...second, status: "failed" }])[0]?.folderId).toBe(folderId)
  })
  test("keeps the section's folder and collapses a closed split", () => {
    const ordinary = session("shell", { folderId: "work" })
    const agent = session("agent", { column: 1, folderId: "work", agent: null })
    expect(terminalSections([ordinary, agent])[0]?.folderId).toBe("work")
    expect(normalizeSectionLayout([agent], "one")[0]).toMatchObject({ row: 0, column: 0 })
    expect(normalizeSectionLayout([session("below", { row: 1 })], "one")[0]?.row).toBe(0)
  })
  test("orders Master Key targets as visible agents followed by expanded terminals", () => {
    const shell = session("shell")
    const agent = session("agent", {
      agent: { key: "codex", label: "Codex", profile: "codex", state: "working", activity: null },
    })
    const hidden = session("hidden", { folderId: "tmux", sectionId: "two" })
    expect(
      visibleTerminalShortcutTargets(
        [shell, agent, hidden],
        [
          { id: DEFAULT_FOLDER, name: "Tuiminais" },
          { id: "tmux", name: "tmux" },
        ],
        ["tmux"],
      ).map(({ id }) => id),
    ).toEqual(["agent", "shell"])
  })
  test("orders terminal agents before localhost-integrated agents", () => {
    const agent = {
      key: "codex",
      label: "Codex",
      profile: "codex" as const,
      state: "working" as const,
      activity: null,
    }
    const remoteTmux = session("remote-tmux", {
      agent,
      tmux: { socket: "/tmp/tmux", sessionId: "$1", name: "work", paneId: "%1" },
    })
    const remoteExternal = session("remote-external", {
      agent,
      external: { terminalId: "pts/7" },
      backend: "external",
    })
    const ownedTmux = session("owned-tmux", {
      agent,
      tmux: {
        socket: "/tmp/tuiminal",
        sessionId: "$2",
        name: "tuiminal",
        paneId: "%2",
        ownedByTuiminal: true,
      },
    })
    const native = session("native", { agent, backend: "native" })
    const localhost = session("localhost", {
      agent,
      agentIntegration: "codex-app-server",
      backend: "native",
    })

    expect(
      orderedRunningAgents([localhost, remoteTmux, native, remoteExternal, ownedTmux]).map(
        ({ id }) => id,
      ),
    ).toEqual(["remote-tmux", "native", "remote-external", "owned-tmux", "localhost"])
  })
  test("limits Master Key labels to its nine direct keys", () => {
    expect(masterKeyShortcutLabel(0)).toBe("[1]")
    expect(masterKeyShortcutLabel(8)).toBe("[9]")
    expect(masterKeyShortcutLabel(9)).toBeNull()
  })
  test("keeps exit and failure states visible in sidebar titles", () => {
    expect(terminalStatusMarker("running")).toBe("○")
    expect(terminalStatusMarker("running", true)).toBe("●")
    expect(terminalStatusMarker("exited")).toBe("■")
    expect(terminalStatusMarker("failed")).toBe("×")
    expect(terminalStatusLabel("starting")).toBe("Iniciando")
    expect(terminalStatusLabel("running")).toBe("Ocioso")
    expect(terminalStatusLabel("running", true)).toBe("Executando")
    expect(terminalStatusLabel("exited")).toBe("Encerrado")
    expect(terminalStatusLabel("failed")).toBe("Falhou")
  })
  test("uses the most useful second-line context for each session kind", () => {
    expect(
      terminalSessionDetail(session("shell", { workingDirectory: "/workspace/tuiminal" })),
    ).toBe("tuiminal · native")
    expect(terminalSessionDetail(session("root", { workingDirectory: "/" }))).toBe("/ · native")
    expect(
      terminalSessionDetail(
        session("custom", {
          kind: "custom",
          displayCommand: "bun run dev",
          backend: "native",
        }),
      ),
    ).toBe("bun run dev · native")
    expect(
      terminalSessionDetail(
        session("mirror", {
          workingDirectory: "/workspace/api",
          backend: "tmux",
          tmux: { socket: "/tmp/tmux", sessionId: "$1", name: "work", paneId: "%2" },
        }),
      ),
    ).toBe("api · tmux")
    expect(terminalSessionDetail(session("failed", { status: "failed", exitCode: 2 }))).toBe(
      "exit 2 · native",
    )
    expect(
      terminalSessionDetail(
        session("external", {
          backend: "external",
          external: { terminalId: "pts/7" },
          workingDirectory: "/workspace/other",
        }),
      ),
    ).toBe("other · pts/7")
    expect(
      terminalSessionDetail(
        session("external-no-directory", {
          backend: "external",
          external: { terminalId: "pts/8" },
        }),
      ),
    ).toBe("pts/8")
  })
})

test("folder and terminal names preserve complete Unicode graphemes", () => {
  expect(cleanTerminalName("\u001b Demo\n")).toBe("Demo")
  expect(cleanTerminalName("界".repeat(81))).toBe("界".repeat(80))
  expect(cleanTerminalName("👩‍💻".repeat(81))).toBe("👩‍💻".repeat(80))
})
