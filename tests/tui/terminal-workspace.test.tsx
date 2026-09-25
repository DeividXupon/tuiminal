import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { rmSync } from "node:fs"
import {
  type BoxRenderable,
  CodeRenderable,
  type DiffRenderable,
  type EmbeddedTerminalRenderable,
  type InputRenderable,
  LineNumberRenderable,
  RGBA,
  type ScrollBoxRenderable,
} from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../../apps/cli/src/App"
import {
  COLORS,
  getUiSettings,
  paletteFor,
  updateUiSettings,
} from "../../packages/core/src/settings/theme"
import { BRAND_COLOR } from "../../packages/core/src/ui/brand"
import type { ProcessIdentity } from "../../packages/feature-terminal/src/model/agent-detection"
import { EMPTY_AGENT_MESSAGE_TURN_DETAIL } from "../../packages/feature-terminal/src/model/agent-message-history"
import {
  publishCodexResumeThreads,
  resetCodexResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/codex-resume-threads"
import {
  resetPinnedTerminalSidebarForTests,
  setTmuxHostSidebar,
  terminalSidebarReplica,
  terminalSidebarSnapshot,
} from "../../packages/feature-terminal/src/model/pinned-sidebar"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import * as codexServer from "../../packages/feature-terminal/src/services/codex-app-server"
import * as liveDiff from "../../packages/feature-terminal/src/services/live-diff"
import * as liveDiffProjects from "../../packages/feature-terminal/src/services/live-diff-projects"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  terminalWorkspaceStatePath,
} from "../../packages/feature-terminal/src/services/terminal-workspace-state"
import { FreeTerminal } from "../../packages/feature-terminal/src/TerminalWorkspace"
import {
  TerminalActions,
  terminalActionKey,
} from "../../packages/feature-terminal/src/ui/TerminalActions"

const originalSettings = getUiSettings()
const originalOnlyTab = process.env.TUIMINAL_ONLY_TAB
const originalInitialTab = process.env.TUIMINAL_INITIAL_TAB
const originalWorkspaceState = process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
let tui: TestRendererSetup | undefined
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "startFreeTerminalProcess">> | undefined
let codexSpy:
  | ReturnType<typeof spyOn<typeof codexServer, "startCodexAppServerTerminal">>
  | undefined
let codexResumeSpy:
  | ReturnType<typeof spyOn<typeof codexServer, "refreshCodexResumeThreads">>
  | undefined
let codexEvents: codexServer.CodexAppServerEvents | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
const liveDiffSpies: Array<{ mockRestore: () => void }> = []
const inputs: string[][] = []
const starts: Parameters<typeof processes.startFreeTerminalProcess>[1][] = []
const commands: string[][] = []
let snapshot: ProcessIdentity[] = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  codexSpy?.mockRestore()
  codexResumeSpy?.mockRestore()
  codexEvents = undefined
  inspectionSpy?.mockRestore()
  for (const spy of liveDiffSpies.splice(0)) spy.mockRestore()
  inputs.length = 0
  starts.length = 0
  commands.length = 0
  snapshot = []
  resetPinnedTerminalSidebarForTests()
  resetCodexResumeThreadsForTests()
  updateUiSettings(originalSettings)
  if (originalOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = originalOnlyTab
  if (originalInitialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = originalInitialTab
  if (originalWorkspaceState === undefined) delete process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
  else process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = originalWorkspaceState
  rmSync(terminalWorkspaceStatePath(processes.FREE_TERMINAL_WORKING_DIRECTORY), {
    force: true,
  })
})

async function mount(
  app = false,
  width = 120,
  height = 30,
  actions: {
    onOpenSettings?: () => void
    onSelectTool?: (tool: "database" | "git" | "runner" | "http" | "terminal") => void
    onQuit?: () => void
  } = {},
  fullApp = false,
) {
  updateUiSettings({ terminalMasterKey: "Ctrl+B", language: "pt-BR", layout: "framed" })
  inspectionSpy = spyOn(inspection, "readTerminalProcesses").mockImplementation(
    async () => snapshot,
  )
  spawnSpy = spyOn(processes, "startFreeTerminalProcess").mockImplementation((command, options) => {
    commands.push(command)
    starts.push(options)
    const input: string[] = []
    inputs.push(input)
    return {
      pid: 100 + starts.length,
      write: (data) => input.push(typeof data === "string" ? data : new TextDecoder().decode(data)),
      resize: () => undefined,
      stop: async () => undefined,
    }
  })
  codexSpy = spyOn(codexServer, "startCodexAppServerTerminal").mockImplementation(
    async (options, events) => {
      codexEvents = events
      commands.push(
        options.resumeThreadId
          ? ["codex", "resume", options.resumeThreadId, "--remote", "ws://127.0.0.1:4500"]
          : ["codex", "--remote", "ws://127.0.0.1:4500"],
      )
      starts.push(options)
      return { pid: 500, backend: "native", write() {}, resize() {}, async stop() {} }
    },
  )
  codexResumeSpy = spyOn(codexServer, "refreshCodexResumeThreads").mockResolvedValue([])
  if (app) process.env.TUIMINAL_ONLY_TAB = "terminal"
  if (fullApp) {
    delete process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_INITIAL_TAB = "terminal"
  }
  tui = await testRender(app || fullApp ? <App /> : <FreeTerminal active {...actions} />, {
    width,
    height,
  })
  await tui.renderOnce()
}
async function key(name: string, ctrl = false) {
  await act(async () => {
    if (name === "enter") tui?.mockInput.pressEnter()
    else if (name === "escape") tui?.mockInput.pressEscape()
    else if (name === "backspace") tui?.mockInput.pressBackspace()
    else if (name === "tab") tui?.mockInput.pressTab()
    else tui?.mockInput.pressKey(name, { ctrl })
    if (name === "escape") await Bun.sleep(70)
  })
  await tui?.renderOnce()
}
async function arrow(direction: "up" | "down" | "left" | "right") {
  await act(async () => tui?.mockInput.pressArrow(direction))
  await tui?.renderOnce()
}
async function leader(action: string) {
  await key("b", true)
  await key(action)
}
async function split(action: "v" | "h") {
  await leader(action)
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeDefined()
  await key("n")
}
async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}
function focusedTerminal() {
  return tui?.renderer.currentFocusedRenderable as EmbeddedTerminalRenderable
}
function spanColor(text: string, line?: number) {
  const lines = tui?.captureSpans().lines ?? []
  const span = (line === undefined ? lines : lines.slice(line, line + 1))
    .flatMap((entry) => entry.spans)
    .find((entry) => entry.text.includes(text))
  if (!span) throw new Error(`Missing colored text ${text}\n${tui?.captureCharFrame()}`)
  return span.fg.toInts()
}
function renderable(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  return target
}
async function text(value: string) {
  await act(async () => tui?.mockInput.typeText(value))
  await key("enter")
}

test("Master Key action parsing accepts Alt tool keys and ignores unrelated modifiers", () => {
  expect(terminalActionKey({ name: "2", meta: true })).toBe("alt+2")
  expect(terminalActionKey({ name: "3", option: true })).toBe("alt+3")
  expect(terminalActionKey({ name: "5", option: true })).toBe("alt+5")
  expect(terminalActionKey({ name: "escape", sequence: "1", option: true })).toBe("alt+1")
  expect(terminalActionKey({ name: "1", meta: true, ctrl: true })).toBeNull()
  expect(terminalActionKey({ name: "6", meta: true })).toBeNull()
  expect(terminalActionKey({ name: "q", ctrl: true })).toBeNull()
  expect(terminalActionKey({ name: "," })).toBe(",")
})

