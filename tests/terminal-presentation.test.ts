import { describe, expect, test } from "bun:test"
import {
  terminalSessionDetail,
  terminalStatusLabel,
  terminalStatusMarker,
} from "../packages/feature-terminal/src/rendering/presentation"
import {
  cleanTerminalName,
  DEFAULT_FOLDER,
  MAX_TERMINALS_PER_SECTION,
  normalizeSectionLayout,
  terminalSections,
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
