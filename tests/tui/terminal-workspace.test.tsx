import "./setup"
import { afterEach, expect, mock, spyOn, test } from "bun:test"
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
  type TextRenderable,
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
  publishClaudeResumeThreads,
  resetClaudeResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/claude-resume-threads"
import {
  publishCodexResumeThreads,
  resetCodexResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/codex-resume-threads"
import {
  publishOpenCodeResumeThreads,
  resetOpenCodeResumeThreadsForTests,
} from "../../packages/feature-terminal/src/model/opencode-resume-threads"
import {
  resetPinnedTerminalSidebarForTests,
  setTmuxHostSidebar,
  terminalSidebarReplica,
  terminalSidebarSnapshot,
} from "../../packages/feature-terminal/src/model/pinned-sidebar"
import * as gitProjects from "../../packages/feature-terminal/src/services/agent-git-projects"
import * as inspection from "../../packages/feature-terminal/src/services/agent-processes"
import * as projectDirectories from "../../packages/feature-terminal/src/services/agent-project-directories"
import * as claudeCompatibility from "../../packages/feature-terminal/src/services/claude-compatibility"
import * as claudeTerminal from "../../packages/feature-terminal/src/services/claude-terminal"
import * as codexServer from "../../packages/feature-terminal/src/services/codex-app-server"
import * as liveDiff from "../../packages/feature-terminal/src/services/live-diff"
import * as liveDiffProjects from "../../packages/feature-terminal/src/services/live-diff-projects"
import type { OpenCodeObserverEvents } from "../../packages/feature-terminal/src/services/opencode-api"
import * as openCodeServer from "../../packages/feature-terminal/src/services/opencode-server"
import * as remoteHandshake from "../../packages/feature-terminal/src/services/remote-codex-handshake"
import * as remoteLiveDiff from "../../packages/feature-terminal/src/services/remote-live-diff"
import * as remoteOpenCodeCompatibility from "../../packages/feature-terminal/src/services/remote-opencode-compatibility"
import * as remoteReadiness from "../../packages/feature-terminal/src/services/remote-server-readiness"
import * as remoteTerminalContext from "../../packages/feature-terminal/src/services/remote-terminal-context"
import * as processes from "../../packages/feature-terminal/src/services/terminal"
import * as repositoryContext from "../../packages/feature-terminal/src/services/terminal-repository-context"
import {
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  terminalWorkspaceStatePath,
} from "../../packages/feature-terminal/src/services/terminal-workspace-state"
import { TermAgents } from "../../packages/feature-terminal/src/TerminalWorkspace"
import {
  TerminalActions,
  terminalActionKey,
} from "../../packages/feature-terminal/src/ui/TerminalActions"

const incompatibleReport = {
  compatible: false,
  reason: "versionMismatch",
  localVersion: "0.157.2",
  remoteVersion: "0.158.0",
  daemonAvailable: true,
  proxyAvailable: true,
} as const

const incompatibleOpenCodeReport = {
  providerId: "opencode",
  compatible: false,
  reason: "versionMismatch",
  localVersion: "2.0.19",
  remoteVersion: "2.0.20",
  daemonAvailable: true,
  proxyAvailable: true,
} as const

const missingClaudeReport = {
  providerId: "claude",
  compatible: false,
  reason: "localClaudeMissing",
  localVersion: null,
  remoteVersion: null,
  daemonAvailable: true,
  proxyAvailable: true,
} as const

const missingCodexReport = {
  ...incompatibleReport,
  providerId: "codex",
  reason: "localCodexMissing",
  localVersion: null,
  remoteVersion: null,
} as const

const missingOpenCodeReport = {
  ...incompatibleOpenCodeReport,
  reason: "localOpenCodeMissing",
  localVersion: null,
  remoteVersion: null,
} as const

const originalSettings = getUiSettings()
const originalOnlyTab = process.env.TUIMINAL_ONLY_TAB
const originalInitialTab = process.env.TUIMINAL_INITIAL_TAB
const originalWorkspaceState = process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
const originalStaticLoaders = process.env.TUIMINAL_TEST_STATIC_LOADERS
let tui: TestRendererSetup | undefined
let spawnSpy: ReturnType<typeof spyOn<typeof processes, "startTermAgentsProcess">> | undefined
let codexSpy:
  | ReturnType<typeof spyOn<typeof codexServer, "startCodexAppServerTerminal">>
  | undefined
let claudeSpy:
  | ReturnType<typeof spyOn<typeof claudeTerminal, "startClaudeHooksTerminal">>
  | undefined
let codexResumeSpy:
  | ReturnType<typeof spyOn<typeof codexServer, "refreshCodexResumeThreads">>
  | undefined
let remoteCodexResumeSpy:
  | ReturnType<typeof spyOn<typeof codexServer, "refreshRemoteCodexResumeThreads">>
  | undefined
let openCodeSpy:
  | ReturnType<typeof spyOn<typeof openCodeServer, "startOpenCodeServerTerminal">>
  | undefined
let openCodeResumeSpy:
  | ReturnType<typeof spyOn<typeof openCodeServer, "refreshOpenCodeResumeThreads">>
  | undefined
let remoteOpenCodeResumeSpy:
  | ReturnType<typeof spyOn<typeof openCodeServer, "refreshRemoteOpenCodeResumeThreads">>
  | undefined
let codexEvents: codexServer.CodexAppServerEvents | undefined
let claudeEvents: Parameters<typeof claudeTerminal.startClaudeHooksTerminal>[1] | undefined
let openCodeEvents: OpenCodeObserverEvents | undefined
let inspectionSpy: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
let repositoryContextSpy:
  | ReturnType<typeof spyOn<typeof repositoryContext, "readTerminalRepositoryContext">>
  | undefined
const liveDiffSpies: Array<{ mockRestore: () => void }> = []
const inputs: string[][] = []
const starts: Parameters<typeof processes.startTermAgentsProcess>[1][] = []
const commands: string[][] = []
let snapshot: ProcessIdentity[] = []

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  spawnSpy?.mockRestore()
  codexSpy?.mockRestore()
  claudeSpy?.mockRestore()
  codexResumeSpy?.mockRestore()
  remoteCodexResumeSpy?.mockRestore()
  openCodeSpy?.mockRestore()
  openCodeResumeSpy?.mockRestore()
  remoteOpenCodeResumeSpy?.mockRestore()
  codexEvents = undefined
  claudeEvents = undefined
  openCodeEvents = undefined
  inspectionSpy?.mockRestore()
  repositoryContextSpy = undefined
  for (const spy of liveDiffSpies.splice(0)) spy.mockRestore()
  inputs.length = 0
  starts.length = 0
  commands.length = 0
  snapshot = []
  resetPinnedTerminalSidebarForTests()
  resetCodexResumeThreadsForTests()
  resetClaudeResumeThreadsForTests()
  resetOpenCodeResumeThreadsForTests()
  updateUiSettings(originalSettings)
  if (originalOnlyTab === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = originalOnlyTab
  if (originalInitialTab === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = originalInitialTab
  if (originalWorkspaceState === undefined) delete process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE
  else process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = originalWorkspaceState
  if (originalStaticLoaders === undefined) delete process.env.TUIMINAL_TEST_STATIC_LOADERS
  else process.env.TUIMINAL_TEST_STATIC_LOADERS = originalStaticLoaders
  rmSync(terminalWorkspaceStatePath(processes.TERM_AGENTS_WORKING_DIRECTORY), {
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
  spawnSpy = spyOn(processes, "startTermAgentsProcess").mockImplementation((command, options) => {
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
          ? [
              "codex",
              "resume",
              options.resumeThreadId,
              "--remote",
              "ws://127.0.0.1:4500",
              ...(options.remote ? ["-C", options.remote.workingDirectory] : []),
            ]
          : [
              "codex",
              "--remote",
              "ws://127.0.0.1:4500",
              ...(options.remote ? ["-C", options.remote.workingDirectory] : []),
            ],
      )
      starts.push(options)
      return { pid: 500, backend: "native", write() {}, resize() {}, async stop() {} }
    },
  )
  claudeSpy = spyOn(claudeTerminal, "startClaudeHooksTerminal").mockImplementation(
    async (options, events) => {
      claudeEvents = events
      commands.push([
        "claude",
        ...(options.resumeThreadId ? ["--resume", options.resumeThreadId] : []),
      ])
      starts.push(options)
      return { pid: 502, backend: "native", write() {}, resize() {}, async stop() {} }
    },
  )
  openCodeSpy = spyOn(openCodeServer, "startOpenCodeServerTerminal").mockImplementation(
    async (options, events) => {
      openCodeEvents = events
      const directory = options.remote?.workingDirectory ?? options.cwd ?? process.cwd()
      commands.push([
        "opencode",
        "--server",
        "http://127.0.0.1:4501",
        ...(options.resumeThreadId ? ["--session", options.resumeThreadId] : []),
        ...(options.remote ? [] : [directory]),
      ])
      starts.push(options)
      return {
        pid: 501,
        backend: "native",
        write() {},
        resize() {},
        async stop() {},
      }
    },
  )
  liveDiffSpies.push(
    spyOn(gitProjects, "discoverAgentGitProjects").mockResolvedValue({
      paths: [],
      truncated: false,
    }),
  )
  liveDiffSpies.push(
    spyOn(projectDirectories, "readProjectDirectory").mockImplementation(
      async (target, path, base) => ({
        path:
          target.kind === "remote" && path.startsWith("~")
            ? "/srv/project"
            : path.startsWith("/")
              ? path
              : `${base}/${path}`,
        directories: [],
        truncated: false,
      }),
    ),
  )
  repositoryContextSpy = spyOn(
    repositoryContext,
    "readTerminalRepositoryContext",
  ).mockRejectedValue(new Error("Context disabled in the shared TUI fixture."))
  liveDiffSpies.push(repositoryContextSpy)
  liveDiffSpies.push(
    spyOn(remoteTerminalContext, "createRemoteTerminalContextSource").mockImplementation(() => ({
      read: async () => Promise.reject(new Error("Remote context disabled in this fixture.")),
      close: () => undefined,
    })),
  )
  codexResumeSpy = spyOn(codexServer, "refreshCodexResumeThreads").mockResolvedValue([])
  remoteCodexResumeSpy = spyOn(codexServer, "refreshRemoteCodexResumeThreads").mockResolvedValue([])
  openCodeResumeSpy = spyOn(openCodeServer, "refreshOpenCodeResumeThreads").mockResolvedValue([])
  remoteOpenCodeResumeSpy = spyOn(
    openCodeServer,
    "refreshRemoteOpenCodeResumeThreads",
  ).mockResolvedValue([])
  if (app) process.env.TUIMINAL_ONLY_TAB = "terminal"
  if (fullApp) {
    delete process.env.TUIMINAL_ONLY_TAB
    process.env.TUIMINAL_INITIAL_TAB = "terminal"
  }
  tui = await testRender(app || fullApp ? <App /> : <TermAgents active {...actions} />, {
    width,
    height,
  })
  await tui.renderOnce()
}
async function key(name: string, ctrl = false, shift = false) {
  await act(async () => {
    if (name === "enter") tui?.mockInput.pressEnter()
    else if (name === "escape") tui?.mockInput.pressEscape()
    else if (name === "backspace") tui?.mockInput.pressBackspace()
    else if (name === "tab") tui?.mockInput.pressTab()
    else tui?.mockInput.pressKey(name, { ctrl, shift })
    if (name === "escape") await Bun.sleep(70)
  })
  await tui?.renderOnce()
}
async function arrow(direction: "up" | "down" | "left" | "right") {
  await act(async () => tui?.mockInput.pressArrow(direction))
  await tui?.renderOnce()
}
async function leader(action: string, shift = false) {
  await key("b", true)
  await key(action, false, shift)
}
async function openAgentProjects() {
  await leader("a")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-agent-provider")).toBeDefined()
  await key("enter")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
}
async function selectProjectRemote() {
  await key("e")
  for (
    let attempt = 0;
    attempt < 100 &&
    !tui?.renderer.root.findDescendantById("terminal-dialog-project-environment-5");
    attempt++
  ) {
    await act(async () => Bun.sleep(1))
    await tui?.renderOnce()
  }
  expect(
    tui?.renderer.root.findDescendantById("terminal-dialog-project-environment-5"),
  ).toBeDefined()
  for (let index = 0; index < 5; index++) await arrow("down")
  await key("enter")
}
async function waitForFolderResults() {
  for (
    let attempt = 0;
    attempt < 100 && tui?.captureCharFrame().includes("Carregando pastas");
    attempt++
  ) {
    await act(async () => Bun.sleep(5))
    await tui?.renderOnce()
  }
  expect(tui?.captureCharFrame()).not.toContain("Carregando pastas")
}
async function launchAgent(remote = false) {
  await openAgentProjects()
  if (remote) {
    await selectProjectRemote()
  }
  await click("terminal-dialog-project-launch")
}
async function split(action: "c" | "h") {
  await leader(action, action === "h")
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
function spanBackground(text: string, line?: number) {
  const lines = tui?.captureSpans().lines ?? []
  const span = (line === undefined ? lines : lines.slice(line, line + 1))
    .flatMap((entry) => entry.spans)
    .find((entry) => entry.text.includes(text))
  if (!span) throw new Error(`Missing background text ${text}\n${tui?.captureCharFrame()}`)
  return span.bg.toInts()
}
function renderable(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing ${id}`)
  return target
}
async function waitForRenderable(id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const target = tui?.renderer.root.findDescendantById(id)
    if (target) return target
    await act(async () => Bun.sleep(1))
    await tui?.renderOnce()
  }
  return renderable(id)
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
  expect(terminalActionKey({ name: "h", shift: true })).toBe("shift+h")
  expect(terminalActionKey({ name: "l", shift: true })).toBe("shift+l")
  expect(terminalActionKey({ name: "q", shift: true })).toBeNull()
  expect(terminalActionKey({ name: "," })).toBe(",")
})

test("tmux helper Master Key uses compact Actions and Agents tabs", async () => {
  updateUiSettings({ colorMode: "light", palette: "prime" })
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
          projectName: "project",
          gitBranch: "main",
          updatedAt: Date.now(),
          state: "idle",
          providerId: "opencode",
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
  const origin = renderable("terminal-resume-origin-compact-agent")
  expect(spanColor("Open", origin.screenY)).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  expect(spanColor("Code", origin.screenY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  expect(spanBackground("Open", origin.screenY)).toEqual(RGBA.fromHex(COLORS.panelAlt).toInts())
  expect(spanBackground("Code", origin.screenY)).toEqual(RGBA.fromHex(COLORS.panelAlt).toInts())

  await click("terminal-action-tab-actions")
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeUndefined()

  await key("l")
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeDefined()
  await key("h")
  expect(tui.renderer.root.findDescendantById("terminal-action-panel")).toBeDefined()
  expect(tui.renderer.root.findDescendantById("terminal-agent-panel")).toBeUndefined()
})

test("Master Key keeps Z/V for providers and uses C for a side split", async () => {
  await mount()
  await leader("n")
  await key("b", true)
  await arrow("right")
  expect(tui?.renderer.root.findDescendantById("terminal-agent-panel-active")).toBeDefined()

  await key("v")

  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeUndefined()

  await key("c")

  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeDefined()
})

test("Master Key opens the official Codex TUI connected to app-server", async () => {
  await mount()
  await launchAgent()
  expect(commands[0]).toEqual(["codex", "--remote", "ws://127.0.0.1:4500"])
  expect(codexSpy).toHaveBeenCalledTimes(1)
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
})

test("agent picker enables Codex, Claude Code and OpenCode with branded contrast", async () => {
  updateUiSettings({ colorMode: "dark", palette: "prime" })
  await mount()
  await leader("a")
  expect(tui?.captureCharFrame()).toContain("Codex")
  expect(tui?.captureCharFrame()).toContain("Claude Code")
  expect(tui?.captureCharFrame()).toContain("OpenCode")
  expect(tui?.captureCharFrame()).not.toContain("Em breve")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeUndefined()
  const codexRow = renderable("terminal-dialog-agent-provider-codex")
  const claudeRow = renderable("terminal-dialog-agent-provider-claude")
  const openCodeRow = renderable("terminal-dialog-agent-provider-opencode")
  expect(spanColor("Codex", codexRow.screenY)).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  expect(spanBackground("Codex", codexRow.screenY)).toEqual(RGBA.fromHex(COLORS.panelAlt).toInts())
  expect(spanColor("Claude Code", claudeRow.screenY)).toEqual(RGBA.fromHex(COLORS.http).toInts())
  expect(spanBackground("Claude Code", claudeRow.screenY)).toEqual(
    RGBA.fromHex(COLORS.databaseEditedBg).toInts(),
  )
  expect(spanColor("Open", openCodeRow.screenY)).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  expect(spanColor("Code", openCodeRow.screenY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  expect(spanBackground("Open", openCodeRow.screenY)).toEqual(
    RGBA.fromHex(COLORS.panelAlt).toInts(),
  )
  expect(spanBackground("Code", openCodeRow.screenY)).toEqual(
    RGBA.fromHex(COLORS.panelAlt).toInts(),
  )

  await arrow("down")
  await key("enter")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
  expect(commands).toHaveLength(0)
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-agent-provider")).toBeDefined()
  await click("terminal-dialog-agent-provider-opencode")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
  expect(commands).toHaveLength(0)
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-agent-provider")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-agent-provider")).toBeUndefined()
})

test("Master Key opens the official OpenCode TUI attached to its public server", async () => {
  await mount()
  await leader("a")
  await click("terminal-dialog-agent-provider-opencode")
  await click("terminal-dialog-project-launch")
  expect(openCodeSpy).toHaveBeenCalledTimes(1)
  expect(commands[0]).toEqual([
    "opencode",
    "--server",
    "http://127.0.0.1:4501",
    processes.TERM_AGENTS_WORKING_DIRECTORY,
  ])
  expect(tui?.renderer.root.findDescendantById("terminal-dialog")).toBeUndefined()
})

test("OpenCode keeps one sidebar row synchronized with the visible root session", async () => {
  await mount(false, 140, 36)
  await leader("a")
  await click("terminal-dialog-agent-provider-opencode")
  await click("terminal-dialog-project-launch")
  const terminalId = focusedTerminal().id.replace("term-agents-", "")
  const observed = (id: string, title: string, state: "working" | "blocked", message: string) => ({
    session: {
      id,
      title,
      directory: processes.TERM_AGENTS_WORKING_DIRECTORY,
      updatedAt: Date.now(),
    },
    state,
    activity: state === "working" ? ("coding" as const) : null,
    messages: [
      {
        id: `message-${id}`,
        turnId: `turn-${id}`,
        text: message,
        sentAt: Date.now(),
        durationMs: null,
        status: "completed" as const,
        hasImage: false,
        hasAudio: false,
        hasSkill: false,
        model: null,
        effort: null,
        serviceTier: null,
        ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
      },
    ],
    waitingOnApproval: state === "blocked",
  })

  await act(async () => {
    openCodeEvents?.onSessionUpdated?.(
      observed("ses_first", "First OpenCode task", "working", "Message from first session"),
    )
    openCodeEvents?.onSessionUpdated?.(
      observed("ses_second", "Second OpenCode task", "blocked", "Message from second session"),
    )
    openCodeEvents?.onActiveSessionChanged?.("ses_first")
  })
  await tui?.renderOnce()

  expect(tui?.renderer.root.findDescendantById(`terminal-agent-${terminalId}`)).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-agent-${terminalId}::ses_first`),
  ).toBeUndefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-agent-${terminalId}::ses_second`),
  ).toBeUndefined()
  expect(tui?.captureCharFrame()).toContain("First OpenCode task")
  expect(tui?.captureCharFrame()).not.toContain("Second OpenCode task")
  expect(tui?.captureCharFrame()).toContain("Codificando")
  expect(tui?.captureCharFrame()).not.toContain("Aguardando")

  await act(async () => openCodeEvents?.onActiveSessionChanged?.("ses_second"))
  await tui?.renderOnce()
  expect(tui?.renderer.root.findDescendantById(`terminal-agent-${terminalId}`)).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("Second OpenCode task")
  expect(tui?.captureCharFrame()).not.toContain("First OpenCode task")
  expect(tui?.captureCharFrame()).toContain("Aguardando")
  await act(async () => {
    openCodeEvents?.onSessionUpdated?.(
      observed("ses_first", "Hidden OpenCode task", "working", "Hidden message"),
    )
  })
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("Second OpenCode task")
  expect(tui?.captureCharFrame()).not.toContain("Hidden OpenCode task")
  expect(tui?.captureCharFrame()).toContain("Aguardando")
  await leader("s")
  expect(tui?.captureCharFrame()).toContain("Message from second session")
  expect(tui?.captureCharFrame()).not.toContain("Message from first session")
})

test("OpenCode launches remotely through the selected SSH source and enables project sync", async () => {
  await mount()
  await leader("a")
  await click("terminal-dialog-agent-provider-opencode")
  await selectProjectRemote()
  await click("terminal-dialog-project-launch")

  expect(openCodeSpy).toHaveBeenCalledTimes(1)
  expect(starts.at(-1)).toMatchObject({
    remote: { profile: { id: "work-server" }, workingDirectory: "/srv/project" },
  })
  expect(commands.at(-1)).toEqual(["opencode", "--server", "http://127.0.0.1:4501"])

  await leader("r")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-folder-browser")).toBeDefined()
})

test("closing a disconnected remote Claude pane still closes its background session", async () => {
  await mount()
  const stopSession = mock(async () => undefined)
  let exit: Parameters<typeof claudeTerminal.startClaudeHooksTerminal>[0]["onExit"] | undefined
  claudeSpy?.mockImplementation(async (options) => {
    starts.push(options)
    exit = options.onExit
    const owned = {
      pid: 502,
      backend: "native" as const,
      write() {},
      resize() {},
      async stop() {},
    }
    return {
      ...owned,
      ...claudeTerminal.remoteClaudeClose(
        options.remote,
        { sessionId: "remote-session", shortId: "remote-short-id", created: false },
        owned,
        async () => undefined,
        stopSession,
      ),
    }
  })

  await leader("a")
  await click("terminal-dialog-agent-provider-claude")
  await selectProjectRemote()
  await click("terminal-dialog-project-launch")
  expect(exit).toBeDefined()

  await act(async () => exit?.({ code: 255, signal: null, stopped: false }))
  await tui?.renderOnce()
  await leader("x")

  expect(stopSession).toHaveBeenCalledTimes(1)
})

test("Master Key A chooses an SSH alias inside the picker and launches the exact remote directory", async () => {
  await mount()
  await launchAgent(true)
  expect(codexSpy).toHaveBeenCalledTimes(1)
  expect(starts.at(-1)).toMatchObject({
    remote: { profile: { id: "work-server" }, workingDirectory: "/srv/project" },
  })
  expect(getUiSettings().terminalRemoteCodexActiveProfileId).toBe(
    originalSettings.terminalRemoteCodexActiveProfileId,
  )
})

test.each([
  { remote: false, label: "Local", color: COLORS.success, background: COLORS.diffAddedBg },
  {
    remote: true,
    label: "Remoto",
    color: COLORS.database,
    background: COLORS.databaseSelectionBg,
  },
])("agent metadata reserves a row for the $label origin", async (expected) => {
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "1"
  await mount(false, 120, 30)
  await launchAgent(expected.remote)
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("term-agents-", "")
  const origin = await waitForRenderable(`terminal-context-origin-${sessionId}`)
  const frame = renderable(`terminal-pane-frame-${sessionId}`)

  expect(origin.screenX).toBe(frame.screenX)
  expect(origin.screenY).toBe(frame.screenY)
  expect(terminal.screenY).toBe(origin.screenY + 1)
  expect(terminal.height).toBe(frame.height - 1)
  expect(spanColor(expected.label, origin.screenY)).toEqual(RGBA.fromHex(expected.color).toInts())
  expect(spanBackground(expected.label, origin.screenY)).toEqual(
    RGBA.fromHex(expected.background).toInts(),
  )
})

test("agent origin text uses the shared Terminal shimmer", async () => {
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "0"
  await mount(false, 120, 30)
  await launchAgent()
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("term-agents-", "")
  const origin = await waitForRenderable(`terminal-context-origin-${sessionId}`)
  const background = RGBA.fromHex(COLORS.diffAddedBg).toInts().join(",")
  const frames = new Set<string>()

  for (let attempt = 0; attempt < 8 && frames.size < 2; attempt++) {
    await act(async () => Bun.sleep(60))
    await tui?.renderOnce()
    frames.add(
      (tui?.captureSpans().lines[origin.screenY]?.spans ?? [])
        .filter((span) => span.bg.toInts().join(",") === background)
        .map((span) => span.fg.toInts().join(","))
        .join("|"),
    )
  }

  expect(tui?.captureCharFrame()).toContain("Local")
  expect(frames.size).toBeGreaterThan(1)
})

test("Master Key R offers a local destination only for the active remote Codex", async () => {
  await mount()
  await launchAgent()
  await key("b", true)
  expect(tui?.captureCharFrame()).toContain("[R] Sincronizar remoto")
  await key("r")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-folder-browser")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-actions")).toBeDefined()
  await key("escape")

  await launchAgent(true)
  await leader("r")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-folder-browser")).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("Destino da sincronização")
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-folder-browser")).toBeUndefined()
})

test("project environment picker has a single navigation footer without reload", async () => {
  await mount()
  await openAgentProjects()
  await key("e")
  const frame = tui?.captureCharFrame() ?? ""
  expect(frame).toContain("[↑/↓] navegar · [Enter] selecionar · [Esc] cancelar")
  expect(frame).not.toContain("[R] Recarregar")
  await key("r")
  expect(
    tui?.renderer.root.findDescendantById("terminal-dialog-project-environments"),
  ).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
})

test("Master Key A chooses a local directory without a shell or configured SSH profile", async () => {
  await mount()
  await openAgentProjects()
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
  expect(commands).toHaveLength(0)
  await key("p")
  await act(async () => {
    const input = tui?.renderer.root.findDescendantById(
      "terminal-dialog-project-path",
    ) as InputRenderable
    input.value = "/workspace/local-project"
  })
  await waitForFolderResults()
  await key("enter")
  await click("terminal-dialog-project-launch")
  expect(starts.at(-1)).toMatchObject({ cwd: "/workspace/local-project" })
  expect(starts.at(-1)).not.toHaveProperty("remote")
})

test("remote Codex opens Live Diff through its remote source without the local project picker", async () => {
  await mount(false, 140, 36)
  const profile = {
    id: "work-server",
    name: "work-server",
    host: "work-server",
  }
  updateUiSettings({
    terminalRemoteCodexProfiles: [profile],
    terminalRemoteCodexActiveProfileId: profile.id,
  })
  const repositoryRoot = mock(async () => "/srv/project")
  const worktrees = mock(async () => ["/srv/project"])
  const readRoot = mock(async () => ({ truncated: false, files: [] }))
  const readPatch = mock(async () => "")
  const close = mock(() => undefined)
  const source = spyOn(remoteLiveDiff, "createRemoteLiveDiffSource").mockReturnValue({
    repositoryRoot,
    worktrees,
    readRoot,
    readPatch,
    close,
  })
  liveDiffSpies.push(source)

  await launchAgent(true)

  const sessionId = focusedTerminal().id.replace("term-agents-", "")
  await leader("d")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()

  expect(source).toHaveBeenCalledWith({ profile, workingDirectory: "/srv/project" })
  expect(repositoryRoot).toHaveBeenCalledWith("/srv/project", expect.any(AbortSignal))
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`)).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("Live Diff · Remoto · work-server")
  expect(tui?.renderer.root.findDescendantById(`live-diff-add-${sessionId}`)).toBeUndefined()
  await key("a")
  expect(tui?.renderer.root.findDescendantById("live-diff-project-picker")).toBeUndefined()
  await key("x")
  expect(close).toHaveBeenCalledTimes(1)
})