test("tmux helper Master Key uses compact Actions and Agents tabs", async () => {
  tui = await testRender(
    <TerminalActions
      compact
      width={34}
      height={28}
      recentThreads={[
        {
          id: "compact-agent",
          title: "Agente compacto",
          preview: "Continue a tarefa",
          lastResponse: "Pronto para continuar.",
          cwd: "/workspace/project",
          updatedAt: Date.now(),
          state: "idle",
        },
      ]}
      onAction={() => undefined}
      onSelectThread={() => undefined}
      disabled={() => false}
    />,
    { width: 34, height: 28 },
  )
  await tui.renderOnce()

  const modal = renderable("terminal-actions") as BoxRenderable
  expect(modal.width).toBe(34)
  expect(modal.height).toBe(24)
  expect(modal.screenX).toBe(0)
  expect(modal.screenY + modal.height).toBe(28)
  expect(modal.border).toEqual([])
  expect(tui.renderer.root.findDescendantById("terminal-action-tab-actions")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-action-tab-agents")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeUndefined()

  await arrow("right")
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-resume-thread-compact-agent")).toBeDefined()

  await click("terminal-action-tab-actions")
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeUndefined()
})

test("Master Key opens the official Codex TUI connected to app-server", async () => {
  await mount()
  await leader("a")
  expect(commands[0]).toEqual(["codex", "--remote", "ws://127.0.0.1:4500"])
  expect(codexSpy).toHaveBeenCalledTimes(1)
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
})

test("Master Key lists and resumes conversations from the local Codex /resume list", async () => {
  await mount(false, 140, 36)
  await leader("a")
  await act(async () => {
    publishCodexResumeThreads([
      {
        id: "0199-resume-login",
        title: "Revisar autenticação",
        preview: "Corrija o fluxo de login do projeto",
        lastResponse: "O login foi corrigido e os testes passaram.",
        cwd: "/workspace/project",
        updatedAt: Date.now(),
        state: "working",
      },
      {
        id: "0199-resume-login-mobile",
        title: "Revisar login mobile",
        preview: "Confira o fluxo de login em telas pequenas",
        lastResponse: "A experiência mobile foi revisada.",
        cwd: "/workspace/project",
        updatedAt: Date.now() - 125_000,
        state: "idle",
      },
    ])
  })
  await tui?.renderOnce()
  await key("b", true)

  expect(
    tui?.renderer.root.findDescendantById("terminal-resume-thread-0199-resume-login"),
  ).toBeDefined()

  await key("/")
  await act(async () => tui?.mockInput.typeText("login"))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("AGENTES · CODEX /RESUME")
  expect(tui?.captureCharFrame()).toContain("Revisar autenticação")
  expect(tui?.captureCharFrame()).toContain("Corrija o fluxo de login")
  expect(spanColor("Revisar autenticação")).toEqual(RGBA.fromHex(COLORS.terminal).toInts())
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-actions")
  await arrow("right")
  expect(tui?.captureCharFrame()).toContain("› AGENTES · CODEX /RESUME")
  expect(tui?.captureCharFrame()).toContain("O login foi corrigido")
  expect(tui?.captureCharFrame()).toContain("passaram.")
  expect(tui?.captureCharFrame()).toContain("Corrija o fluxo de login do projeto")
  expect(tui?.captureCharFrame()).toContain("Ocioso · 2m")
  expect(spanColor("· 2m")).toEqual(RGBA.fromHex(COLORS.text).toInts())
  const responsePanel = tui?.renderer.root.findDescendantById("terminal-agent-response-panel")
  const responseText = tui?.renderer.root.findDescendantById("terminal-agent-response-text")
  const actionsModal = tui?.renderer.root.findDescendantById("terminal-actions")
  const selectedAgent = tui?.renderer.root.findDescendantById(
    "terminal-resume-thread-0199-resume-login",
  )
  expect(actionsModal?.width).toBe(120)
  expect(responsePanel?.screenY).toBeGreaterThan(selectedAgent?.screenY ?? 0)
  expect((responsePanel as BoxRenderable | undefined)?.border).toBe(false)
  expect(responseText?.height).toBe(3)
  expect(tui?.renderer.root.findDescendantById("terminal-agent-response-tooltip")).toBeUndefined()
  expect(spanColor("Revisar autentica")).toEqual(RGBA.fromHex(COLORS.focus).toInts())
  expect(spanColor("O login foi corrigido")).toEqual(RGBA.fromHex(COLORS.focus).toInts())
  await arrow("down")
  expect(tui?.captureCharFrame()).toContain("A experiência mobile foi revisada.")
  await arrow("up")
  expect(tui?.captureCharFrame()).toContain("O login foi corrigido")
  await key("enter")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(codexSpy).toHaveBeenCalledTimes(2)
  expect(commands.at(-1)).toEqual([
    "codex",
    "resume",
    "0199-resume-login",
    "--remote",
    "ws://127.0.0.1:4500",
  ])
})

test("Master Key idle time uses the light palette's primary text color", async () => {
  updateUiSettings({ colorMode: "light", palette: "prime" })
  await mount(false, 140, 36)
  await act(async () => {
    publishCodexResumeThreads([
      {
        id: "0199-resume-light-idle",
        title: "Agente ocioso",
        preview: "Última tarefa concluída",
        lastResponse: "A tarefa foi concluída.",
        cwd: "/workspace/project",
        updatedAt: Date.now() - 125_000,
        state: "idle",
      },
    ])
  })
  await tui?.renderOnce()
  await key("b", true)
  await arrow("right")

  expect(tui?.captureCharFrame()).toContain("Ocioso · 2m")
  expect(spanColor("· 2m")).toEqual(RGBA.fromHex(paletteFor("prime", "light").text).toInts())
  await arrow("left")
  const actionTitle = renderable("terminal-action-title-a")
  expect(spanColor("Novo Codex", actionTitle.screenY)).toEqual(
    RGBA.fromHex(paletteFor("prime", "light").text).toInts(),
  )
})

test("Master Key S opens a navigable sent-message history below the agent terminal", async () => {
  await mount(false, 140, 36)
  await leader("a")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  await act(async () => {
    codexEvents?.onUserMessageHistory(
      [
        {
          id: "anterior",
          turnId: "turn-anterior",
          text: "Mensagem anterior do agente aberto",
          sentAt: Date.now() - 60_000,
          durationMs: 12_000,
          status: "completed",
          hasImage: false,
          hasAudio: false,
          hasSkill: false,
          model: null,
          effort: null,
          serviceTier: null,
          ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
        },
      ],
      true,
    )
    codexEvents?.onUserMessageHistory(
      [
        {
          id: "mais-antiga",
          turnId: "turn-mais-antiga",
          text: "Mensagem de outra página",
          sentAt: Date.now() - 120_000,
          durationMs: 45_000,
          status: "interrupted",
          hasImage: false,
          hasAudio: false,
          hasSkill: false,
          model: null,
          effort: null,
          serviceTier: null,
          ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
        },
      ],
      false,
    )
    codexEvents?.onUserMessage({
      id: "primeira",
      turnId: "turn-primeira",
      text: "Primeira mensagem enviada ao agente",
      sentAt: Date.now() - 1_000,
      durationMs: 1_080_000,
      status: "completed",
      hasImage: false,
      hasAudio: false,
      hasSkill: false,
      model: "gpt-6-sol",
      effort: "medium",
      serviceTier: "fast",
      finalResponse: "Feito. O texto agora usa a cor principal do tema.",
      commentary: ["Vou validar o painel e executar os testes."],
      reasoningSummaries: ["O painel precisava preservar contraste em temas claros e escuros."],
      plans: ["Atualizar o painel\nAdicionar cobertura de interface"],
      activities: [
        {
          id: "command-1",
          kind: "command",
          label: "bun test tests/tui/terminal-workspace.test.tsx",
          detail: "1 pass",
          at: Date.now() - 500,
        },
      ],
      changes: [
        {
          id: "change-1",
          path: "packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx",
          kind: "update",
          diff: "diff --git a/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx b/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx\n--- a/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx\n+++ b/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx\n@@ -1 +1 @@\n-old\n+new",
        },
        {
          id: "change-2",
          path: "packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx",
          kind: "create",
          diff: "diff --git a/packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx b/packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx\n--- /dev/null\n+++ b/packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx\n@@ -0,0 +1 @@\n+export const visual = true",
        },
      ],
      turnDiff:
        "diff --git a/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx b/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx\n--- a/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx\n+++ b/packages/feature-terminal/src/ui/AgentMessageHistoryPanel.tsx\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx b/packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx\n--- /dev/null\n+++ b/packages/feature-terminal/src/ui/AgentMessageDiffDetail.tsx\n@@ -0,0 +1 @@\n+export const visual = true",
    })
    codexEvents?.onUserMessage({
      id: "segunda",
      turnId: "turn-segunda",
      text: "Segunda mensagem enviada ao agente",
      sentAt: Date.now(),
      durationMs: null,
      status: "inProgress",
      hasImage: true,
      hasAudio: true,
      hasSkill: true,
      model: "gpt-6-sol",
      effort: "medium",
      serviceTier: "fast",
      ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
    })
  })
  await tui?.renderOnce()
  await leader("s")

  const app = tui
  if (!app) throw new Error("Missing TUI")
  const panel = app.renderer.root.findDescendantById(
    `agent-message-history-${sessionId}`,
  ) as BoxRenderable | null
  if (!panel) throw new Error("Missing sent-message history")
  const terminalColumn = panel.parent?.parent
  if (!terminalColumn) throw new Error("Missing terminal column")
  expect(panel.screenY).toBeGreaterThan(terminal.screenY)
  expect(terminal.height).toBeLessThan(terminalColumn.height)
  expect(app.captureCharFrame()).toContain("Mensagens enviadas · 4")
  expect(app.captureCharFrame()).toContain("Status")
  expect(app.captureCharFrame()).toContain("Imagem")
  expect(app.captureCharFrame()).toContain("Áudio")
  expect(app.captureCharFrame()).toContain("Skill")
  expect(app.captureCharFrame()).toContain("gpt-6-sol · medium · fast")
  expect(app.captureCharFrame()).toContain("Segunda mensagem enviada ao agente")
  expect(app.captureCharFrame()).toContain("Primeira mensagem enviada ao agente")
  expect(app.captureCharFrame()).toContain("Mensagem anterior do agente aberto")
  expect(app.captureCharFrame()).toContain("Mensagem de outra página")
  expect(app.renderer.currentFocusedRenderable?.id).toBe(`agent-message-history-${sessionId}`)
  expect(panel.borderColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  expect(spanColor("[J/K]", panel.screenY + panel.height - 1)).toEqual(
    RGBA.fromHex(BRAND_COLOR).toInts(),
  )

  await leader("m")
  expect(
    app.renderer.root.findDescendantById(`terminal-focus-selection-tint-history-${sessionId}`),
  ).toBeDefined()
  await key("k")
  await key("enter")
  expect(focusedTerminal()).toBe(terminal)
  await leader("m")
  await key("j")
  expect(
    app.renderer.root.findDescendantById(`terminal-focus-selection-tint-history-${sessionId}`),
  ).toBeDefined()
  await key("k")
  await arrow("down")
  expect(
    app.renderer.root.findDescendantById(`terminal-focus-selection-tint-history-${sessionId}`),
  ).toBeDefined()
  await key("enter")
  expect(app.renderer.currentFocusedRenderable?.id).toBe(`agent-message-history-${sessionId}`)

  const header = app
    .captureCharFrame()
    .split("\n")
    .find((line) => line.includes("Tempo") && line.includes("Status"))
  if (!header) throw new Error("Missing sent-message history header")
  expect([
    header.indexOf("Tempo"),
    header.indexOf("Status"),
    header.indexOf("Mensagem"),
    header.indexOf("Imagem"),
    header.indexOf("Áudio"),
    header.indexOf("Skill"),
    header.indexOf("Modelo"),
  ]).toEqual(
    [...header.matchAll(/Tempo|Status|Mensagem|Imagem|Áudio|Skill|Modelo/g)].map(
      (match) => match.index,
    ),
  )
  const spans = app.captureSpans().lines.flatMap((line) => line.spans)
  expect(spans.find((span) => span.text.includes("Segunda mensagem"))?.fg.toInts()).toEqual(
    RGBA.fromHex(COLORS.text).toInts(),
  )
  expect(spans.find((span) => span.text.includes("gpt-6-sol"))?.fg.toInts()).toEqual(
    RGBA.fromHex(COLORS.terminal).toInts(),
  )

  const selectedLine = () =>
    app
      .captureCharFrame()
      .split("\n")
      .slice(panel.screenY, panel.screenY + panel.height)
      .find((line) => line.includes("▌"))
  const selectedBefore = selectedLine()
  expect(selectedBefore).toContain("Segunda mensagem enviada ao agente")
  expect(selectedBefore).toContain("0s …")
  expect(selectedBefore?.match(/✓/g)).toHaveLength(3)
  await key("j")
  const selectedAfter = selectedLine()
  expect(selectedAfter).toContain("Primeira mensagem enviada ao agente")
  expect(selectedAfter).toContain("18m ✓")
  const tableHeight = panel.height
  await key("enter")
  await app.renderOnce()
  expect(panel.height).toBeGreaterThan(tableHeight)
  expect(panel.height).toBeLessThanOrEqual(Math.ceil(terminalColumn.height * 0.5))
  expect(panel.height).toBeGreaterThanOrEqual(Math.floor(terminalColumn.height * 0.5) - 1)
  const overview = app.renderer.root.findDescendantById("agent-message-overview-primeira")
  expect(overview?.height).toBeGreaterThan(Math.floor(panel.height * 0.8))
  expect(app.captureCharFrame()).toContain("Detalhes da mensagem · 18m ✓")
  expect(app.captureCharFrame()).toContain("MENSAGEM [M]")
  expect(app.captureCharFrame()).toContain("RESPOSTA FINAL [R]")
  expect(app.captureCharFrame()).toContain("ATIVIDADE [A]")
  expect(app.captureCharFrame()).toContain("ALTERAÇÕES [D]")
  expect(app.captureCharFrame()).toContain("Feito. O texto agora usa a cor principal do tema.")
  const messageHeading = app
    .captureCharFrame()
    .split("\n")
    .findIndex((line) => line.includes("MENSAGEM [M]"))
  expect(spanColor("[M]", messageHeading)).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  await click(`free-terminal-${sessionId}`)
  expect(focusedTerminal()).toBe(terminal)
  expect(panel.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.border).toInts())
  expect(spanColor("[M]", messageHeading)).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  await click(`agent-message-history-${sessionId}`)
  expect(app.renderer.currentFocusedRenderable?.id).toBe(`agent-message-history-${sessionId}`)
  expect(panel.borderColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  expect(spanColor("[M]", messageHeading)).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())

  await act(async () => {
    codexEvents?.onUserMessageHistory(
      [
        {
          id: "primeira",
          turnId: "turn-primeira",
          text: "Primeira mensagem enviada ao agente",
          sentAt: Date.now() - 1_000,
          durationMs: 1_080_000,
          status: "completed",
          hasImage: false,
          hasAudio: false,
          hasSkill: false,
          model: "gpt-6-sol",
          effort: "medium",
          serviceTier: "fast",
          ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
          finalResponse: "Resposta atualizada ao vivo sem reset.",
        },
      ],
      false,
    )
  })
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("Resposta atualizada ao vivo sem reset.")

  await key("r")
  expect(app.captureCharFrame()).toContain("RESUMOS PÚBLICOS")
  expect(app.captureCharFrame()).toContain(
    "O painel precisava preservar contraste em temas claros e escuros.",
  )
  for (let index = 0; index < 12; index += 1) await key("j")
  expect(app.captureCharFrame()).toContain("O raciocínio interno privado não é exibido.")
  await key("escape")
  await key("a")
  expect(app.captureCharFrame()).toContain("Comando executado")
  expect(app.captureCharFrame()).toContain("bun test tests/tui/terminal-workspace.test.tsx")
  await key("escape")
  await key("d")
  expect(app.captureCharFrame()).toContain("AgentMessageHistoryPanel.tsx")
  expect(app.captureCharFrame()).toContain("2 arquivos")
  expect(app.captureCharFrame()).toContain("1 + new")
  const firstMessageDiff = app.renderer.root.findDescendantById(
    "agent-message-turn-diff-primeira-0",
  )
  expect((firstMessageDiff as DiffRenderable).wrapMode).toBe("none")
  for (let index = 0; index < 10; index += 1) await key("j")
  expect(app.captureCharFrame()).toContain("AgentMessageDiffDetail.tsx")
  const secondMessageDiff = app.renderer.root.findDescendantById(
    "agent-message-turn-diff-primeira-1",
  )
  expect((secondMessageDiff as DiffRenderable).wrapMode).toBe("none")
  await key("escape")
  await key("escape")
  expect(app.captureCharFrame()).toContain("Mensagens enviadas · 4")
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)
  expect(spanColor("[J/K]", panel.screenY + panel.height - 1)).toEqual(
    RGBA.fromHex(COLORS.muted).toInts(),
  )

  await leader("d")
  const liveDiff = app.renderer.root.findDescendantById(`live-diff-${sessionId}`)
  if (!liveDiff) throw new Error("Missing Live Diff")
  expect(liveDiff.screenX).toBeGreaterThan(panel.screenX)
  expect(liveDiff.screenY).toBeLessThan(panel.screenY)
  expect(liveDiff.screenY + liveDiff.height).toBeGreaterThanOrEqual(panel.screenY + panel.height)
})

