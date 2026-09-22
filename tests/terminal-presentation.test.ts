import { describe, expect, test } from "bun:test"
import {
  AGENT_WORKING_FRAMES,
  agentPresentation,
  codexActivityIndicators,
} from "../packages/feature-terminal/src/rendering/agent-presentation"
import { tmuxAgentNotice } from "../packages/feature-terminal/src/rendering/tmux-agent-notice"
import {
  createCodexAgentCommand,
  createCodexTerminalCommand,
} from "../packages/feature-terminal/src/services/terminal"
import { codexAppServerActivity } from "../packages/feature-terminal/src/services/codex-app-server"
import {
  terminalSessionDetail,
  terminalStatusLabel,
  terminalStatusMarker,
} from "../packages/feature-terminal/src/rendering/presentation"
import {
  cleanTerminalName,
  DEFAULT_FOLDER,
  masterKeyShortcutLabel,
  MAX_TERMINALS_PER_SECTION,
  normalizeSectionLayout,
  terminalSections,
  visibleTerminalShortcutTargets,
  type TerminalSession,
} from "../packages/feature-terminal/src/model/sessions"

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
  test("keeps the working loader", () => {
    expect(AGENT_WORKING_FRAMES).toEqual(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
    expect(agentPresentation("working", 1)).toMatchObject({
      marker: "⠙",
      shortLabel: "Trabalhando",
    })
  })
  test("maps only public app-server item kinds to the structured Codex indicators", () => {
    expect(
      codexAppServerActivity({ method: "item/started", params: { item: { type: "reasoning" } } }),
    ).toBe("thinking")
    expect(
      codexAppServerActivity({
        method: "item/started",
        params: { item: { type: "commandExecution" } },
      }),
    ).toBe("running")
    expect(codexAppServerActivity({ method: "item/plan/delta" })).toBe("updating")
    expect(codexAppServerActivity({ method: "item/fileChange/patchUpdated" })).toBe("coding")
    expect(codexAppServerActivity({ method: "item/reasoning/textDelta" })).toBeNull()
    expect(codexActivityIndicators("coding", 2)).toEqual([
      { key: "thinking", marker: "◑", active: false },
      { key: "command", marker: "›_", active: false },
      { key: "update", marker: "◆", active: false },
      { key: "code", marker: "{}", active: true },
    ])
  })
  test("starts the native Codex CLI in a real terminal", () => {
    expect(createCodexTerminalCommand()).toMatchObject({
      kind: "custom",
      label: "Codex",
      displayCommand: "codex",
      command: ["codex"],
    })
  })
  test("creates a first-party app-server session instead of a shell command", () => {
    expect(createCodexAgentCommand("Corrija o login")).toMatchObject({
      kind: "codex",
      label: "Codex",
      displayCommand: "codex app-server",
      command: [],
      codex: { prompt: "Corrija o login" },
    })
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