test("Master Key N opens a local terminal even when an SSH profile is active", async () => {
  await mount()
  const profile = {
    id: "work-server",
    name: "Servidor do trabalho",
    host: "work-server",
  }
  updateUiSettings({
    terminalRemoteCodexProfiles: [profile],
    terminalRemoteCodexActiveProfileId: profile.id,
  })

  await leader("n")
  expect(commands[0]).toEqual(processes.createShellTerminalCommand().command)
  expect(codexSpy).not.toHaveBeenCalled()
  expect(tui?.renderer.root.findDescendantById("terminal-location-dialog")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("local-agent-directory-dialog")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("remote-agent-directory-dialog")).toBeUndefined()
})

test("Master Key lists and resumes conversations from the local Codex /resume list", async () => {
  await mount(false, 140, 36)
  await launchAgent()
  await act(async () => {
    publishCodexResumeThreads([
      {
        id: "0199-resume-login",
        title: "Revisar autenticação",
        preview: "Corrija o fluxo de login do projeto",
        lastResponse: "O login foi corrigido e os testes passaram.",
        cwd: "/workspace/project",
        projectName: "project",
        gitBranch: "feature/login",
        updatedAt: Date.now(),
        state: "working",
      },
      {
        id: "0199-resume-login-mobile",
        title: "Revisar login mobile",
        preview: "Confira o fluxo de login em telas pequenas",
        lastResponse: "A experiência mobile foi revisada.",
        cwd: "/workspace/project",
        projectName: "project",
        gitBranch: "feature/login-mobile",
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
  expect(tui?.captureCharFrame()).toContain("AGENTES · RETOMAR")
  expect(tui?.captureCharFrame()).toContain("Revisar autenticação")
  expect(tui?.captureCharFrame()).toContain("└  Corrija o fluxo de login do projeto")
  expect(tui?.captureCharFrame()).toContain("Local  project  ⎇ feature/login")
  expect(spanColor("Revisar autenticação")).toEqual(RGBA.fromHex(COLORS.terminal).toInts())
  expect(spanBackground("Revisar autenticação")).toEqual(RGBA.fromHex(COLORS.panelRaised).toInts())
  const threadTitle = renderable("terminal-resume-title-0199-resume-login")
  expect(spanColor("──", threadTitle.screenY)).toEqual(RGBA.fromHex(COLORS.border).toInts())
  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-actions")
  await arrow("right")
  expect(tui?.captureCharFrame()).toContain("› AGENTES · RETOMAR")
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

test("Master Key resumes an OpenCode conversation with the official attached TUI", async () => {
  await mount(false, 140, 36)
  await act(async () => {
    publishOpenCodeResumeThreads([
      {
        id: "ses_opencode",
        title: "Implementar integração",
        preview: "Concluir suporte ao OpenCode",
        lastResponse: "Integração concluída.",
        cwd: "/workspace/opencode-project",
        projectName: "opencode-project",
        gitBranch: "",
        updatedAt: Date.now(),
        state: "idle",
      },
    ])
  })
  await tui?.renderOnce()
  await key("b", true)
  await arrow("right")

  expect(tui?.captureCharFrame()).toContain("OpenCode · Local")
  expect(tui?.captureCharFrame()).toContain("Implementar integração")
  const origin = renderable("terminal-resume-origin-ses_opencode")
  expect(spanColor("Open", origin.screenY)).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  expect(spanColor("Code", origin.screenY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  expect(spanBackground("Open", origin.screenY)).toEqual(RGBA.fromHex(COLORS.panelAlt).toInts())
  expect(spanBackground("Code", origin.screenY)).toEqual(RGBA.fromHex(COLORS.panelAlt).toInts())
  expect(spanColor("Local", origin.screenY)).toEqual(RGBA.fromHex(COLORS.success).toInts())
  await key("enter")

  expect(openCodeSpy).toHaveBeenCalledTimes(1)
  expect(commands.at(-1)).toEqual([
    "opencode",
    "--server",
    "http://127.0.0.1:4501",
    "--session",
    "ses_opencode",
    "/workspace/opencode-project",
  ])
})

for (const providerId of ["codex", "claude", "opencode"] as const) {
  for (const remote of [false, true]) {
    test(`resumed ${remote ? "remote" : "local"} ${providerId} keeps its title before live updates`, async () => {
      await mount(false, 140, 36)
      const profile = { id: "work-server", name: "Work", host: "work-server" }
      if (remote)
        updateUiSettings({
          terminalRemoteCodexProfiles: [profile],
          terminalRemoteCodexActiveProfileId: profile.id,
        })
      const publish = {
        codex: publishCodexResumeThreads,
        claude: publishClaudeResumeThreads,
        opencode: publishOpenCodeResumeThreads,
      }[providerId]
      await act(async () =>
        publish([
          {
            id: "d4bfcb32-59a0-4abf-bef4-948e948afc12",
            title: "Saved conversation",
            preview: "Different prompt preview",
            lastResponse: "",
            cwd: remote ? "/srv/project" : "/workspace/project",
            projectName: "project",
            gitBranch: "",
            updatedAt: Date.now(),
            state: "idle",
            ...(remote ? { remoteProfileId: profile.id } : {}),
          },
        ]),
      )
      await tui?.renderOnce()
      await key("b", true)
      await arrow("right")
      await key("enter")
      const terminal = focusedTerminal()
      const sessionId = terminal.id.replace("term-agents-", "")
      const titleId = `terminal-agent-context-${sessionId}`
      const titleText = () => tui?.captureCharFrame().split("\n")[renderable(titleId).screenY]
      expect(titleText()).toContain("Saved conversation")

      const events = { codex: codexEvents, claude: claudeEvents, opencode: openCodeEvents }[
        providerId
      ]
      if (!events) throw new Error("Expected resumed provider events")
      await act(async () => {
        if (providerId === "claude") claudeEvents?.onObserved?.()
        events.onState("working")
      })
      await tui?.renderOnce()
      expect(titleText()).toContain("Saved conversation")
      const row = renderable(`terminal-agent-${sessionId}`)
      await act(async () => events.onTitle("Updated title"))
      await tui?.renderOnce()
      expect(titleText()).toContain("Updated title")
      expect(renderable(`terminal-agent-${sessionId}`) === row).toBe(true)
      expect(focusedTerminal() === terminal).toBe(true)
      expect(starts).toHaveLength(1)

      await act(async () => events.onTitle(""))
      await tui?.renderOnce()
      expect(tui?.renderer.root.findDescendantById(titleId)).toBeUndefined()
      expect(row.height).toBe(2)
    })
  }
}

test("Master Key Agents merges local and remote Codex conversations", async () => {
  const profile = {
    id: "work-server",
    name: "Servidor do trabalho",
    host: "work-server",
  }
  updateUiSettings({
    terminalRemoteCodexProfiles: [profile],
    terminalRemoteCodexActiveProfileId: profile.id,
  })
  await mount(false, 140, 36)
  const updatedAt = Date.now()
  await act(async () => {
    publishCodexResumeThreads([
      {
        id: "local-thread",
        title: "Agente local",
        preview: "Projeto local",
        lastResponse: "Local pronto.",
        cwd: "/workspace/local",
        projectName: "local",
        gitBranch: "feature/local",
        updatedAt,
        state: "idle",
      },
    ])
    publishCodexResumeThreads(
      [
        {
          id: "remote-thread",
          title: "Agente remoto",
          preview: "Projeto remoto",
          lastResponse: "Remoto pronto.",
          cwd: "/srv/project",
          projectName: "project",
          gitBranch: "main",
          updatedAt: updatedAt - 1,
          state: "idle",
          remoteProfileId: profile.id,
          remoteProfileName: profile.name,
        },
      ],
      profile.id,
    )
  })
  await tui?.renderOnce()
  await key("b", true)
  await arrow("right")

  expect(tui?.captureCharFrame()).toContain("Agente local")
  expect(tui?.captureCharFrame()).toContain("Agente remoto")
  expect(tui?.captureCharFrame()).toContain("Projeto remoto")
  expect(tui?.captureCharFrame()).toContain("Projeto local")
  expect(tui?.captureCharFrame()).toContain("Codex · Remoto  Servidor do trabalho")
  expect(tui?.captureCharFrame()).toContain("Codex · Local  local  ⎇ feature/local")
  expect(tui?.captureCharFrame()).toContain("⎇ main")
  const localOrigin = renderable("terminal-resume-origin-local-thread")
  const remoteOrigin = renderable("terminal-resume-origin-remote-thread")
  const localMarker = renderable("terminal-resume-marker-local-thread")
  const remoteMarker = renderable("terminal-resume-marker-remote-thread")
  const localConnector = renderable("terminal-resume-connector-local-thread")
  const remoteConnector = renderable("terminal-resume-connector-remote-thread")
  const localDetail = renderable("terminal-resume-detail-local-thread")
  const remoteDetail = renderable("terminal-resume-detail-remote-thread")
  const localProject = renderable("terminal-resume-project-local-thread")
  const remoteProject = renderable("terminal-resume-project-remote-thread")
  const localRail = renderable("terminal-resume-rail-local-thread-0") as TextRenderable
  const localRailMiddle = renderable("terminal-resume-rail-local-thread-1")
  const localRailBottom = renderable("terminal-resume-rail-local-thread-2")
  const remoteRail = renderable("terminal-resume-rail-remote-thread-0") as TextRenderable
  expect(localDetail.screenY).toBe(localOrigin.screenY - 1)
  expect(remoteDetail.screenY).toBe(remoteOrigin.screenY - 1)
  expect(localConnector.screenX).toBe(localMarker.screenX)
  expect(remoteConnector.screenX).toBe(remoteMarker.screenX)
  expect(localOrigin.screenX).toBe(localMarker.screenX)
  expect(remoteOrigin.screenX).toBe(remoteMarker.screenX)
  expect(localProject.screenY).toBe(localOrigin.screenY)
  expect(remoteProject.screenY).toBe(remoteOrigin.screenY)
  expect(localRailMiddle.screenX).toBe(localRail.screenX)
  expect(localRailBottom.screenX).toBe(localRail.screenX)
  expect(localRailMiddle.screenY).toBe(localRail.screenY + 1)
  expect(localRailBottom.screenY).toBe(localRail.screenY + 2)
  expect(localRail.fg.toInts()).toEqual(RGBA.fromHex(COLORS.terminal).toInts())
  expect(remoteRail.fg.toInts()).toEqual(RGBA.fromHex(COLORS.panelRaised).toInts())
  expect(spanColor("└", localConnector.screenY)).toEqual(RGBA.fromHex(COLORS.border).toInts())
  expect(spanColor("Projeto local", localDetail.screenY)).toEqual(
    RGBA.fromHex(COLORS.text).toInts(),
  )
  expect(spanColor("Projeto remoto", remoteDetail.screenY)).toEqual(
    RGBA.fromHex(COLORS.text).toInts(),
  )
  expect(spanColor("Local", localOrigin.screenY)).toEqual(RGBA.fromHex(COLORS.success).toInts())
  expect(spanBackground("Local", localOrigin.screenY)).toEqual(
    RGBA.fromHex(COLORS.diffAddedBg).toInts(),
  )
  expect(spanColor("Remoto", remoteOrigin.screenY)).toEqual(RGBA.fromHex(COLORS.database).toInts())
  expect(spanBackground("Remoto", remoteOrigin.screenY)).toEqual(
    RGBA.fromHex(COLORS.databaseSelectionBg).toInts(),
  )
  await arrow("down")
  expect(localRail.fg.toInts()).toEqual(RGBA.fromHex(COLORS.border).toInts())
  expect(remoteRail.fg.toInts()).toEqual(RGBA.fromHex(COLORS.terminal).toInts())
})

test("a remote Codex conversation resumes through its original SSH profile", async () => {
  await mount(false, 140, 36)
  const profile = {
    id: "work-server",
    name: "Servidor do trabalho",
    host: "work-server",
  }
  updateUiSettings({
    terminalRemoteCodexProfiles: [profile],
    terminalRemoteCodexActiveProfileId: profile.id,
  })
  await act(async () =>
    publishCodexResumeThreads([
      {
        id: "remote-thread",
        title: "Continuar no servidor",
        preview: "Projeto remoto",
        lastResponse: "Pronto.",
        cwd: "/srv/project",
        projectName: "project",
        gitBranch: "main",
        updatedAt: Date.now(),
        state: "idle",
        remoteProfileId: profile.id,
      },
    ]),
  )
  await tui?.renderOnce()

  await key("b", true)
  await arrow("right")
  await key("enter")

  expect(codexSpy).toHaveBeenCalledTimes(1)
  expect(commands.at(-1)).toEqual([
    "codex",
    "resume",
    "remote-thread",
    "--remote",
    "ws://127.0.0.1:4500",
    "-C",
    "/srv/project",
  ])
  expect(starts.at(-1)).toMatchObject({
    resumeThreadId: "remote-thread",
    remote: { profile, workingDirectory: "/srv/project" },
  })
})

test("the compatibility guide retries the exact remote resumed conversation", async () => {
  await mount(false, 140, 36)
  const profile = {
    id: "work-server",
    name: "Servidor do trabalho",
    host: "work-server",
  }
  updateUiSettings({
    terminalRemoteCodexProfiles: [profile],
    terminalRemoteCodexActiveProfileId: profile.id,
  })
  await act(async () =>
    publishCodexResumeThreads([
      {
        id: "remote-thread",
        title: "Continuar no servidor",
        preview: "Projeto remoto",
        lastResponse: "Pronto.",
        cwd: "/srv/project",
        projectName: "project",
        gitBranch: "main",
        updatedAt: Date.now(),
        state: "idle",
        remoteProfileId: profile.id,
      },
    ]),
  )
  codexSpy?.mockRejectedValueOnce(
    new remoteHandshake.RemoteCodexCompatibilityError(incompatibleReport),
  )
  const preflight = spyOn(remoteHandshake, "preflightRemoteCodex").mockResolvedValue({
    ...incompatibleReport,
    compatible: true,
    reason: null,
    remoteVersion: "0.157.9",
    remoteUserAgent: "codex_cli_rs/0.157.9",
  })
  liveDiffSpies.push(preflight)

  await tui?.renderOnce()
  await key("b", true)
  await arrow("right")
  await key("enter")
  await waitForRenderable("remote-codex-compatibility-modal")
  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 && !tui?.renderer.currentFocusedRenderable?.id.startsWith("remote-codex-update-");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  await key("enter")
  for (let attempt = 0; attempt < 100 && codexSpy?.mock.calls.length !== 2; attempt++) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }

  expect(preflight).toHaveBeenCalledTimes(1)
  expect(codexSpy).toHaveBeenCalledTimes(2)
  expect(starts.at(-1)).toMatchObject({
    resumeThreadId: "remote-thread",
    remote: { profile, workingDirectory: "/srv/project" },
  })
  expect(tui?.captureCharFrame()).not.toContain("ATUALIZAR CODEX")
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
        projectName: "project",
        gitBranch: "main",
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
  const idleTitle = renderable("terminal-resume-title-0199-resume-light-idle")
  expect(spanBackground("Agente ocioso", idleTitle.screenY)).toEqual(
    RGBA.fromHex(paletteFor("prime", "light").panelRaised).toInts(),
  )
  await arrow("left")
  const actionTitle = renderable("terminal-action-title-a")
  expect(spanColor("Novo agente", actionTitle.screenY)).toEqual(
    RGBA.fromHex(paletteFor("prime", "light").text).toInts(),
  )
})

test("Master Key S opens a navigable sent-message history below the agent terminal", async () => {
  await mount(false, 140, 36)
  await launchAgent()
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("term-agents-", "")
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
  await act(async () => codexEvents?.onActivity("thinking"))
  await app.renderOnce()
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
  await click(`term-agents-${sessionId}`)
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
  expect(tui?.captureCharFrame()).toContain("Escolhe um agente e inicia uma nova seção.")
  expect(tui?.captureCharFrame()).toContain("Abre um terminal local em uma nova seção.")
  const newCodex = renderable("terminal-action-a")
  const sentMessages = renderable("terminal-action-s")
  const liveDiff = renderable("terminal-action-d")
  const remoteSync = renderable("terminal-action-r")
  const chooseBox = renderable("terminal-action-m")
  expect(sentMessages.screenY).toBe(newCodex.screenY + 2)
  expect(liveDiff.screenY).toBe(sentMessages.screenY + 2)
  expect(remoteSync.screenY).toBe(liveDiff.screenY + 2)
  expect(chooseBox.screenY).toBe(remoteSync.screenY + 2)
  expect(tui?.renderer.root.findDescendantById("terminal-action-g")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-c")).toBeDefined()
  expect(spanColor("Novo agente", newCodex.screenY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  const featureTag = renderable("terminal-action-tag-d-feature")
  const agentTag = renderable("terminal-action-tag-d-agent")
  expect(featureTag.screenX).toBeGreaterThan(renderable("terminal-action-title-d").screenX)
  expect(agentTag.screenX).toBeGreaterThan(featureTag.screenX)
  expect(spanColor("FEATURE", liveDiff.screenY)).toEqual(RGBA.fromHex(COLORS.graphAccent).toInts())
  expect(spanColor("AGENTE", liveDiff.screenY)).toEqual(RGBA.fromHex(COLORS.database).toInts())
  await key("/")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-action-search")
  await act(async () => tui?.mockInput.typeText("agente"))
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

test("Term Agents header and sidebar shortcuts highlight only with the Master Key", async () => {
  await mount(false, 160, 30, {}, true)
  const muted = RGBA.fromHex(COLORS.muted).toInts()
  const brand = RGBA.fromHex(BRAND_COLOR).toInts()
  expect(tui?.captureCharFrame()).not.toContain("[Alt+1–5] MUDAR")

  for (const shortcut of ["[Alt+1]", "[Alt+3]", "[Alt+5]", "[,]", "[Q]"])
    expect(spanColor(shortcut, 0)).toEqual(muted)

  await leader("n")
  const sessionId = focusedTerminal().id.replace("term-agents-", "")
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
  const firstSessionId = first.id.replace("term-agents-", "")
  const secondSessionId = second.id.replace("term-agents-", "")
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
  await leader("l", true)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
})

test("Master Key M selects visible boxes with arrows or HJKL before moving focus", async () => {
  await mount()
  await leader("n")
  const first = focusedTerminal()
  const firstId = first.id.replace("term-agents-", "")
  await split("c")
  const second = focusedTerminal()
  const secondId = second.id.replace("term-agents-", "")
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
  await leader("l", true)
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
  await leader("c")
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("O que deseja colocar no novo painel?")
  expect(starts).toHaveLength(1)
  await click("terminal-split-option-0")
  const second = focusedTerminal()
  expect(starts).toHaveLength(2)
  expect(first.screenY).toBe(second.screenY)
  const frame = tui?.renderer.root.findDescendantById(
    `terminal-pane-frame-${first.id.replace("term-agents-", "")}`,
  )
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(first.height).toBe(frame!.height)
  expect(first.screenX).toBe(panes.screenX)
  expect(first.screenY).toBe(panes.screenY)
  expect(first.height).toBe(panes.height)
  expect(second.screenX).toBe(first.screenX + first.width + 1)
  expect(first.width + second.width + 1).toBe(panes.width)
  expect(tui?.captureCharFrame()).toContain("│")
  await leader("h", true)
  expect(starts).toHaveLength(2)
  await key("escape")
  const splitWidth = second.width
  await leader("x")
  expect(first.width).toBeGreaterThan(splitWidth)
  for (const old of ["❯ TERM AGENTS", "CMD", "Seção 2×2", "Split lado", "vivas ·"]) {
    expect(tui?.captureCharFrame()).not.toContain(old)
  }
  expect(starts).toHaveLength(2)
})

test("split confirmation moves an existing agent without restarting it", async () => {
  await mount()
  await launchAgent()
  const agent = focusedTerminal()
  await leader("n")
  const shell = focusedTerminal()
  expect(starts).toHaveLength(2)

  await leader("c")
  expect(tui?.renderer.root.findDescendantById("terminal-split-dialog")).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("AGENTES EXISTENTES")
  expect(tui?.captureCharFrame()).toContain("Codex")
  await click("terminal-split-option-1")

  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  expect(focusedTerminal()).toBe(agent)
  const agentMetadata = renderable(`terminal-context-${agent.id.replace("term-agents-", "")}`)
  expect(shell.screenY).toBe(agentMetadata.screenY)
  expect(agent.screenY).toBe(agentMetadata.screenY + 1)
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
  await click(`terminal-sidebar-pane-${first.id.replace("term-agents-", "")}`)
  expect(focusedTerminal()).toBe(first)
  await click(`terminal-sidebar-pane-${second.id.replace("term-agents-", "")}`)
  expect(focusedTerminal()).toBe(second)
  await split("c")
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
  const firstId = first.id.replace("term-agents-", "")
  await click(`terminal-sidebar-pane-${firstId}`)
  expect(focusedTerminal()).toBe(first)
  expect(starts).toHaveLength(2)
})

test("legacy custom folders cannot return to the Terminal workspace", async () => {
  process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "1"
  saveTerminalWorkspaceState(processes.TERM_AGENTS_WORKING_DIRECTORY, {
    folders: [{ id: "folder-7", name: "Services" }],
    assignments: {},
    collapsedFolderIds: [],
  })

  await mount()

  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")).toBeUndefined()
  await leader("n")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-folder-folder-7")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-new-folder")).toBeUndefined()
  expect(loadTerminalWorkspaceState(processes.TERM_AGENTS_WORKING_DIRECTORY).folders).toEqual([])
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
  expect(loadTerminalWorkspaceState(processes.TERM_AGENTS_WORKING_DIRECTORY)).toMatchObject({
    collapsedFolderIds: ["terminal"],
  })

  await key("enter")
  expect(tui?.renderer.root.findDescendantById("terminal-sidebar-section-section-1")).toBeDefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-sidebar")
  expect(loadTerminalWorkspaceState(processes.TERM_AGENTS_WORKING_DIRECTORY)).toMatchObject({
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
  await split("c")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("term-agents-", "")
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
  for (const action of ["t", "tab", "p", "f", "o", "g"])
    expect(tui?.renderer.root.findDescendantById(`terminal-action-${action}`)).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-a")).toBeDefined()
  expect(tui?.renderer.root.findDescendantById("terminal-action-c")).toBeDefined()
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

test.each(["h", "c"] as const)("Live Diff shares its %s split pane", async (direction) => {
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
  await launchAgent()
  const agentTerminal = focusedTerminal()
  const sessionId = agentTerminal.id.replace("term-agents-", "")
  await split(direction)
  const siblingTerminal = focusedTerminal()
  const siblingId = siblingTerminal.id.replace("term-agents-", "")
  await click(`terminal-agent-${sessionId}`)
  const panes = renderable("terminal-panes")
  const agentFrame = renderable(`terminal-pane-frame-${sessionId}`)
  const siblingFrame = renderable(`terminal-pane-frame-${siblingId}`)
  const agentPane = agentFrame.parent!
  const siblingPane = siblingFrame.parent!
  if (direction === "h") expect(agentPane.height + siblingPane.height).toBe(panes.height)
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
  await click(`term-agents-${siblingId}`)
  expect(focusedTerminal()).toBe(siblingTerminal)
  await click(`live-diff-${sessionId}`)
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)
  await act(async () => codexEvents?.onActivity("thinking"))
  await tui?.renderOnce()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe(`live-diff-${sessionId}`)

  await key("escape")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`)).toBeDefined()
  expect(focusedTerminal()).toBe(agentTerminal)
  await leader("d")
  await key("x")
  expect(tui?.renderer.root.findDescendantById(`live-diff-${sessionId}`)).toBeUndefined()
  expect(focusedTerminal()).toBe(agentTerminal)
  expect(siblingFrame.parent?.visible).toBe(true)
  if (direction === "h") expect(agentPane.height + siblingPane.height).toBe(panes.height)
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
  await launchAgent()
  const agentTerminal = focusedTerminal()
  const sessionId = agentTerminal.id.replace("term-agents-", "")
  await split("c")
  const siblingTerminal = focusedTerminal()
  const siblingId = siblingTerminal.id.replace("term-agents-", "")
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
  await launchAgent()
  const firstId = focusedTerminal().id.replace("term-agents-", "")
  await launchAgent()
  const secondId = focusedTerminal().id.replace("term-agents-", "")
  await leader("c")
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
  await launchAgent()
  const firstId = focusedTerminal().id.replace("term-agents-", "")
  await launchAgent()
  const secondId = focusedTerminal().id.replace("term-agents-", "")
  await leader("c")
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
  const sessionId = terminal.id.replace("term-agents-", "")
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
  const sessionId = terminal.id.replace("term-agents-", "")
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

test("Remote connection lists ~/.ssh/config aliases and activates the selected Host", async () => {
  updateUiSettings({
    terminalRemoteCodexProfiles: [
      {
        id: "remote-first",
        name: "Primeira VPS",
        host: "remote-first",
      },
      {
        id: "remote-second",
        name: "Segunda VPS",
        host: "remote-second",
      },
    ],
  })
  await mount(true)
  await click("tutorial-settings-button")
  await click("configuration-section-remoteConnection")
  await key("enter")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()
  expect(renderable("configuration-terminal-remote-profile-remote-first")).toBeDefined()
  expect(renderable("configuration-terminal-remote-profile-remote-second")).toBeDefined()
  await arrow("down")
  await key("enter")

  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-remote-view")
  expect(getUiSettings().terminalRemoteCodexActiveProfileId).toBe("remote-second")
  expect(getUiSettings().terminalRemoteCodexProfiles).toEqual([
    { id: "remote-second", name: "remote-second", host: "remote-second" },
  ])
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()
  const activatedFrame = tui?.captureCharFrame() ?? ""
  expect(activatedFrame).toContain("○ INATIVO")
  expect(activatedFrame).toContain("● ATIVO")
  expect(activatedFrame).toContain("remote-second")
})

test("Terminal settings expose no SSH connection or private-key inputs", async () => {
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
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("configuration-terminal-remote-view")
  expect(tui?.renderer.root.findDescendantById("configuration-terminal-remote-form")).toBeDefined()
  for (const field of ["name", "user", "host", "port", "identityFile"])
    expect(
      tui?.renderer.root.findDescendantById(`configuration-terminal-remote-${field}`),
    ).toBeUndefined()
  expect(tui?.captureCharFrame()).toContain("usuário,")
  expect(tui?.captureCharFrame()).toContain("porta e identidade ficam no OpenSSH")
  await click("configuration-terminal-remote-profile-oracle-vps")
  await click("configuration-terminal-remote-activate")
  expect(getUiSettings().terminalRemoteCodexProfiles).toEqual([
    { id: "oracle-vps", name: "oracle-vps", host: "oracle-vps" },
  ])
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

test("Remote connection keeps alias actions visible in a short layout", async () => {
  await mount(true, 58, 18)
  await click("tutorial-settings-button")
  await arrow("down")
  await key("enter")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()

  const frame = tui?.captureCharFrame() ?? ""
  expect(frame).toContain("remote-first")
  expect(frame).not.toContain("Chave privada")
  expect(frame).toContain("[A] Tornar ativo")
  expect(frame).toContain("[T] Testar conexão")
})

test("Remote server configuration opens SSH above a guided barrier flow", async () => {
  updateUiSettings({
    terminalRemoteCodexProfiles: [
      {
        id: "remote-setup",
        name: "remote-setup",
        host: "remote-setup",
      },
    ],
  })
  liveDiffSpies.push(
    spyOn(remoteReadiness, "checkRemoteServerReadiness").mockResolvedValue({
      githubSsh: { id: "githubSsh", ready: false, code: "authentication" },
      codex: { id: "codex", ready: false, code: "codexMissing" },
    }),
    spyOn(remoteReadiness, "checkRemoteServerBarrier").mockResolvedValue({
      id: "githubSsh",
      ready: false,
      code: "authentication",
    }),
  )
  await mount(true, 120, 32)
  await click("tutorial-settings-button")
  await click("configuration-section-remoteConnection")
  await key("enter")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()

  expect(renderable("configuration-terminal-remote-readiness")).toBeDefined()
  expect(renderable("configuration-terminal-remote-verify")).toBeDefined()
  expect(renderable("configuration-terminal-remote-configure")).toBeDefined()
  await key("v")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("O GitHub não aceitou a chave SSH")
  expect(tui?.captureCharFrame()).toContain("O servidor precisa ser configurado.")
  expect(commands).toEqual([])
  await key("c")
  await act(async () => Bun.sleep(20))
  await tui?.renderOnce()

  expect(tui?.renderer.root.findDescendantById("configuration-modal")).toBeUndefined()
  expect(commands[0]).toEqual([
    "ssh",
    "-tt",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "RemoteCommand=none",
    "-o",
    "SessionType=default",
    "-o",
    "StdinNull=no",
    "-o",
    "ForkAfterAuthentication=no",
    "-o",
    "PermitLocalCommand=no",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPersist=no",
    "-S",
    "none",
    "-o",
    "ClearAllForwardings=yes",
    "remote-setup",
  ])
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("term-agents-", "")
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
  expect(tui?.captureCharFrame()).toContain("O GitHub ainda não aceitou a chave SSH")
  expect(tui?.captureCharFrame()).toContain("GitHub via SSH")
  expect(commands).toHaveLength(1)
})

test("sidebar navigation switches among live sections without relaunching their processes", async () => {
  await mount()
  await leader("n")
  const first = focusedTerminal()
  await leader("n")
  const second = focusedTerminal()
  await click(`terminal-sidebar-pane-${first.id.replace("term-agents-", "")}`)
  expect(focusedTerminal()).toBe(first)
  await click(`terminal-sidebar-pane-${second.id.replace("term-agents-", "")}`)
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

test("terminal context tags reserve a row above the PTY and keep state when width becomes narrow", async () => {
  await mount(false, 120, 30)
  repositoryContextSpy?.mockImplementation(async (directory) => ({
    directory,
    projectName: "project",
    branch: "main",
    state: "clean",
  }))
  await leader("n")
  const terminal = focusedTerminal()
  const sessionId = terminal.id.replace("term-agents-", "")
  const panes = tui!.renderer.root.findDescendantById("terminal-panes")!
  for (
    let attempt = 0;
    attempt < 100 && !tui?.renderer.root.findDescendantById(`terminal-context-${sessionId}`);
    attempt++
  ) {
    await act(async () => Bun.sleep(1))
    await tui?.renderOnce()
  }
  expect(
    tui?.renderer.root.findDescendantById(`terminal-context-directory-${sessionId}`),
  ).toBeDefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-context-branch-${sessionId}`),
  ).toBeDefined()
  expect(tui?.renderer.root.findDescendantById(`terminal-context-state-${sessionId}`)).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("project   main   Limpo")
  expect(spanColor("Limpo")).toEqual(RGBA.fromHex(COLORS.success).toInts())
  const metadata = renderable(`terminal-context-${sessionId}`)
  expect(metadata.screenY).toBe(panes.screenY)
  expect(terminal.screenY).toBe(metadata.screenY + 1)
  expect(terminal.width).toBe(panes.width)
  expect(terminal.height).toBe(panes.height - 1)
  expect(terminal.screenY + terminal.height).toBe(panes.screenY + panes.height)
  expect(
    tui?.renderer.root.findDescendantById(`terminal-context-origin-${sessionId}`),
  ).toBeUndefined()

  for (const [kind, explanation] of [
    ["directory", "Pasta do projeto atual."],
    ["branch", "Branch Git atual."],
    ["state", "Repositório Git sem alterações."],
  ] as const) {
    const tag = tui!.renderer.root.findDescendantById(`terminal-context-${kind}-${sessionId}`)!
    await act(async () => tui?.mockMouse.moveTo(tag.screenX + 1, tag.screenY))
    await tui?.renderOnce()
    expect(
      tui?.renderer.root.findDescendantById(`terminal-context-tooltip-${sessionId}`),
    ).toBeDefined()
    expect(tui?.captureCharFrame()).toContain(explanation)
    expect(renderable(`terminal-context-tooltip-${sessionId}`).screenY).toBe(terminal.screenY)
  }
  await act(async () => tui?.mockMouse.moveTo(terminal.screenX + 1, terminal.screenY + 4))
  await tui?.renderOnce()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-context-tooltip-${sessionId}`),
  ).toBeUndefined()

  await act(async () => {
    await tui?.resize(38, 18)
    await Bun.sleep(120)
    await tui?.renderOnce()
  })
  for (
    let attempt = 0;
    attempt < 100 &&
    tui?.renderer.root.findDescendantById(`terminal-context-directory-${sessionId}`);
    attempt++
  ) {
    await act(async () => {
      await Bun.sleep(2)
      await tui?.renderOnce()
    })
  }
  expect(focusedTerminal()).toBe(terminal)
  expect(
    tui?.renderer.root.findDescendantById(`terminal-context-directory-${sessionId}`),
  ).toBeUndefined()
  expect(
    tui?.renderer.root.findDescendantById(`terminal-context-branch-${sessionId}`),
  ).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById(`terminal-context-state-${sessionId}`)).toBeDefined()
  expect(terminal.width).toBe(tui!.renderer.root.findDescendantById("terminal-panes")!.width)
})

test("project picker launches a clicked remote project from the selected origin", async () => {
  await mount()
  const thread = {
    title: "Task",
    preview: "",
    lastResponse: "",
    projectName: "",
    gitBranch: "",
    updatedAt: 100,
    state: "idle" as const,
  }
  publishCodexResumeThreads([{ ...thread, id: "local-project-thread", cwd: "/local/only-local" }])
  publishCodexResumeThreads(
    [
      {
        ...thread,
        id: "remote-project-thread",
        cwd: "/srv/only-remote",
        remoteProfileId: "work-server",
      },
    ],
    "work-server",
  )
  await openAgentProjects()
  expect(tui?.captureCharFrame()).toContain("only-local")
  expect(tui?.captureCharFrame()).not.toContain("only-remote")
  await selectProjectRemote()
  expect(tui?.captureCharFrame()).toContain("only-remote")
  expect(tui?.captureCharFrame()).not.toContain("only-local")
  await click("terminal-dialog-project-row-0")
  expect(starts.at(-1)).toMatchObject({ remote: { workingDirectory: "/srv/only-remote" } })
})

test("project picker retains the destination on launch error and retries once", async () => {
  await mount()
  codexSpy?.mockRejectedValueOnce(new Error("Não foi possível alcançar o servidor remoto."))
  await launchAgent()
  expect(tui?.captureCharFrame()).toContain("Não foi possível alcançar")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
  await click("terminal-dialog-project-launch")
  expect(codexSpy).toHaveBeenCalledTimes(2)
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeUndefined()
  expect(focusedTerminal().id).toStartWith("term-agents-")
})

test("remote compatibility Escape returns to the preserved project selection", async () => {
  await mount()
  codexSpy?.mockRejectedValueOnce(
    new remoteHandshake.RemoteCodexCompatibilityError(incompatibleReport),
  )
  await launchAgent(true)
  await waitForRenderable("remote-codex-compatibility-modal")
  expect(tui?.captureCharFrame()).toContain("CODEX INCOMPATÍVEL")
  expect(tui?.captureCharFrame()).toContain("0.157.2")
  expect(tui?.captureCharFrame()).toContain("0.158.0")

  await key("escape")
  expect(tui?.renderer.root.findDescendantById("remote-codex-compatibility-modal")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
  expect(tui?.captureCharFrame()).toContain("Remoto · work-server")

  await click("terminal-dialog-project-launch")
  expect(codexSpy).toHaveBeenCalledTimes(2)
  expect(starts.at(-1)).toMatchObject({
    remote: { profile: { id: "work-server" }, workingDirectory: "/srv/project" },
  })
})

test("compatibility guide opens local and SSH terminals, revalidates, and relaunches", async () => {
  await mount(false, 150, 38)
  codexSpy?.mockRejectedValueOnce(
    new remoteHandshake.RemoteCodexCompatibilityError(incompatibleReport),
  )
  const updatedReport = { ...incompatibleReport, remoteVersion: "0.159.0" }
  const preflight = spyOn(remoteHandshake, "preflightRemoteCodex")
    .mockRejectedValueOnce(new remoteHandshake.RemoteCodexCompatibilityError(updatedReport))
    .mockResolvedValueOnce({
      ...incompatibleReport,
      compatible: true,
      reason: null,
      remoteVersion: "0.157.9",
      remoteUserAgent: "codex_cli_rs/0.157.9",
    })
  liveDiffSpies.push(preflight)

  await launchAgent(true)
  await waitForRenderable("remote-codex-compatibility-modal")
  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 && !tui?.captureCharFrame().includes("ATUALIZAR CODEX");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  const guide = tui?.captureCharFrame() ?? ""
  expect(guide).toContain("ATUALIZAR CODEX · Local")
  expect(guide).toContain("ATUALIZAR CODEX · work-server")
  expect(guide).toContain("codex update")
  expect(guide).toContain("curl -fsSL https://chatgpt.com/codex/install.sh | sh")
  expect(
    commands.some((command) => command.at(0) === "ssh" && command.at(-1) === "work-server"),
  ).toBe(true)
  expect(inputs.every((input) => input.length === 0)).toBe(true)
  for (
    let attempt = 0;
    attempt < 100 && !tui?.renderer.currentFocusedRenderable?.id.startsWith("remote-codex-update-");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  expect(tui?.renderer.currentFocusedRenderable?.id).toStartWith("remote-codex-update-")

  await key("escape")
  expect(tui?.renderer.currentFocusedRenderable?.id).toStartWith("term-agents-")
  await leader("m")
  await arrow("down")
  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 && !tui?.renderer.currentFocusedRenderable?.id.startsWith("remote-codex-update-");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  expect(tui?.renderer.currentFocusedRenderable?.id).toStartWith("remote-codex-update-")

  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 &&
    (!tui?.captureCharFrame().includes("0.159.0") ||
      !tui?.renderer.currentFocusedRenderable?.id.startsWith("remote-codex-update-"));
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  expect(tui?.captureCharFrame()).toContain("0.159.0")
  expect(tui?.captureCharFrame()).toContain("incompatíveis")
  expect(tui?.renderer.currentFocusedRenderable?.id).toStartWith("remote-codex-update-")

  await key("enter")
  for (let attempt = 0; attempt < 100 && codexSpy?.mock.calls.length !== 2; attempt++) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  expect(preflight).toHaveBeenCalledTimes(2)
  expect(codexSpy).toHaveBeenCalledTimes(2)
  expect(tui?.captureCharFrame()).not.toContain("ATUALIZAR CODEX")
  expect(starts.at(-1)).toMatchObject({
    remote: { profile: { id: "work-server" }, workingDirectory: "/srv/project" },
  })
})

test("OpenCode incompatibility opens its update split, revalidates, and relaunches", async () => {
  await mount(false, 150, 38)
  openCodeSpy?.mockRejectedValueOnce(
    new remoteHandshake.RemoteCodexCompatibilityError(incompatibleOpenCodeReport),
  )
  const preflight = spyOn(remoteOpenCodeCompatibility, "preflightRemoteOpenCode").mockResolvedValue(
    {
      ...incompatibleOpenCodeReport,
      compatible: true,
      reason: null,
      localVersion: "2.0.20",
    },
  )
  liveDiffSpies.push(preflight)

  await leader("a")
  await click("terminal-dialog-agent-provider-opencode")
  await selectProjectRemote()
  await click("terminal-dialog-project-launch")
  await waitForRenderable("remote-codex-compatibility-modal")
  expect(tui?.captureCharFrame()).toContain("OPENCODE INCOMPATÍVEL")
  expect(tui?.captureCharFrame()).toContain("2.0.19")
  expect(tui?.captureCharFrame()).toContain("2.0.20")

  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 && !tui?.captureCharFrame().includes("ATUALIZAR OPENCODE");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  const guide = tui?.captureCharFrame() ?? ""
  expect(guide).toContain("ATUALIZAR OPENCODE · Local")
  expect(guide).toContain("ATUALIZAR OPENCODE · work-server")
  expect(guide).toContain("opencode upgrade")
  expect(guide).toContain("curl -fsSL https://opencode.ai/v2/install | bash")
  expect(inputs.every((input) => input.length === 0)).toBe(true)

  for (
    let attempt = 0;
    attempt < 100 && !tui?.renderer.currentFocusedRenderable?.id.startsWith("remote-codex-update-");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  await key("enter")
  for (let attempt = 0; attempt < 100 && openCodeSpy?.mock.calls.length !== 2; attempt++) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }

  expect(preflight).toHaveBeenCalledTimes(1)
  expect(openCodeSpy).toHaveBeenCalledTimes(2)
  expect(tui?.captureCharFrame()).not.toContain("ATUALIZAR OPENCODE")
  expect(starts.at(-1)).toMatchObject({
    remote: { profile: { id: "work-server" }, workingDirectory: "/srv/project" },
  })
})

test("a missing local Claude CLI opens one update terminal and retries the launch", async () => {
  await mount(false, 150, 38)
  claudeSpy?.mockRejectedValueOnce(
    new remoteHandshake.RemoteCodexCompatibilityError(missingClaudeReport),
  )
  const preflight = spyOn(claudeCompatibility, "preflightClaude").mockResolvedValue({
    ...missingClaudeReport,
    compatible: true,
    reason: null,
    localVersion: "2.1.80",
  })
  liveDiffSpies.push(preflight)

  await leader("a")
  await click("terminal-dialog-agent-provider-claude")
  await click("terminal-dialog-project-launch")
  await waitForRenderable("remote-codex-compatibility-modal")
  expect(tui?.captureCharFrame()).toContain("CLAUDE CODE INCOMPATÍVEL")
  expect(tui?.captureCharFrame()).toContain("O Claude Code não está instalado")

  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 && !tui?.captureCharFrame().includes("ATUALIZAR CLAUDE CODE");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  const guide = tui?.captureCharFrame() ?? ""
  expect(guide).toContain("ATUALIZAR CLAUDE CODE · Local")
  expect(guide).toContain("claude update")
  expect(guide).toContain("curl -fsSL https://claude.ai/install.sh | bash")
  expect(commands.some((command) => command[0] === "ssh")).toBe(false)
  expect(inputs.every((input) => input.length === 0)).toBe(true)

  for (
    let attempt = 0;
    attempt < 100 && !tui?.renderer.currentFocusedRenderable?.id.startsWith("remote-codex-update-");
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  await key("enter")
  for (let attempt = 0; attempt < 100 && claudeSpy?.mock.calls.length !== 2; attempt++) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }

  expect(preflight).toHaveBeenCalledTimes(1)
  expect(claudeSpy).toHaveBeenCalledTimes(2)
  expect(tui?.captureCharFrame()).not.toContain("ATUALIZAR CLAUDE CODE")
  expect(starts.at(-1)).toMatchObject({ cwd: processes.TERM_AGENTS_WORKING_DIRECTORY })
})

test.each([
  {
    providerId: "codex" as const,
    report: missingCodexReport,
    modalTitle: "CODEX INCOMPATÍVEL",
    guideTitle: "ATUALIZAR CODEX · Local",
  },
  {
    providerId: "opencode" as const,
    report: missingOpenCodeReport,
    modalTitle: "OPENCODE INCOMPATÍVEL",
    guideTitle: "ATUALIZAR OPENCODE · Local",
  },
])("a missing local $providerId CLI opens its update guide", async (scenario) => {
  await mount(false, 150, 38)
  const error = new remoteHandshake.RemoteCodexCompatibilityError(scenario.report)
  if (scenario.providerId === "codex") codexSpy?.mockRejectedValueOnce(error)
  else openCodeSpy?.mockRejectedValueOnce(error)

  await leader("a")
  await click(`terminal-dialog-agent-provider-${scenario.providerId}`)
  await click("terminal-dialog-project-launch")
  await waitForRenderable("remote-codex-compatibility-modal")
  expect(tui?.captureCharFrame()).toContain(scenario.modalTitle)

  await key("enter")
  for (
    let attempt = 0;
    attempt < 100 && !tui?.captureCharFrame().includes(scenario.guideTitle);
    attempt++
  ) {
    await act(async () => Bun.sleep(2))
    await tui?.renderOnce()
  }
  expect(tui?.captureCharFrame()).toContain(scenario.guideTitle)
  expect(commands.some((command) => command[0] === "ssh")).toBe(false)
})

test("folder browsing opens a focused home input and Escape restores the existing PTY", async () => {
  await mount(true)
  await leader("n")
  const original = focusedTerminal()
  const count = commands.length
  await openAgentProjects()
  await key("p")
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-dialog-project-path")
  expect((tui?.renderer.currentFocusedRenderable as InputRenderable | undefined)?.value).toBe("~/")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeUndefined()
  expect(commands).toHaveLength(count)
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
  await key("escape")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-agent-provider")).toBeDefined()
  await key("escape")
  expect(focusedTerminal()).toBe(original)
  expect(inputs[0]?.join("")).toBe("")
})

test("project picker cancels stale directory reads when leaving folder search", async () => {
  await mount()
  let finish: ((result: projectDirectories.ProjectDirectory) => void) | undefined
  let querySignal: AbortSignal | undefined
  const query = spyOn(projectDirectories, "readProjectDirectory").mockImplementationOnce(
    async (_target, _path, _base, signal) => {
      querySignal = signal
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  )
  liveDiffSpies.push(query)
  await openAgentProjects()
  await key("p")
  for (let attempt = 0; attempt < 100 && !querySignal; attempt++)
    await act(async () => Bun.sleep(5))
  await key("escape")
  expect(querySignal?.aborted).toBe(true)
  await selectProjectRemote()
  await act(async () =>
    finish?.({ path: "/stale/local-result", directories: [], truncated: false }),
  )
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).not.toContain("stale/local-result")
  expect(tui?.captureCharFrame()).toContain("Remoto")
  expect(commands).toHaveLength(0)
})

test("project picker keeps destination and launch visible in a short terminal", async () => {
  await mount(false, 70, 12)
  await openAgentProjects()
  expect(tui?.captureCharFrame()).toContain("Iniciar agente")
  expect(tui?.captureCharFrame()).toContain("Local")
  const launch = tui?.renderer.root.findDescendantById("terminal-dialog-project-launch")
  expect(launch?.screenY).toBeLessThan(12)
  await key("escape")
  expect(commands).toHaveLength(0)
})

for (const width of [70, 110])
  test(`project and folder picker actions share one visible footer row at ${width} columns`, async () => {
    await mount(false, width, 24)
    await openAgentProjects()
    const assertFooter = (ids: string[]) => {
      const controls = ids.map((id) => tui?.renderer.root.findDescendantById(id))
      const y = controls[0]?.screenY
      expect(y).toBeDefined()
      for (const control of controls) {
        expect(control).toBeDefined()
        expect(control?.screenY).toBe(y)
        expect(control?.height).toBe(1)
        expect((control?.screenX ?? width) + (control?.width ?? width)).toBeLessThan(width - 1)
      }
    }
    assertFooter([
      "terminal-dialog-project-browse",
      "terminal-dialog-project-launch",
      "terminal-dialog-project-back",
    ])
    await key("p")
    await waitForFolderResults()
    assertFooter([
      "terminal-dialog-folder-hints",
      "terminal-dialog-folder-choose",
      "terminal-dialog-folder-back",
    ])
    const footer = tui
      ?.captureCharFrame()
      .split("\n")
      .find((line) => line.includes("[Tab]"))
    expect(footer).toContain("[↑/↓]")
    expect(footer).toContain("[Enter] Usar pasta")
    expect(footer).toContain("[Esc] Voltar")
    expect(tui?.captureCharFrame()).not.toContain("[F2]")
    await key("escape")
    expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeDefined()
    expect(commands).toHaveLength(0)
  })

test("cancelling an agent startup retires only the pending session and cannot launch twice", async () => {
  await mount()
  await leader("n")
  const original = focusedTerminal()
  let finish: ((handle: processes.TermAgentsProcessHandle) => void) | undefined
  const stopped = mock(async () => undefined)
  codexSpy?.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await launchAgent()
  expect(tui?.captureCharFrame()).toContain("Iniciando agente")
  expect(
    tui?.renderer.root.findDescendantById("terminal-project-launch-loader-pattern"),
  ).toBeDefined()
  await key("enter")
  expect(codexSpy).toHaveBeenCalledTimes(1)
  await key("escape")
  await act(async () => finish?.({ pid: 1234, write() {}, resize() {}, stop: stopped }))
  await tui?.renderOnce()
  expect(stopped).toHaveBeenCalledTimes(1)
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-picker")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-agent-provider")).toBeDefined()
  await key("escape")
  expect(focusedTerminal()).toBe(original)
})

for (const remote of [false, true])
  test(`folder input autocompletes ${remote ? "remote" : "local"} paths while retaining focus`, async () => {
    await mount()
    const root = remote ? "/home/remote" : "/home/local"
    const query = spyOn(projectDirectories, "readProjectDirectory").mockImplementation(
      async (target, path, _base, _signal, list = true) => {
        expect(target.kind).toBe(remote ? "remote" : "local")
        const canonical = path.replace(/^~(?=\/|$)/u, root).replace(/\/$/u, "")
        return {
          path: canonical,
          directories:
            list && canonical === root
              ? [
                  `${root}/Projects`,
                  `${root}/Próximo projeto`,
                  `${root}/Documents`,
                  `${root}/.hidden`,
                ]
              : list
                ? [`${canonical}/child-folder`]
                : [],
          truncated: false,
        }
      },
    )
    liveDiffSpies.push(query)
    await openAgentProjects()
    if (remote) await selectProjectRemote()
    await key("p")
    await waitForFolderResults()
    const input = tui?.renderer.root.findDescendantById(
      "terminal-dialog-project-path",
    ) as InputRenderable
    expect(tui?.renderer.currentFocusedRenderable).toBe(input)
    expect(input.value).toBe("~/")
    const calls = query.mock.calls.length
    await act(async () => tui?.mockInput.typeText("Pr"))
    await tui?.renderOnce()
    expect(input.value).toBe("~/Pr")
    expect(tui?.captureCharFrame()).toContain("Projects/")
    expect(tui?.captureCharFrame()).not.toContain("Documents/")
    expect(query.mock.calls.length).toBe(calls)
    await arrow("down")
    await key("tab")
    expect(input.value).toBe("~/Próximo projeto/")
    expect(tui?.renderer.currentFocusedRenderable).toBe(input)
    await waitForFolderResults()
    expect(commands).toHaveLength(0)
    await key("enter")
    expect(tui?.renderer.root.findDescendantById("terminal-dialog-folder-browser")).toBeUndefined()
    expect(tui?.captureCharFrame()).toContain("Próximo projeto")
    await key("enter")
    expect(starts.at(-1)).toMatchObject(
      remote
        ? { remote: { workingDirectory: `${root}/Próximo projeto` } }
        : { cwd: `${root}/Próximo projeto` },
    )
  })

test("project picker adds discovered Git repositories without duplicating recents or mixing hosts", async () => {
  await mount()
  const discovery = spyOn(gitProjects, "discoverAgentGitProjects").mockImplementation(
    async (target) => ({
      paths:
        target.kind === "local" ? ["/local/recent", "/local/discovered-git"] : ["/srv/remote-git"],
      truncated: false,
    }),
  )
  liveDiffSpies.push(discovery)
  await act(async () =>
    publishCodexResumeThreads([
      {
        id: "recent",
        title: "Task",
        cwd: "/local/recent",
        preview: "",
        lastResponse: "",
        projectName: "recent",
        gitBranch: "",
        updatedAt: 100,
        state: "idle",
      },
    ]),
  )
  await openAgentProjects()
  expect(tui?.captureCharFrame()).toContain("Projetos recentes")
  expect(tui?.captureCharFrame()).toContain("Projetos Git encontrados")
  expect(tui?.captureCharFrame()).toContain("discovered-git")
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-row-3")).toBeUndefined()
  expect(tui?.renderer.root.findDescendantById("terminal-dialog-project-search")).toBeUndefined()
  await selectProjectRemote()
  expect(tui?.captureCharFrame()).toContain("remote-git")
  expect(tui?.captureCharFrame()).not.toContain("discovered-git")
  await click("terminal-dialog-project-launch")
  expect(starts.at(-1)).toMatchObject({ remote: { workingDirectory: "/srv/remote-git" } })
})

test("editing a folder parent aborts its old query and ignores a delayed reply", async () => {
  await mount()
  let oldSignal: AbortSignal | undefined
  let finishOld: ((value: projectDirectories.ProjectDirectory) => void) | undefined
  const query = spyOn(projectDirectories, "readProjectDirectory").mockImplementation(
    async (_target, path, _base, signal) => {
      if (path === "~/") {
        oldSignal = signal
        return new Promise((resolve) => {
          finishOld = resolve
        })
      }
      return { path: "/new", directories: ["/new/current-folder"], truncated: false }
    },
  )
  liveDiffSpies.push(query)
  await openAgentProjects()
  await key("p")
  for (let attempt = 0; attempt < 100 && !oldSignal; attempt++) await act(async () => Bun.sleep(5))
  const input = tui?.renderer.root.findDescendantById(
    "terminal-dialog-project-path",
  ) as InputRenderable
  await act(async () => {
    input.value = "/new/"
  })
  await tui?.renderOnce()
  expect(oldSignal?.aborted).toBe(true)
  await waitForFolderResults()
  await act(async () =>
    finishOld?.({ path: "/old", directories: ["/old/stale-folder"], truncated: false }),
  )
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("current-folder/")
  expect(tui?.captureCharFrame()).not.toContain("stale-folder")
  expect(input.value).toBe("/new/")
  expect(commands).toHaveLength(0)
})

test("folder validation shows its loader, preserves the path on failure, and returns focus", async () => {
  await mount()
  const validation = Promise.withResolvers<projectDirectories.ProjectDirectory>()
  const query = spyOn(projectDirectories, "readProjectDirectory").mockImplementation(
    async (_target, _path, _base, _signal, list = true) => {
      if (!list) return validation.promise
      return { path: "/fixture/home", directories: [], truncated: false }
    },
  )
  liveDiffSpies.push(query)
  await openAgentProjects()
  await key("p")
  await waitForFolderResults()
  await click("terminal-dialog-folder-choose")
  expect(tui?.renderer.root.findDescendantById("terminal-folder-open-loader-pattern")).toBeDefined()
  await act(async () => {
    validation.reject(new Error("Não foi possível acessar a pasta selecionada."))
    await Bun.sleep(0)
  })
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("Não foi possível acessar")
  expect(
    tui?.renderer.root.findDescendantById("terminal-folder-open-loader-pattern"),
  ).toBeUndefined()
  expect(tui?.renderer.currentFocusedRenderable?.id).toBe("terminal-dialog-project-path")
  expect((tui?.renderer.currentFocusedRenderable as InputRenderable | undefined)?.value).toBe("~/")
  expect(commands).toHaveLength(0)
})

test("autocomplete uses the native input buffer when typing and Tab arrive in one packet", async () => {
  await mount()
  const query = spyOn(projectDirectories, "readProjectDirectory").mockResolvedValue({
    path: "/fixture/home",
    directories: ["/fixture/home/Library", "/fixture/home/Projects"],
    truncated: false,
  })
  liveDiffSpies.push(query)
  await openAgentProjects()
  await key("p")
  await waitForFolderResults()
  await act(async () => tui?.mockInput.pressKey("Pr\t"))
  await tui?.renderOnce()
  const input = tui?.renderer.currentFocusedRenderable as InputRenderable
  expect(input.id).toBe("terminal-dialog-project-path")
  expect(input.value).toBe("~/Projects/")
  expect(commands).toHaveLength(0)
})