test("Master Key opens a centered searchable modal and Escape restores terminal focus", async () => {
  await mount(true)
  await leader("n")
  const terminal = focusedTerminal()
  const height = terminal.height
  await key("b", true)
  expect(tui?.captureCharFrame()).toContain("Master Key")
  const modal = tui?.renderer.root.findDescendantById("terminal-actions")
  const actionPanel = tui?.renderer.root.findDescendantById("terminal-action-panel")
  const agentPanel = tui?.renderer.root.findDescendantById("terminal-agent-panel")
  expect(modal?.screenX).toBeGreaterThan(0)
  expect(modal?.screenY).toBeGreaterThan(0)
  expect(modal?.width).toBe(118)
  expect((actionPanel as BoxRenderable | undefined)?.border).toBe(false)
  expect((agentPanel as BoxRenderable | undefined)?.border).toBe(false)
  expect(agentPanel?.screenX).toBeGreaterThan(actionPanel?.screenX ?? 0)
  expect(tui?.renderer.root.findDescendantById("terminal-actions-backdrop")).toBeUndefined()
  expect(terminal.height).toBe(height)
  expect(tui?.captureCharFrame()).toContain("Abre um shell em uma nova seção.")
  const newCodex = renderable("terminal-action-a")
  const sentMessages = renderable("terminal-action-s")
  const liveDiff = renderable("terminal-action-d")
  const chooseBox = renderable("terminal-action-m")
  expect(sentMessages.screenY).toBe(newCodex.screenY + 2)
  expect(liveDiff.screenY).toBe(sentMessages.screenY + 2)
  expect(chooseBox.screenY).toBe(liveDiff.screenY + 2)
  for (const action of ["c", "r", "g"])
    expect(tui?.renderer.root.findDescendantById(`terminal-action-${action}`)).toBeUndefined()
  expect(spanColor("Novo Codex", newCodex.screenY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  const featureTag = renderable("terminal-action-tag-d-feature")
  const agentTag = renderable("terminal-action-tag-d-agent")
  expect(featureTag.screenX).toBeGreaterThan(renderable("terminal-action-title-d").screenX)
  expect(agentTag.screenX).toBeGreaterThan(featureTag.screenX)
  expect(spanColor("FEATURE", liveDiff.screenY)).toEqual(RGBA.fromHex(COLORS.graphAccent).toInts())
  expect(spanColor("AGENTE", liveDiff.screenY)).toEqual(RGBA.fromHex(COLORS.database).toInts())
  await key("/")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-action-search")
  await act(async () => tui?.mockInput.typeText("codex"))
  await tui?.renderOnce()
  expect(tui?.renderer.root.findDescendantById("terminal-action-a")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-n")).toBeUndefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-actions")
  expect(terminal.height).toBe(height)
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(focusedTerminal()).toBe(terminal)
  expect(terminal.height).toBe(height)
  expect(inputs[0]).toEqual([])
  await key("b", true)
  await key("b", true)
  expect(inputs[0]?.join("")).toBe("\u0002")
})

test("Free Terminal header and sidebar shortcuts highlight only with the Master Key", async () => {
  await mount(false, 160, 30, {}, true)
  const muted = RGBA.fromHex(COLORS.muted).toInts()
  const brand = RGBA.fromHex(BRAND_COLOR).toInts()
  expect(tui?.captureCharFrame()).not.toContain("[Alt+1–5] MUDAR")

  for (const shortcut of ["[Alt+1]", "[Alt+3]", "[Alt+5]", "[,]", "[Q]"])
    expect(spanColor(shortcut, 0)).toEqual(muted)

  await leader("n")
  const sessionId = focusedTerminal().id.replace("free-terminal-", "")
  const sidebarBefore = renderable("terminal-sidebar")
  const sectionBefore = renderable("terminal-sidebar-section-section-1")
  const statusBefore = renderable(`terminal-sidebar-status-${sessionId}`)
  const sidebarGeometry = {
    x: sidebarBefore.screenX,
    y: sidebarBefore.screenY,
    width: sidebarBefore.width,
    height: sidebarBefore.height,
  }
  const statusX = statusBefore.screenX

  await key("b", true)

  for (const shortcut of ["[Alt+1]", "[Alt+3]", "[Alt+5]", "[,]", "[Q]"])
    expect(spanColor(shortcut, 0)).toEqual(brand)
  const sidebarAfter = renderable("terminal-sidebar")
  const sectionAfter = renderable("terminal-sidebar-section-section-1")
  const statusAfter = renderable(`terminal-sidebar-status-${sessionId}`)
  expect({
    x: sidebarAfter.screenX,
    y: sidebarAfter.screenY,
    width: sidebarAfter.width,
    height: sidebarAfter.height,
  }).toEqual(sidebarGeometry)
  expect(sectionAfter.screenX).toBe(sectionBefore.screenX)
  expect(statusAfter.screenX).toBe(statusX)
  expect(spanColor("[1]", statusAfter.screenY)).toEqual(brand)

  await key("escape")
  for (const shortcut of ["[Alt+1]", "[Alt+3]", "[Alt+5]", "[,]", "[Q]"])
    expect(spanColor(shortcut, 0)).toEqual(muted)
})

test("Master Key two-line action rows execute once by mouse", async () => {
  await mount()
  await key("b", true)
  await click("terminal-action-n")
  expect(commands).toHaveLength(1)
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
})

test("Master Key selects visible terminals with their single-digit sidebar keys", async () => {
  await mount()
  await leader("n")
  const first = focusedTerminal()
  await leader("n")
  const second = focusedTerminal()
  expect(second).not.toBe(first)

  await key("b", true)
  const firstSessionId = first.id.replace("free-terminal-", "")
  const secondSessionId = second.id.replace("free-terminal-", "")
  expect(
    tui?.renderer.root.findDescendantById(`terminal-sidebar-shortcut-${firstSessionId}`),
  ).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-sidebar-shortcut-${secondSessionId}`),
  ).toBeDefined()
  await key("1")

  expect(focusedTerminal()).toBe(first)
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
})

test("Master Key Alt numbers select the five application tools", async () => {
  const selected: string[] = []
  await mount(false, 120, 30, { onSelectTool: (tool) => selected.push(tool) })
  await leader("n")
  for (const [number, expected] of [
    ["1", "database"],
    ["2", "git"],
    ["3", "runner"],
    ["4", "http"],
    ["5", "terminal"],
  ] as const) {
    await key("b", true)
    await act(async () => tui?.mockInput.pressKey(number, { meta: true }))
    await tui?.renderOnce()
    expect(selected.at(-1)).toBe(expected)
    expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  }
  expect(inputs.every((input) => input.length === 0)).toBe(true)
})

test("Master Key Alt tool selection works through the full application", async () => {
  await mount(false, 120, 30, {}, true)
  await leader("n")
  await key("b", true)
  await act(async () => tui?.mockInput.pressKey("1", { meta: true }))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("Banco")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
})

test("Master Key comma and Q invoke application actions without sending shell input", async () => {
  let settings = 0
  let quits = 0
  await mount(false, 120, 30, {
    onOpenSettings: () => settings++,
    onQuit: () => quits++,
  })
  await leader("n")
  await leader(",")
  expect(settings).toBe(1)
  await leader("q")
  expect(quits).toBe(1)
  expect(inputs[0]).toEqual([])
})

test("Master Key comma opens application settings from the terminal", async () => {
  await mount(true)
  await leader("n")
  await leader(",")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(inputs[0]).toEqual([])
})

test("Master Key pins one global sidebar and returns it to the Terminal workspace", async () => {
  await mount(true)
  await leader("n")
  const workspace = tui!.renderer.root.findDescendantById("terminal-workspace")!
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(
    (tui!.renderer.root.findDescendantById("terminal-sidebar") as BoxRenderable).border,
  ).toEqual(["right"])
  expect(panes.screenX).toBeGreaterThan(workspace.screenX)
  await leader("b")
  expect(terminalSidebarSnapshot().pinned).toBe(true)
  expect(workspace.screenX).toBeGreaterThan(0)
  expect(panes.screenX).toBe(workspace.screenX)
  expect((tui!.renderer.root.findDescendantById("terminal-sidebar") as BoxRenderable).border).toBe(
    false,
  )
  await leader("b")
  expect(terminalSidebarSnapshot().pinned).toBe(false)
  expect(workspace.screenX).toBe(0)
  expect(panes.screenX).toBeGreaterThan(workspace.screenX)
})

test("Master Key M can select the pinned global sidebar", async () => {
  await mount(true)
  await leader("n")
  await leader("b")
  await leader("m")
  await arrow("left")
  expect(
    tui?.renderer.root.findDescendantById("terminal-focus-selection-tint-sidebar-main"),
  ).toBeDefined()
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
})

test("Master Key M selects the pinned tmux helper outside the app renderer", async () => {
  await mount(true)
  await leader("n")
  await leader("b")
  await act(async () => setTmuxHostSidebar(true))
  await tui?.renderOnce()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar")).toBeUndefined()

  await leader("m")
  await arrow("left")

  expect(terminalSidebarReplica()?.focusSelectionTarget).toBe("sidebar:main")
  await key("enter")
  expect(terminalSidebarReplica()?.focusSelectionTarget).toBeNull()
})

test("pinned sidebar keeps the custom command dialog accessible", async () => {
  await mount(true)
  await leader("b")
  await click("terminal-sidebar-command")
  expect(tui?.renderer.root.findDescendantById("terminal-command-input")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
})

test("Master Key can move keyboard focus from a terminal into the sidebar", async () => {
  await mount()
  await leader("n")
  await leader("l")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
})

test("Master Key M selects visible boxes with arrows or HJKL before moving focus", async () => {
  await mount()
  await leader("n")
  const first = focusedTerminal()
  const firstId = first.id.replace("free-terminal-", "")
  await split("v")
  const second = focusedTerminal()
  const secondId = second.id.replace("free-terminal-", "")
  const sidebar = renderable("terminal-sidebar")
  const sidebarSection = renderable("terminal-sidebar-section-section-1")
  const sidebarGeometry = {
    x: sidebar.screenX,
    y: sidebar.screenY,
    width: sidebar.width,
    height: sidebar.height,
    sectionX: sidebarSection.screenX,
    sectionY: sidebarSection.screenY,
    sectionWidth: sidebarSection.width,
    sectionHeight: sidebarSection.height,
  }

  const expectStableSidebar = () => {
    const currentSidebar = renderable("terminal-sidebar")
    const currentSection = renderable("terminal-sidebar-section-section-1")
    expect(currentSidebar).toBe(sidebar)
    expect(currentSection).toBe(sidebarSection)
    expect({
      x: currentSidebar.screenX,
      y: currentSidebar.screenY,
      width: currentSidebar.width,
      height: currentSidebar.height,
      sectionX: currentSection.screenX,
      sectionY: currentSection.screenY,
      sectionWidth: currentSection.width,
      sectionHeight: currentSection.height,
    }).toEqual(sidebarGeometry)
    expect(
      tui?.renderer.root.findDescendantById(`terminal-sidebar-shortcut-${firstId}`),
    ).toBeUndefined()
    expect(
      tui?.renderer.root.findDescendantById(`terminal-sidebar-shortcut-${secondId}`),
    ).toBeUndefined()
  }

  await leader("m")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(tui?.captureCharFrame()).toContain("Pressione [Enter] para focar")
  expectStableSidebar()
  const selectedTint = tui?.renderer.root.findDescendantById(
    `terminal-focus-selection-tint-terminal-${secondId}`,
  ) as BoxRenderable | null
  expect(selectedTint?.backgroundColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-tint-terminal-${secondId}`),
  ).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-tint-terminal-${firstId}`),
  ).toBeUndefined()
  const firstDim = tui?.renderer.root.findDescendantById(
    `terminal-focus-selection-dim-terminal-${firstId}`,
  ) as BoxRenderable | null
  const sidebarDim = tui?.renderer.root.findDescendantById(
    "terminal-focus-selection-dim-sidebar-main",
  ) as BoxRenderable | null
  expect(firstDim?.backgroundColor.toInts()).toEqual(RGBA.fromHex("#000000").toInts())
  expect(sidebarDim?.backgroundColor.toInts()).toEqual(RGBA.fromHex("#000000").toInts())
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-dim-terminal-${secondId}`),
  ).toBeUndefined()

  await arrow("left")
  expectStableSidebar()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-tint-terminal-${firstId}`),
  ).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-dim-terminal-${secondId}`),
  ).toBeDefined()
  await key("escape")
  expect(focusedTerminal()).toBe(second)
  expectStableSidebar()

  await leader("m")
  await arrow("left")
  await arrow("left")
  const sidebarTint = tui?.renderer.root.findDescendantById(
    "terminal-focus-selection-tint-sidebar-main",
  ) as BoxRenderable | null
  expect(sidebarTint?.backgroundColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  const prompt = tui?.renderer.root.findDescendantById(
    "terminal-focus-selection-prompt",
  ) as BoxRenderable | null
  expect(prompt?.backgroundColor.toInts()).toEqual(RGBA.fromHex(COLORS.panelRaised).toInts())
  expect(prompt?.borderColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")

  await leader("m")
  await arrow("right")
  await key("l")
  expectStableSidebar()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-tint-terminal-${secondId}`),
  ).toBeDefined()
  await key("h")
  await key("enter")

  expect(focusedTerminal()).toBe(first)
  expectStableSidebar()

  await leader("m")
  await click(`terminal-focus-selection-terminal-${secondId}`)
  expect(focusedTerminal()).toBe(second)
  expectStableSidebar()
  expect(inputs.every((input) => input.length === 0)).toBe(true)
})

test("returning from the pinned sidebar redraws and keeps the terminal visible", async () => {
  await mount(true)
  await leader("n")
  const terminal = focusedTerminal()
  await act(async () => starts[0]?.onData(new TextEncoder().encode("visible prompt")))
  await tui?.renderOnce()
  expect(terminal.screen().text).toContain("visible prompt")
  const invalidate = spyOn(terminal, "invalidate")

  await leader("b")
  await leader("l")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  await key("enter")

  expect(focusedTerminal()).toBe(terminal)
  expect(terminal.visible).toBe(true)
  expect(terminal.screen().text).toContain("visible prompt")
  expect(invalidate).toHaveBeenCalled()
})

test("mouse wheel scrolls terminal history without sending input to the shell", async () => {
  await mount()
  await leader("n")
  const terminal = focusedTerminal()
  const output = Array.from({ length: 80 }, (_, index) => `history-${index}`).join("\r\n")
  await act(async () => starts[0]?.onData(new TextEncoder().encode(`${output}\r\n`)))
  await tui?.renderOnce()
  expect(terminal.screen().text).toContain("history-79")

  await act(async () => {
    await tui?.mockMouse.scroll(terminal.screenX + 2, terminal.screenY + 2, "up")
  })
  await tui?.renderOnce()
  expect(terminal.screen().text).not.toContain("history-79")
  expect(inputs[0]).toEqual([])
})

test("split confirmation can create a second pane and a third split is refused", async () => {
  await mount()
  await leader("n")
  const first = focusedTerminal()
  await leader("v")
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("O que deseja colocar no novo painel?")
  expect(starts).toHaveLength(1)
  await click("terminal-split-option-0")
  const second = focusedTerminal()
  expect(starts).toHaveLength(2)
  expect(first.screenY).toBe(second.screenY)
  const frame = tui?.renderer.root.findDescendantById(
    `terminal-pane-frame-${first.id.replace("free-terminal-", "")}`,
  )
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(first.height).toBe(frame!.height)
  expect(first.screenX).toBe(panes.screenX)
  expect(first.screenY).toBe(panes.screenY)
  expect(first.height).toBe(panes.height)
  expect(second.screenX).toBe(first.screenX + first.width + 1)
  expect(first.width + second.width + 1).toBe(panes.width)
  expect(tui?.captureCharFrame()).toContain("│")
  await leader("h")
  expect(starts).toHaveLength(2)
  await key("escape")
  const splitWidth = second.width
  await leader("x")
  expect(first.width).toBeGreaterThan(splitWidth)
  for (const old of ["❯ FREE TERMINAL", "CMD", "Seção 2×2", "Split lado", "vivas ·"]) {
    expect(tui?.captureCharFrame()).not.toContain(old)
  }
  expect(starts).toHaveLength(2)
})

test("split confirmation moves an existing agent without restarting it", async () => {
  await mount()
  await leader("a")
  const agent = focusedTerminal()
  await leader("n")
  const shell = focusedTerminal()
  expect(starts).toHaveLength(2)

  await leader("v")
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("AGENTES EXISTENTES")
  expect(tui?.captureCharFrame()).toContain("Codex")
  await click("terminal-split-option-1")

  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(focusedTerminal()).toBe(agent)
  expect(shell.screenY).toBe(agent.screenY)
  expect(shell.width + agent.width + 1).toBe(panes.width)
  expect(agent.screenX).toBe(shell.screenX + shell.width + 1)
  expect(starts).toHaveLength(2)
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1"),
  ).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-2")).toBeDefined()
})

test.each(["keyboard", "mouse"])("new terminals stay separate via %s", async (method) => {
  await mount()
  const create = () => (method === "keyboard" ? leader("n") : click("terminal-sidebar-new"))
  await create()
  const first = focusedTerminal()
  await create()
  const second = focusedTerminal()
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(second).not.toBe(first)
  expect(second.width).toBe(panes.width)
  expect(second.height).toBe(panes.height)
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-2")).toBeDefined()
  await click(`terminal-sidebar-pane-${first.id.replace("free-terminal-", "")}`)
  expect(focusedTerminal()).toBe(first)
  await click(`terminal-sidebar-pane-${second.id.replace("free-terminal-", "")}`)
  expect(focusedTerminal()).toBe(second)
  await split("v")
  const third = focusedTerminal()
  expect(second.width + third.width + 1).toBe(panes.width)
  expect(third.screenX).toBe(second.screenX + second.width + 1)
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-3"),
  ).toBeUndefined()
  expect(starts).toHaveLength(3)
  expect(inputs).toEqual([[], [], []])
})

test("paired sidebar rows support mouse selection", async () => {
  await mount()
  await click("terminal-sidebar-new")
  const first = focusedTerminal()
  await split("h")
  const second = focusedTerminal()
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(second.screenY).toBe(first.screenY + first.height + 1)
  expect(first.height + second.height + 1).toBe(panes.height)
  expect(first.width).toBe(panes.width)
  expect(second.width).toBe(panes.width)
  await leader("e")
  await key("END")
  for (let i = 0; i < "Terminal 2".length; i++) await key("backspace")
  await text("API")
  expect(tui?.captureCharFrame()).toContain("API")
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(folder.parent)
  const firstId = first.id.replace("free-terminal-", "")
  await click(`terminal-sidebar-pane-${firstId}`)
  expect(focusedTerminal()).toBe(first)
  expect(starts).toHaveLength(2)
})

test("legacy custom folders cannot return to the Terminal workspace", async () => {
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  saveTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY, {
    folders: [{ id: "folder-7", name: "Services" }],
    assignments: {},
    collapsedFolderIds: [],
  })

  await mount()

  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")).toBeUndefined()
  await leader("n")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-new-folder")).toBeUndefined()
  expect(loadTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY).folders).toEqual([])
})

test("session folders collapse, persist per project, and omit empty folders", async () => {
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  await mount()

  for (const id of ["terminal", "tmux", "others"])
    expect(tui?.renderer.root.findDescendantById(`terminal-sidebar-folder-${id}`)).toBeUndefined()

  await leader("n")
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  expect(folder).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  await click("terminal-sidebar-folder-terminal")
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1"),
  ).toBeUndefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  expect(tui?.captureCharFrame().split("\n")[folder.screenY]).toContain("▸ Tuiminais")
  expect(loadTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY)).toMatchObject({
    collapsedFolderIds: ["terminal"],
  })

  await key("enter")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  expect(loadTerminalWorkspaceState(processes.FREE_TERMINAL_WORKING_DIRECTORY)).toMatchObject({
    collapsedFolderIds: [],
  })

  await key("enter")
  expect(
    tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1"),
  ).toBeUndefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")

  await click("terminal-sidebar-folder-terminal")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
})

test("changing Master Key in contextual settings takes effect and keeps shell input intact", async () => {
  await mount(true)
  await click("tutorial-settings-button")
  expect(
    tui?.renderer.root.findDescendantById("configuration-section-remoteConnection"),
  ).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("configuration-section-terminal")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("configuration-section-layout")).toBeUndefined()
  await click("configuration-terminal-Ctrl+A")
  expect(getUiSettings().terminalMasterKey).toBe("Ctrl+A")
  await key("escape")
  await key("a", true)
  await key("n")
  expect(starts).toHaveLength(1)
  await key("b", true)
  expect(inputs[0]?.join("")).toBe("\u0002")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  await key("a", true)
  await key("escape")
  expect(inputs[0]?.join("")).toBe("\u0002")
})

test("an agent launched under a shell keeps its pair in Tuiminais without restarting", async () => {
  await mount()
  await leader("n")
  await split("v")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  const agentId = `terminal-agent-${sessionId}`
  const paneId = `terminal-sidebar-pane-${sessionId}`
  const separatorId = `terminal-sidebar-separator-section-1-${sessionId}`
  const folder = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  const originalY = section.screenY
  expect(section.parent).toBe(folder.parent)
  expect(section.findDescendantById(paneId)).toBeDefined()
  expect(section.findDescendantById(separatorId)).toBeDefined()
  snapshot = [
    { pid: 101, parentPid: 1, executable: "sh", command: "sh" },
    { pid: 102, parentPid: 1, executable: "sh", command: "sh" },
    {
      pid: 103,
      parentPid: 102,
      executable: "node",
      command: "node /opt/@openai/codex/bin/codex.js",
    },
  ]
  async function waitForAgent(present: boolean) {
    for (let i = 0; i < 60; i++) {
      await act(async () => Bun.sleep(50))
      await tui?.renderOnce()
      if (Boolean(tui?.renderer.root.findDescendantById(agentId)) === present) return
    }
    throw new Error("Agent sidebar did not update")
  }
  await waitForAgent(true)
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-ai")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById(paneId)).toBeUndefined()
  expect(tui!.captureCharFrame().split("\n")[section.screenY]).toContain("sh")
  expect(section.findDescendantById(separatorId)).toBeUndefined()
  expect(section.parent).toBe(folder.parent)
  expect(section.screenY).toBeGreaterThan(originalY)
  expect(focusedTerminal()).toBe(terminal)
  await click(agentId)
  expect(focusedTerminal()).toBe(terminal)
  expect(starts).toHaveLength(2)
  snapshot = snapshot.slice(0, 2)
  await waitForAgent(false)
  expect(section.findDescendantById(paneId)).toBeDefined()
  expect(section.findDescendantById(separatorId)).toBeDefined()
  expect(section.parent).toBe(folder.parent)
  expect(section.screenY).toBe(originalY)
  expect(focusedTerminal()).toBe(terminal)
  expect(starts).toHaveLength(2)
}, 10_000)

test("removed Master Key actions are absent while new terminals stay in Tuiminais", async () => {
  await mount()
  await key("b", true)
  for (const action of ["t", "tab", "p", "f", "o", "c", "r", "g"])
    expect(tui?.renderer.root.findDescendantById(`terminal-action-${action}`)).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-a")).toBeDefined()
  await key("c")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  await key("r")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  await key("g")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  expect(starts).toHaveLength(0)
  await key("m")
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  await key("/")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-action-search")
  expect(tui?.renderer.root.findDescendantById("terminal-action-d")).toBeDefined()
  await key("escape")
  await key("escape")
  await leader("d")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  await key("escape")
  await click("terminal-sidebar-new")
  const owned = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(owned.parent)
  expect(starts).toHaveLength(1)
})

test.each(["h", "v"] as const)("Live Diff shares its %s split pane", async (direction) => {
  const root = "/fixture/split-live-diff"
  liveDiffSpies.push(
    spyOn(liveDiff, "liveDiffRepositoryRoot").mockResolvedValue(root),
    spyOn(liveDiff, "liveDiffWorktrees").mockResolvedValue([root]),
    spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([]),
    spyOn(liveDiff, "readLiveDiffRoot").mockResolvedValue({
      truncated: false,
      files: [],
    }),
    spyOn(liveDiff, "readLiveDiffPatch").mockResolvedValue(""),
  )
  await mount()
  await leader("a")
  const agentTerminal = focusedTerminal()
  const sessionId = agentTerminal.id.replace("free-terminal-", "")
  await split(direction)
  const siblingTerminal = focusedTerminal()
  const siblingId = siblingTerminal.id.replace("free-terminal-", "")
  await click(`terminal-agent-${sessionId}`)
  const panes = renderable("terminal-panes")
  const agentFrame = renderable(`terminal-pane-frame-${sessionId}`)
  const siblingFrame = renderable(`terminal-pane-frame-${siblingId}`)
  const agentPane = agentFrame.parent!
  if (direction === "h")
    expect(agentTerminal.height + siblingTerminal.height + 1).toBe(panes.height)
  else expect(agentTerminal.width + siblingTerminal.width + 1).toBe(panes.width)

  await leader("d")
  const panel = renderable(`live-diff-${sessionId}`)
  const target = renderable(`terminal-focus-target-live-diff-${sessionId}`)
  expect(target.screenX).toBe(agentPane.screenX)
  expect(target.screenY).toBe(agentTerminal.screenY + agentTerminal.height)
  expect(target.width).toBe(agentPane.width)
  expect(target.height).toBeLessThan(agentPane.height)
  expect(agentTerminal.height).toBeLessThan(agentPane.height)
  expect(Math.abs(target.height - agentTerminal.height)).toBeLessThanOrEqual(2)
  expect(panel.screenX).toBeGreaterThanOrEqual(target.screenX)
  expect(panel.screenY).toBeGreaterThanOrEqual(target.screenY)
  expect(panel.width).toBeLessThanOrEqual(target.width)
  expect(panel.height).toBeLessThanOrEqual(target.height)
  expect(target.width < panes.width || target.height < panes.height).toBe(true)
  expect(siblingFrame.parent?.visible).toBe(true)
  expect(siblingTerminal.width).toBeGreaterThan(0)
  expect(siblingTerminal.height).toBeGreaterThan(0)
  expect(starts).toHaveLength(2)
  await click(`free-terminal-${siblingId}`)
  expect(focusedTerminal()).toBe(siblingTerminal)
  await click(`live-diff-${sessionId}`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)

  await key("escape")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`)).toBeDefined()
  expect(focusedTerminal()).toBe(agentTerminal)
  await leader("d")
  await key("x")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`)).toBeUndefined()
  expect(focusedTerminal()).toBe(agentTerminal)
  expect(siblingFrame.parent?.visible).toBe(true)
  if (direction === "h")
    expect(agentTerminal.height + siblingTerminal.height + 1).toBe(panes.height)
  else expect(agentTerminal.width + siblingTerminal.width + 1).toBe(panes.width)
  expect(starts).toHaveLength(2)
})

test("Live Diff covers its split pane only when the terminal is very small", async () => {
  const root = "/fixture/narrow-split-live-diff"
  liveDiffSpies.push(
    spyOn(liveDiff, "liveDiffRepositoryRoot").mockResolvedValue(root),
    spyOn(liveDiff, "liveDiffWorktrees").mockResolvedValue([root]),
    spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([]),
    spyOn(liveDiff, "readLiveDiffRoot").mockResolvedValue({ truncated: false, files: [] }),
    spyOn(liveDiff, "readLiveDiffPatch").mockResolvedValue(""),
  )
  await mount(false, 76, 18)
  await leader("a")
  const agentTerminal = focusedTerminal()
  const sessionId = agentTerminal.id.replace("free-terminal-", "")
  await split("v")
  const siblingTerminal = focusedTerminal()
  const siblingId = siblingTerminal.id.replace("free-terminal-", "")
  await click(`terminal-agent-${sessionId}`)
  const agentPane = renderable(`terminal-pane-frame-${sessionId}`).parent!
  const siblingPane = renderable(`terminal-pane-frame-${siblingId}`).parent!

  await leader("d")
  const target = renderable(`terminal-focus-target-live-diff-${sessionId}`)
  expect(target.screenX).toBe(agentPane.screenX)
  expect(target.screenY).toBe(agentPane.screenY)
  expect(target.width).toBe(agentPane.width)
  expect(target.height).toBe(agentPane.height)
  expect(siblingPane.visible).toBe(true)
  expect(siblingTerminal.width).toBeGreaterThan(0)
  expect(starts).toHaveLength(2)
})

test("split agents keep independent Live Diff panels", async () => {
  const root = "/fixture/two-live-diffs"
  liveDiffSpies.push(
    spyOn(liveDiff, "liveDiffRepositoryRoot").mockResolvedValue(root),
    spyOn(liveDiff, "liveDiffWorktrees").mockResolvedValue([root]),
    spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([]),
    spyOn(liveDiff, "readLiveDiffRoot").mockResolvedValue({ truncated: false, files: [] }),
    spyOn(liveDiff, "readLiveDiffPatch").mockResolvedValue(""),
  )
  await mount()
  await leader("a")
  const firstId = focusedTerminal().id.replace("free-terminal-", "")
  await leader("a")
  const secondId = focusedTerminal().id.replace("free-terminal-", "")
  await leader("v")
  await click("terminal-split-option-1")

  await leader("d")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${firstId}`)).toBeDefined()
  await click(`terminal-agent-${secondId}`)
  await leader("d")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${firstId}`)).toBeDefined()
  expect(tui?.renderer.root.findDescendantById(`live-diff-${secondId}`)).toBeDefined()
  expect(starts).toHaveLength(2)

  await click(`live-diff-${firstId}`)
  await key("x")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${firstId}`)).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById(`live-diff-${secondId}`)).toBeDefined()
  await click(`terminal-agent-${secondId}`)
  await leader("d")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${secondId}`)
})

test("split Codex agents keep independent sent-message histories", async () => {
  await mount()
  await leader("a")
  const firstId = focusedTerminal().id.replace("free-terminal-", "")
  await leader("a")
  const secondId = focusedTerminal().id.replace("free-terminal-", "")
  await leader("v")
  await click("terminal-split-option-1")

  await leader("s")
  expect(tui?.renderer.root.findDescendantById(`agent-message-history-${firstId}`)).toBeDefined()
  await click(`terminal-agent-${secondId}`)
  await leader("s")
  expect(tui?.renderer.root.findDescendantById(`agent-message-history-${firstId}`)).toBeDefined()
  expect(tui?.renderer.root.findDescendantById(`agent-message-history-${secondId}`)).toBeDefined()
  expect(starts).toHaveLength(2)

  await click(`agent-message-history-${firstId}`)
  await key("x")
  expect(tui?.renderer.root.findDescendantById(`agent-message-history-${firstId}`)).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById(`agent-message-history-${secondId}`)).toBeDefined()
  await click(`terminal-agent-${secondId}`)
  await leader("s")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`agent-message-history-${secondId}`)
})

test("Live Diff polls every 250 ms beside an agent without restarting its terminal", async () => {
  const root = "/fixture/live-worktree"
  const secondRoot = "/fixture/another-project"
  const fingerprints = new Map<number, string>()
  const repository = spyOn(liveDiff, "liveDiffRepositoryRoot").mockImplementation(
    async (directory) => (directory === secondRoot ? secondRoot : root),
  )
  const worktrees = spyOn(liveDiff, "liveDiffWorktrees").mockImplementation(
    async (repositoryRoot) => [repositoryRoot],
  )
  const directories = spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([])
  const read = spyOn(liveDiff, "readLiveDiffRoot").mockImplementation(async (repositoryRoot) => ({
    truncated: false,
    files:
      repositoryRoot === secondRoot
        ? [
            {
              root: secondRoot,
              path: "src/other.ts",
              additions: 1,
              deletions: 0,
              fingerprint: "other",
              untracked: false,
              newFile: false,
              headExists: true,
            },
          ]
        : Array.from({ length: 20 }, (_, index) => ({
            root,
            path: index ? `packages/file-${index}.ts` : "packages/terminal.ts",
            additions: 2,
            deletions: 1,
            fingerprint: fingerprints.get(index) ?? "first",
            untracked: false,
            newFile: index === 1,
            headExists: true,
          })),
  }))
  let patchContent = `diff --git a/packages/terminal.ts b/packages/terminal.ts\n--- a/packages/terminal.ts\n+++ b/packages/terminal.ts\n@@ -1 +1,41 @@\n-old\n+${"long_code_".repeat(20)}\n${Array.from({ length: 40 }, (_, index) => `+added_${index}\n`).join("")}`
  const patch = spyOn(liveDiff, "readLiveDiffPatch").mockImplementation(async (file) =>
    file.path === "packages/file-19.ts"
      ? "diff --git a/packages/file-19.ts b/packages/file-19.ts\n--- a/packages/file-19.ts\n+++ b/packages/file-19.ts\n@@ -1 +1 @@\n-late old\n+late new\n"
      : patchContent,
  )
  const projects = spyOn(liveDiffProjects, "discoverLiveDiffProjects").mockResolvedValue([
    { path: secondRoot, name: "another-project", parent: "fixture" },
  ])
  liveDiffSpies.push(repository, worktrees, directories, read, patch, projects)

  await mount()
  await leader("n")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  snapshot = [
    { pid: 101, parentPid: 1, executable: "sh", command: "sh" },
    { pid: 103, parentPid: 101, executable: "codex", command: "codex" },
  ]
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)) break
  }
  expect(Boolean(tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`))).toBe(true)
  await leader("d")
  expect(Boolean(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`))).toBe(true)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  expect(starts).toHaveLength(1)
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)) break
  }
  expect(tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("New")
  expect(tui?.captureCharFrame()).toContain("Live Diff · Show auto: true")
  const firstPolls = read.mock.calls.length
  for (let attempt = 0; attempt < 14 && read.mock.calls.length < firstPolls + 2; attempt++)
    await act(async () => Bun.sleep(50))
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(firstPolls + 2)
  await click(`live-diff-file-${sessionId}-0`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  const firstRow = tui!.renderer.root.findDescendantById(`live-diff-file-${sessionId}-0`)!
  const cells = firstRow.getChildren()
  for (let index = 1; index < cells.length; index += 1)
    expect(cells[index]!.screenX).toBe(cells[index - 1]!.screenX + cells[index - 1]!.width)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)) break
    await act(async () => Bun.sleep(25))
  }
  const nativeDiff = tui!.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)!
  expect((nativeDiff as DiffRenderable).wrapMode).toBe("none")
  expect(nativeDiff.height).toBeGreaterThan(8)
  expect(tui?.captureCharFrame()).toContain("Último:")
  expect(tui?.captureCharFrame()).toContain("/live-worktree")
  expect(tui?.captureCharFrame()).not.toContain("/fixture/live-worktree")
  const panel = tui!.renderer.root.findDescendantById(`live-diff-${sessionId}`) as BoxRenderable
  expect(panel.borderColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  const frame = tui!.renderer.root.findDescendantById(`terminal-pane-frame-${sessionId}`)!
  expect(panel.parent!.width).toBe(Math.round(frame.width * 0.48) - 14)
  const fileTable = tui!.renderer.root.findDescendantById(`live-diff-file-table-${sessionId}`)!
  const info = tui!.renderer.root.findDescendantById(`live-diff-info-${sessionId}`)!
  const totalsLabel = info.getChildren()[0]!.getChildren()[0]!
  const lastProjectLabel = info.getChildren()[0]!.getChildren()[1]!
  expect(totalsLabel.screenY).toBe(lastProjectLabel.screenY)
  expect(lastProjectLabel.screenX + lastProjectLabel.width).toBeGreaterThanOrEqual(
    info.screenX + info.width - 1,
  )
  expect(tui?.captureCharFrame()).not.toContain("Arquivos · 20")
  expect(tui?.captureCharFrame()).not.toContain("Info")
  const addProject = tui!.renderer.root.findDescendantById(`live-diff-add-${sessionId}`)!
  expect(addProject.screenY).toBeGreaterThan(fileTable.screenY + fileTable.height - 1)
  expect(tui?.captureCharFrame()).toContain("[A] Adicionar projeto")
  expect(tui?.captureCharFrame()).toContain("Observando:")
  const liveDiffShortcutLine = () =>
    tui
      ?.captureCharFrame()
      .split("\n")
      .findIndex((line) => line.includes("[H/L]")) ?? -1
  expect(spanColor("[H/L]", liveDiffShortcutLine())).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  const normalPanelWidth = panel.width
  const normalPanelHeight = panel.height
  const normalPreview = tui!.renderer.root.findDescendantById(`live-diff-preview-${sessionId}`)!
  const normalPreviewWidth = normalPreview.width
  const normalPreviewHeight = normalPreview.height
  const normalPreviewX = normalPreview.screenX
  const normalFileWidth = fileTable.width
  const normalFileHeight = fileTable.height
  const normalInfoWidth = info.width
  const normalInfoHeight = info.height
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-preview-${sessionId}`)
  expect(panel.borderColor.toInts()).toEqual(RGBA.fromHex(BRAND_COLOR).toInts())
  expect((nativeDiff as DiffRenderable).wrapMode).toBe("char")
  expect(panel.width).toBe(normalPanelWidth)
  expect(panel.height).toBe(normalPanelHeight)
  expect(normalPreview.width - normalPreviewWidth).toBe(30)
  expect(normalPreview.screenX).toBe(normalPreviewX - 30)
  expect(normalPreview.height).toBe(normalPreviewHeight)
  expect(fileTable.width).toBe(normalFileWidth)
  expect(fileTable.height).toBe(normalFileHeight)
  expect(info.width).toBe(normalInfoWidth)
  expect(info.height).toBe(normalInfoHeight)
  expect((tui?.captureCharFrame().match(/long_code_/g) ?? []).length).toBeGreaterThan(10)
  expect(tui?.captureCharFrame()).toContain("[Esc] Voltar à lista")
  const preview = tui!.renderer.root.findDescendantById(
    `live-diff-preview-${sessionId}`,
  ) as ScrollBoxRenderable
  await key("j")
  expect(preview.scrollTop).toBeGreaterThan(0)
  const afterLine = preview.scrollTop
  await key("l")
  expect(preview.scrollTop).toBeGreaterThan(afterLine)
  const afterHalfPage = preview.scrollTop
  await arrow("down")
  expect(preview.scrollTop).toBeGreaterThan(afterHalfPage)
  await arrow("right")
  const afterRight = preview.scrollTop
  await arrow("up")
  expect(preview.scrollTop).toBeLessThan(afterRight)
  const beforeLeft = preview.scrollTop
  await arrow("left")
  expect(preview.scrollTop).toBeLessThan(beforeLeft)
  const beforeK = preview.scrollTop
  await key("k")
  expect(preview.scrollTop).toBeLessThan(beforeK)
  const beforeH = preview.scrollTop
  await key("h")
  expect(preview.scrollTop).toBeLessThan(beforeH)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await click(`live-diff-preview-${sessionId}`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-preview-${sessionId}`)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("j")
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-1.ts")
  expect(tui?.captureCharFrame()).toContain("Live Diff · Show auto: fals")
  await key("enter")
  expect(tui?.captureCharFrame()).toContain("[Esc] Ativar diff auto")
  await key("j")
  expect(preview.scrollTop).toBeGreaterThan(0)
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  expect(tui?.captureCharFrame()).toContain("Live Diff · Show auto: true")
  expect(preview.scrollTop).toBe(0)
  const twoHunks = (first: string, second: string, oldFirst = "old first") =>
    `diff --git a/packages/terminal.ts b/packages/terminal.ts\n--- a/packages/terminal.ts\n+++ b/packages/terminal.ts\n@@ -1,32 +1,32 @@\n first context\n-${oldFirst}\n+${first}\n${Array.from({ length: 30 }, (_, index) => ` context_${index}\n`).join("")}@@ -70,3 +70,3 @@\n before\n-old second\n+${second}\n after\n`
  patchContent = twoHunks("new first", "new second")
  fingerprints.set(0, "hunk-one")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  const completeDiff = tui!.renderer.root.findDescendantById(
    `live-diff-code-${sessionId}`,
  ) as DiffRenderable
  const lineBackground = (line: number) =>
    (
      tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`) as
        | DiffRenderable
        | undefined
    )
      ?.getChildren()
      .find((child): child is LineNumberRenderable => child instanceof LineNumberRenderable)
      ?.getLineColors()
      .content.get(line)
      ?.toInts()
  expect(completeDiff.getHunkRowOffsets()).toHaveLength(2)
  const lineNumbers = completeDiff
    .getChildren()
    .find((child): child is LineNumberRenderable => child instanceof LineNumberRenderable)
  expect(lineNumbers?.getHideLineNumbers().has(33)).toBe(true)
  expect(lineBackground(33)).toEqual(RGBA.fromHex(COLORS.canvas).toInts())
  expect(preview.scrollTop).toBeGreaterThan(0)
  expect(tui?.captureCharFrame()).toContain("new second")
  patchContent = twoHunks("newer first", "new second", "older first")
  fingerprints.set(0, "hunk-two")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(preview.scrollTop).toBe(0)
  expect(tui?.captureCharFrame()).toContain("newer first")
  expect(lineBackground(1)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(2)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  const code = completeDiff
    .getChildren()
    .flatMap((child) => child.getChildren())
    .find((child): child is CodeRenderable => child instanceof CodeRenderable)
  if (!code) throw new Error("Live Diff code renderable is missing")
  const shimmerFrames = new Set<string>()
  for (let attempt = 0; attempt < 8 && shimmerFrames.size < 2; attempt++) {
    await act(async () => Bun.sleep(60))
    await tui?.renderOnce()
    shimmerFrames.add(
      tui
        ?.captureSpans()
        .lines[code.screenY + 2]?.spans.map((span) => span.fg.toInts().join())
        .join("|") ?? "",
    )
  }
  expect(shimmerFrames.size).toBeGreaterThan(1)
  patchContent = twoHunks("newer first", "newer second", "older first")
  fingerprints.set(0, "hunk-three")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(preview.scrollTop).toBeGreaterThan(0)
  expect(tui?.captureCharFrame()).toContain("newer second")
  expect(lineBackground(1)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(2)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  await act(async () => Bun.sleep(1700))
  const loopedShimmerFrames = new Set<string>()
  for (let attempt = 0; attempt < 20 && loopedShimmerFrames.size < 2; attempt++) {
    await act(async () => Bun.sleep(60))
    await tui?.renderOnce()
    loopedShimmerFrames.add(
      tui
        ?.captureSpans()
        .lines.slice(code.screenY, code.screenY + code.height)
        .flatMap((line) => line.spans.map((span) => span.fg.toInts().join()))
        .join("|") ?? "",
    )
  }
  expect(loopedShimmerFrames.size).toBeGreaterThan(1)
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  fingerprints.set(19, "second")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-19.ts")
  expect(tui?.captureCharFrame()).toContain("late new")
  expect(lineBackground(0)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(1)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  const reorderedList = tui!.renderer.root.findDescendantById(`live-diff-files-${sessionId}`)!
  const newestRow = tui!.renderer.root.findDescendantById(`live-diff-file-${sessionId}-0`)!
  expect(newestRow.screenY).toBeGreaterThanOrEqual(reorderedList.screenY)
  expect(newestRow.screenY).toBeLessThan(reorderedList.screenY + reorderedList.height)
  await click(`live-diff-file-${sessionId}-1`)
  await act(async () => Bun.sleep(50))
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  for (let attempt = 0; attempt < 20; attempt++) {
    await tui?.renderOnce()
    if (lineBackground(35)?.join() === RGBA.fromHex(COLORS.diffRecentBg).toInts().join()) break
    await act(async () => Bun.sleep(25))
  }
  expect(lineBackground(2)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  expect(lineBackground(35)).toEqual(RGBA.fromHex(COLORS.diffRecentBg).toInts())
  fingerprints.set(18, "third")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/terminal.ts")
  await click(`live-diff-file-${sessionId}-0`)
  await act(async () => Bun.sleep(50))
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-18.ts")
  fingerprints.set(17, "fourth")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(patch.mock.calls.at(-1)?.[0].path).toBe("packages/file-17.ts")
  for (let index = 1; index < 20; index += 1) await key("j")
  await tui?.renderOnce()
  const list = tui!.renderer.root.findDescendantById(`live-diff-files-${sessionId}`)!
  const last = tui!.renderer.root.findDescendantById(`live-diff-file-${sessionId}-19`)!
  expect(last.screenY).toBeGreaterThanOrEqual(list.screenY)
  expect(last.screenY).toBeLessThan(list.screenY + list.height)
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)
  expect(panel.borderColor.toInts()).toEqual(RGBA.fromHex(COLORS.border).toInts())
  expect(spanColor("[H/L]", liveDiffShortcutLine())).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  const reads = read.mock.calls.length
  fingerprints.set(0, "fifth")
  await act(async () => Bun.sleep(650))
  await tui?.renderOnce()
  expect(read.mock.calls.length).toBeGreaterThan(reads)
  expect(focusedTerminal() === terminal).toBe(true)
  await click(`live-diff-add-${sessionId}`)
  expect(Boolean(tui?.renderer.root.findDescendantById("live-diff-project-picker"))).toBe(true)
  await key("escape")
  await click("live-diff-project-0")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("a")
  expect(Boolean(tui?.renderer.root.findDescendantById("live-diff-project-picker"))).toBe(true)
  for (let attempt = 0; attempt < 10; attempt++) {
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById("live-diff-project-option-0")) break
    await act(async () => Bun.sleep(10))
  }
  await text("another")
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    if (repository.mock.calls.some(([directory]) => directory === "/fixture/another-project")) break
  }
  expect(
    repository.mock.calls.some(([directory]) => directory === "/fixture/another-project"),
  ).toBe(true)
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById("live-diff-project-1")) break
  }
  const secondProject = tui!.renderer.root.findDescendantById(
    "live-diff-project-1",
  ) as BoxRenderable
  const firstProject = tui!.renderer.root.findDescendantById("live-diff-project-0") as BoxRenderable
  expect(secondProject).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("/another-project")
  expect(secondProject.screenY).toBe(firstProject.screenY + 1)
  expect(secondProject.backgroundColor.equals(RGBA.fromHex(COLORS.success))).toBe(true)
  await click("live-diff-project-1")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await key("n")
  expect(secondProject.backgroundColor.equals(RGBA.fromHex(COLORS.panelAlt))).toBe(true)
  expect(tui?.captureCharFrame()).toContain("20 arquivos")
  await key("n")
  expect(secondProject.backgroundColor.equals(RGBA.fromHex(COLORS.success))).toBe(true)
  expect(tui?.captureCharFrame()).toContain("21 arquivos")
  await key("h")
  await key("n")
  expect(tui?.captureCharFrame()).toContain("1 arquivos")
  await key("n")
  expect(tui?.captureCharFrame()).toContain("21 arquivos")
  snapshot = snapshot.slice(0, 1)
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (!tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)) break
  }
  expect(Boolean(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`))).toBe(true)
  const frozenReads = read.mock.calls.length
  await act(async () => Bun.sleep(650))
  expect(read.mock.calls.length).toBe(frozenReads)
  await click("live-diff-project-0")
  await key("x")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`) === undefined).toBe(true)
  expect(focusedTerminal() === terminal).toBe(true)
  expect(starts).toHaveLength(1)
}, 16_000)

test("stacked Live Diff uses the full pane width and widens only the code area", async () => {
  const root = "/fixture/stacked-project"
  liveDiffSpies.push(
    spyOn(liveDiff, "liveDiffRepositoryRoot").mockResolvedValue(root),
    spyOn(liveDiff, "liveDiffWorktrees").mockResolvedValue([
      root,
      "/fixture/second-project",
      "/fixture/third-project",
      "/fixture/fourth-project",
    ]),
    spyOn(liveDiff, "readProcessDirectories").mockResolvedValue([]),
    spyOn(liveDiff, "readLiveDiffRoot").mockImplementation(async (repositoryRoot) => ({
      truncated: false,
      files: [
        {
          root: repositoryRoot,
          path: "src/code.ts",
          additions: 1,
          deletions: 0,
          fingerprint: "first",
          untracked: false,
          newFile: false,
          headExists: true,
        },
      ],
    })),
    spyOn(liveDiff, "readLiveDiffPatch").mockResolvedValue(
      `diff --git a/src/code.ts b/src/code.ts\n--- a/src/code.ts\n+++ b/src/code.ts\n@@ -1 +1 @@\n+${"long line ".repeat(30)}\n`,
    ),
  )
  await mount(false, 80, 30)
  await leader("n")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  snapshot = [
    { pid: 101, parentPid: 1, executable: "sh", command: "sh" },
    { pid: 103, parentPid: 101, executable: "codex", command: "codex" },
  ]
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`terminal-agent-${sessionId}`)) break
  }
  await leader("d")
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => Bun.sleep(50))
    await tui?.renderOnce()
    if (tui?.renderer.root.findDescendantById(`live-diff-code-${sessionId}`)) break
  }
  const panel = tui!.renderer.root.findDescendantById(`live-diff-${sessionId}`)!
  const frame = tui!.renderer.root.findDescendantById(`terminal-pane-frame-${sessionId}`)!
  expect(panel.parent!.width).toBe(frame.width)
  const preview = tui!.renderer.root.findDescendantById(`live-diff-preview-${sessionId}`)!
  const files = tui!.renderer.root.findDescendantById(`live-diff-file-table-${sessionId}`)!
  const info = tui!.renderer.root.findDescendantById(`live-diff-info-${sessionId}`)!
  const projectChips = Array.from(
    { length: 4 },
    (_, index) => tui!.renderer.root.findDescendantById(`live-diff-project-${index}`)!,
  )
  expect(projectChips[0]!.screenY).toBe(projectChips[1]!.screenY)
  expect(projectChips[2]!.screenY).toBe(projectChips[3]!.screenY)
  expect(projectChips[2]!.screenY).toBe(projectChips[0]!.screenY + 1)
  expect(projectChips[2]!.screenX).toBe(
    tui!.renderer.root.findDescendantById(`live-diff-projects-${sessionId}`)!.screenX,
  )
  const footer = info.getChildren().at(-1)!
  const addProject = tui!.renderer.root.findDescendantById(`live-diff-add-${sessionId}`)!
  expect(addProject.screenY).toBe(footer.getChildren()[0]!.screenY)
  expect(info.screenY + info.height).toBeLessThanOrEqual(panel.screenY + panel.height)
  const normal = [
    panel.width,
    panel.height,
    preview.width,
    preview.height,
    files.width,
    files.height,
    info.width,
    info.height,
    terminal.parent!.width,
  ] as const
  await click(`live-diff-file-${sessionId}-0`)
  await key("enter")
  expect(panel.width).toBe(normal[0])
  expect(panel.height).toBe(normal[1])
  expect(preview.width - normal[2]).toBe(30)
  expect(preview.height).toBe(normal[3])
  expect(files.width).toBe(normal[4])
  expect(files.height).toBe(normal[5])
  expect(info.width).toBe(normal[6])
  expect(info.height).toBe(normal[7])
  expect(terminal.parent!.width).toBe(normal[8])
  await key("escape")
  expect(preview.width).toBe(normal[2])
}, 8_000)

test("narrow workspaces retain the sidebar, modal Escape and native input", async () => {
  await mount(true, 58, 18)
  await leader("n")
  const terminal = focusedTerminal()
  await click("terminal-sidebar-command")
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)
  await act(async () => tui?.mockInput.typeText("echo fixture"))
  expect(inputs[0]?.join("")).toBe("echo fixture")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar")?.width).toBeGreaterThan(0)
})

test("new sections return to Tuiminais and keep the workspace session limit", async () => {
  await mount()
  await leader("n")
  await click("terminal-sidebar-new")
  const owned = tui!.renderer.root.findDescendantById("terminal-sidebar-folder-terminal")!
  const section = tui!.renderer.root.findDescendantById("terminal-sidebar-section-section-1")!
  expect(section.parent).toBe(owned.parent)
  const panes = tui?.renderer.root.findDescendantById("terminal-panes")
  expect(focusedTerminal().width).toBe(panes!.width)
  for (let i = 2; i < 12; i++) await leader("n")
  expect(starts).toHaveLength(12)
  await leader("n")
  expect(starts).toHaveLength(12)
})

test("settings agent-command input consumes typing and its own Escape", async () => {
  await mount(true)
  await click("tutorial-settings-button")
  await key("i")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-agent-input")
  await text("private-assistant")
  expect(getUiSettings().terminalAgentCommands).toEqual(["private-assistant"])
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
})

test("Remote connection navigator selects a saved profile before editing its fields", async () => {
  updateUiSettings({
    terminalRemoteCodexProfiles: [
      {
        id: "remote-first",
        name: "Primeira VPS",
        user: "ubuntu",
        host: "192.0.2.10",
        port: 22,
        identityFile: "/keys/first.key",
      },
      {
        id: "remote-second",
        name: "Segunda VPS",
        user: "opc",
        host: "192.0.2.20",
        port: 2222,
        identityFile: "/keys/second.key",
      },
    ],
  })
  await mount(true)
  await click("tutorial-settings-button")
  await click("configuration-section-remoteConnection")
  await key("enter")
  expect(renderable("configuration-terminal-remote-profile-remote-first")).toBeDefined()
  expect(renderable("configuration-terminal-remote-profile-remote-second")).toBeDefined()
  await arrow("down")
  await key("enter")

  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-remote-view")
  expect((renderable("configuration-terminal-remote-name") as InputRenderable).value).toBe(
    "Segunda VPS",
  )
  await key("a")
  expect(getUiSettings().terminalRemoteCodexActiveProfileId).toBe("remote-second")
  const activatedFrame = tui?.captureCharFrame() ?? ""
  expect(activatedFrame).toContain("○ INATIVO")
  expect(activatedFrame).toContain("● ATIVO")
  expect(activatedFrame).toContain("◆ EDITANDO")
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-remote-name")
})

test("Terminal settings save and test an SSH profile without launching remote Codex", async () => {
  await mount(true)
  await click("tutorial-settings-button")
  await click("configuration-section-remoteConnection")
  expect(
    tui?.renderer.root.findDescendantById("configuration-terminal-remote-preview"),
  ).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById("configuration-terminal-remote-name"),
  ).toBeUndefined()
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-remote-view")
  expect(tui?.renderer.root.findDescendantById("configuration-terminal-remote-form")).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById("configuration-terminal-remote-remoteDirectory"),
  ).toBeUndefined()
  const nameField = tui?.renderer.root.findDescendantById(
    "configuration-terminal-remote-field-name",
  ) as BoxRenderable
  const nameInput = tui?.renderer.root.findDescendantById(
    "configuration-terminal-remote-name",
  ) as InputRenderable
  const fieldHighlight = nameField.backgroundColor.toInts()
  expect(fieldHighlight).not.toEqual(RGBA.fromHex(COLORS.panelRaised).toInts())
  expect(fieldHighlight).not.toEqual(RGBA.fromHex(COLORS.panel).toInts())
  expect(nameInput.backgroundColor.equals(RGBA.fromHex(COLORS.panel))).toBe(true)
  await arrow("down")
  const userField = tui?.renderer.root.findDescendantById(
    "configuration-terminal-remote-field-user",
  ) as BoxRenderable
  const userInput = tui?.renderer.root.findDescendantById(
    "configuration-terminal-remote-user",
  ) as InputRenderable
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-remote-user")
  expect(userField.backgroundColor.equals(RGBA.fromHex(COLORS.panel))).toBe(true)
  expect(userInput.backgroundColor.toInts()).toEqual(fieldHighlight)
  await key("escape")

  const fill = async (id: string, value: string) => {
    await click(id)
    await act(async () => tui?.mockInput.typeText(value))
    await tui?.renderOnce()
  }
  await fill("configuration-terminal-remote-name", "Oracle VPS")
  await fill("configuration-terminal-remote-host", "203.0.113.10")
  await fill("configuration-terminal-remote-identityFile", "/missing/oracle.key")
  await click("configuration-terminal-remote-save")

  expect(getUiSettings().terminalRemoteCodexProfiles).toEqual([
    expect.objectContaining({
      name: "Oracle VPS",
      host: "203.0.113.10",
      user: "ubuntu",
      port: 22,
      identityFile: "/missing/oracle.key",
    }),
  ])
  expect(commands).toEqual([])

  await click("configuration-terminal-remote-test")
  expect(tui?.captureCharFrame()).toContain("A chave privada não foi encontrada.")
  expect(commands).toEqual([])

  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-section-remoteConnection")
  expect(
    tui?.renderer.root.findDescendantById("configuration-terminal-remote-preview"),
  ).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById("configuration-terminal-remote-name"),
  ).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
})

test("Remote connection keeps actions visible while a short form reaches its last field", async () => {
  await mount(true, 58, 18)
  await click("tutorial-settings-button")
  await arrow("down")
  await key("enter")
  for (let index = 0; index < 4; index++) await arrow("down")

  const frame = tui?.captureCharFrame() ?? ""
  expect(frame).toContain("Chave privada")
  expect(frame).toContain("[A] Tornar ativo")
  expect(frame).toContain("[T] Testar conexão")
})

test("Remote server configuration opens SSH above a guided barrier flow", async () => {
  updateUiSettings({
    terminalRemoteCodexProfiles: [
      {
        id: "remote-setup",
        name: "Oracle VPS",
        user: "ubuntu",
        host: "203.0.113.10",
        port: 22,
        identityFile: "/missing/oracle.key",
      },
    ],
  })
  await mount(true, 120, 32)
  await click("tutorial-settings-button")
  await click("configuration-section-remoteConnection")
  await key("enter")

  expect(renderable("configuration-terminal-remote-readiness")).toBeDefined()
  expect(renderable("configuration-terminal-remote-verify")).toBeDefined()
  expect(renderable("configuration-terminal-remote-configure")).toBeDefined()
  await click("configuration-terminal-remote-verify")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("○ GitHub via SSH: A chave")
  expect(tui?.captureCharFrame()).toContain("O servidor precisa ser configurado.")
  expect(commands).toEqual([])
  await click("configuration-terminal-remote-configure")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()

  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
  expect(commands[0]).toEqual([
    "ssh",
    "-tt",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-i",
    "/missing/oracle.key",
    "-p",
    "22",
    "ubuntu@203.0.113.10",
  ])
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("free-terminal-", "")
  const setup = renderable(`remote-server-setup-${sessionId}`)
  expect(setup.screenY).toBeGreaterThan(terminal.screenY)
  expect(tui?.captureCharFrame()).toContain("PREPARAR SERVIDOR")
  expect(tui?.captureCharFrame()).toContain("GitHub via SSH")
  expect(tui?.captureCharFrame()).toContain("Confirmar configuração")

  await leader("m")
  await key("j")
  expect(
    tui?.renderer.root.findDescendantById(`terminal-focus-selection-tint-setup-${sessionId}`),
  ).toBeDefined()
  await key("enter")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`remote-server-setup-${sessionId}`)
  await key("escape")
  expect(focusedTerminal()).toBe(terminal)

  await click(`remote-server-setup-${sessionId}-confirm`)
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("A chave privada local não foi encontrada.")
  expect(tui?.captureCharFrame()).toContain("GitHub via SSH")
  expect(commands).toHaveLength(1)
})

test("sidebar navigation switches among live sections without relaunching their processes", async () => {
  await mount()
  await leader("n")
  const first = focusedTerminal()
  await leader("n")
  const second = focusedTerminal()
  await click(`terminal-sidebar-pane-${first.id.replace("free-terminal-", "")}`)
  expect(focusedTerminal()).toBe(first)
  await click(`terminal-sidebar-pane-${second.id.replace("free-terminal-", "")}`)
  expect(focusedTerminal()).toBe(second)
  expect(starts).toHaveLength(2)
  expect(inputs).toEqual([[], []])
})

test("terminals fill every available edge at all sizes without replacing the native process", async () => {
  await mount()
  await leader("n")
  const terminal = focusedTerminal()
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  const sidebar = tui!.renderer.root.findDescendantById("terminal-sidebar")!
  const workspace = tui!.renderer.root.findDescendantById("terminal-workspace")!
  const expectFullArea = () => {
    expect(terminal.screenX).toBe(sidebar.screenX + sidebar.width)
    expect(terminal.screenY).toBe(workspace.screenY)
    expect(terminal.width).toBe(panes.width)
    expect(terminal.height).toBe(panes.height)
    expect(terminal.screenX + terminal.width).toBe(workspace.screenX + workspace.width)
    expect(terminal.screenY + terminal.height).toBe(workspace.screenY + workspace.height)
  }
  expectFullArea()
  await act(async () => tui?.resize(58, 18))
  await tui?.renderOnce()
  expect(focusedTerminal()).toBe(terminal)
  expectFullArea()
  await act(async () => tui?.resize(120, 30))
  await tui?.renderOnce()
  expect(focusedTerminal()).toBe(terminal)
  expectFullArea()
  expect(starts).toHaveLength(1)
})
