import type { FeatureState } from "../apps/cli/src/features/controller"
import { demoTextRuns } from "./readme-demo-text"
import { prepareTerminalMirrorDemo } from "./readme-terminal-mirror"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { TextareaRenderable } from "@opentui/core"
import type { CapturedFrame } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement, useState } from "react"

type FocusRect = {
  x: number
  y: number
  width: number
  height: number
}

type DemoFrame = {
  capture: CapturedFrame
  caption: string
  focus?: FocusRect | undefined
  delay?: number | undefined
}

const TERMINAL_COLUMNS = 140
const TERMINAL_ROWS = 34
const CELL_WIDTH = 7.4
const CELL_HEIGHT = 16
const FONT_SIZE = 12
const OUTER_PADDING = 14
const TITLE_HEIGHT = 34
const FOOTER_HEIGHT = 36
const ROOT = resolve(import.meta.dir, "..")
const OUTPUT_ROOT = join(ROOT, "docs", "media")
const CAPTURE_ROOT = mkdtempSync(join(tmpdir(), "tuiminal-readme-demos-"))
const PROJECT_ROOT = join(CAPTURE_ROOT, "workspace")

process.env.XDG_CONFIG_HOME = join(CAPTURE_ROOT, "config")
process.env.TUIMINAL_TERMINAL_BACKEND = "native"
process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = "0"
process.env.TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY = "0"
process.env.TUIMINAL_TERMINAL_RESTORE = "0"
process.env.TUIMINAL_TERMINAL_PINNED_TMUX = "0"
process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "0"
process.env.XDG_DATA_HOME = join(CAPTURE_ROOT, "data")
process.env.TUIMINAL_WORKDIR = PROJECT_ROOT
process.env.TUIMINAL_HTTP_HOME = PROJECT_ROOT
process.env.TUIMINAL_PROJECT_ROOTS = CAPTURE_ROOT
process.env.TUIMINAL_TEST_STATIC_LOADERS = "1"
process.env.TUIMINAL_TEST_SKIP_STARTUP = "1"
process.env.TUIMINAL_GIT_PR_DEMO = "1"
process.env.TUIMINAL_GIT_ISSUES_DEMO = "1"
process.env.TUIMINAL_GIT_INBOX_DEMO = "1"
if (process.platform !== "win32") {
  const demoShell = join(CAPTURE_ROOT, "demo-shell")
  writeFileSync(
    demoShell,
    '#!/bin/sh\nif [ "$1" = "-lc" ]; then shift; exec /bin/sh -c "$@"; fi\nif [ "$1" = "-l" ]; then shift; fi\nexec /bin/sh "$@"\n',
    { mode: 0o755 },
  )
  process.env.SHELL = demoShell
}
delete process.env.DATABASE_URL
delete process.env.MYSQL_URL
delete process.env.POSTGRES_URL
delete process.env.TUIMINAL_MYSQL_MCP_COMMAND

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

mkdirSync(PROJECT_ROOT, { recursive: true })
mkdirSync(join(PROJECT_ROOT, "src"), { recursive: true })
writeFileSync(
  join(PROJECT_ROOT, "package.json"),
  `${JSON.stringify(
    {
      name: "tuiminal-demo-workspace",
      private: true,
      scripts: {
        "dev:api":
          "node -e \"console.log('API ready · http://127.0.0.1:43117'); setInterval(()=>console.log('GET /health 200 · 12ms'),2000)\"",
        "dev:web":
          "node -e \"console.log('Web ready · http://127.0.0.1:43118'); setInterval(()=>console.log('GET / 200 · 8ms'),2000)\"",
        test: "node -e \"console.log('42 tests passed')\"",
      },
    },
    null,
    2,
  )}\n`,
)
writeFileSync(join(PROJECT_ROOT, "README.md"), "# Acme API\n\nPrimeira versão.\n")
writeFileSync(join(PROJECT_ROOT, "src", "server.ts"), "export const port = 43117\n")
execFileSync("git", ["init", "--quiet", "--initial-branch=main", PROJECT_ROOT])
execFileSync("git", ["-C", PROJECT_ROOT, "add", "."])
execFileSync("git", [
  "-C",
  PROJECT_ROOT,
  "-c",
  "user.name=Tuiminal Demo",
  "-c",
  "user.email=demo@tuiminal.dev",
  "commit",
  "--quiet",
  "-m",
  "feat: bootstrap API",
])
writeFileSync(
  join(PROJECT_ROOT, "src", "server.ts"),
  "export const port = 43117\nexport const health = '/health'\n",
)
writeFileSync(join(PROJECT_ROOT, "src", "cache.ts"), "export const ttl = 30_000\n")

// Import app runtime only after isolating config, data and project paths.
const { FeatureInstaller } = await import("../apps/cli/src/features/FeatureInstaller")
const { updateUiSettings, UI_SETTINGS_PATH } = await import("../packages/core/src/settings/theme")
if (UI_SETTINGS_PATH !== join(CAPTURE_ROOT, "config", "tuiminal", "settings.json"))
  throw new Error("Documentation captures must use isolated settings")
const { DatabaseTutorialDemo } = await import(
  "../packages/feature-database/src/tutorial/DatabaseTutorialDemo"
)
const { GitViewer } = await import("../packages/feature-git/src")
const { Runner } = await import("../packages/feature-runner/src")
const { HttpTutorialDemo } = await import("../packages/feature-http/src/tutorial/HttpTutorialDemo")
const { FreeTerminal } = await import("../packages/feature-terminal/src")
const { stopAllRunnerProcesses } = await import("../packages/feature-runner/src/services/process")
const { stopAllFreeTerminalProcesses } = await import(
  "../packages/feature-terminal/src/services/terminal"
)

updateUiSettings({
  colorMode: "dark",
  palette: "prime",
  layout: "framed",
  language: "pt-BR",
})

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function rgbaToHex(value: { toInts(): number[] }, fallback: string) {
  const [red = 0, green = 0, blue = 0, alpha = 0] = value.toInts()
  if (alpha === 0) return fallback
  return `#${[red, green, blue]
    .map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0"))
    .join("")}`
}

function focusFor(tui: TestRendererSetup, id?: string): FocusRect | undefined {
  if (!id) return undefined
  const renderable = tui.renderer.root.findDescendantById(id)
  if (!renderable) throw new Error(`Área de demonstração não encontrada: ${id}`)
  return {
    x: renderable.screenX,
    y: renderable.screenY,
    width: renderable.width,
    height: renderable.height,
  }
}

function snapshot(
  tui: TestRendererSetup,
  caption: string,
  focusId?: string,
  delay = 130,
): DemoFrame {
  return {
    capture: tui.captureSpans(),
    caption,
    focus: focusFor(tui, focusId),
    delay,
  }
}

async function settle(
  tui: TestRendererSetup,
  predicate: () => boolean = () => true,
  attempts = 160,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (predicate()) return
  }
  throw new Error(`A interface não estabilizou:\n${tui.captureCharFrame()}`)
}

async function pressKey(
  tui: TestRendererSetup,
  name: string,
  options: { ctrl?: boolean; shift?: boolean; meta?: boolean; option?: boolean } = {},
) {
  act(() => {
    if (name === "enter") tui.mockInput.pressEnter()
    else if (name === "space") tui.mockInput.pressKey(" ")
    else if (name === "escape") tui.mockInput.pressEscape()
    else if (name === "down") tui.mockInput.pressArrow("down")
    else if (name === "up") tui.mockInput.pressArrow("up")
    else tui.mockInput.pressKey(name, options)
  })
  await act(async () => Bun.sleep(name === "escape" ? 65 : 12))
  await tui.renderOnce()
}

async function typeInto(tui: TestRendererSetup, id: string, value: string, replace = false) {
  const input = tui.renderer.root.findDescendantById(id) as
    | { focus?: () => void; value?: string }
    | undefined
  if (!input?.focus) throw new Error(`Campo de demonstração não encontrado: ${id}`)
  act(() => {
    input.focus?.()
    if (replace) input.value = ""
  })
  await act(async () => tui.mockInput.typeText(value))
  await tui.renderOnce()
}

async function pressRenderable(tui: TestRendererSetup, id: string) {
  const target = tui.renderer.root.findDescendantById(id) as { press?: () => void } | undefined
  if (!target?.press) throw new Error(`Controle de demonstração não encontrado: ${id}`)
  await act(async () => {
    target.press?.()
    await Bun.sleep(12)
  })
  await tui.renderOnce()
}

async function clickRenderable(tui: TestRendererSetup, id: string) {
  const target = tui.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Alvo de mouse da demonstração não encontrado: ${id}`)
  await act(async () => {
    await tui.mockMouse.click(
      target.screenX + Math.max(0, Math.floor(target.width / 2)),
      target.screenY + Math.max(0, Math.floor(target.height / 2)),
    )
    await Bun.sleep(12)
  })
  await tui.renderOnce()
}

function destroy(tui: TestRendererSetup | undefined) {
  if (!tui) return
  act(() => tui.renderer.destroy())
}

async function installationFrames() {
  let update = (_patch: Partial<FeatureState>) => {}
  let animate = (_step: number) => {}
  function DemoInstaller() {
    const [previewStep, setPreviewStep] = useState(0)
    animate = setPreviewStep
    const [state, setState] = useState<FeatureState>({
      ready: true,
      installed: [],
      busy: null,
      progress: null,
      error: "",
    })
    update = (patch) => setState((current) => ({ ...current, ...patch }))
    return createElement(FeatureInstaller, {
      state,
      selected: "runner",
      blocked: false,
      previewStep,
      onInstall: () => update({ busy: "runner", progress: { received: 0, total: 100 } }),
      onUninstall: (id) => update({ installed: state.installed.filter((item) => item !== id) }),
      onOpen: () => {},
      onCancel: () => update({ busy: null, progress: null }),
      onClose: () => {},
      onSettings: () => {},
    })
  }
  const tui = await testRender(createElement(DemoInstaller), {
    width: TERMINAL_COLUMNS,
    height: TERMINAL_ROWS,
  })
  try {
    await settle(tui)
    const frames = [
      snapshot(
        tui,
        "Primeira abertura · escolha suas ferramentas oficiais",
        "feature-option-runner",
        170,
      ),
    ]
    for (const id of ["database", "git", "runner", "http", "terminal"]) {
      const target = tui.renderer.root.findDescendantById(`feature-option-${id}`)!
      await act(async () => {
        await tui.mockMouse.moveTo(target.screenX + 8, target.screenY + 1)
      })
      for (const step of [0, 6, 12, 18, 24, 30, 36, 42]) {
        act(() => animate(step))
        await tui.renderOnce()
        frames.push(
          snapshot(
            tui,
            "Passe o mouse ou use [↑/↓/J/K] para explorar cada ferramenta",
            "feature-preview",
            45,
          ),
        )
      }
    }
    await pressKey(tui, "up")
    await pressKey(tui, "up")
    await pressKey(tui, "space")
    await pressKey(tui, "up")
    await pressKey(tui, "space")
    frames.push(
      snapshot(tui, "[Space] selecionar · [I] instalar em sequência", "feature-option-git", 170),
    )
    await pressKey(tui, "i")
    for (const received of [10, 30, 55, 80, 100]) {
      act(() => update({ progress: { received, total: 100 } }))
      await settle(tui)
      frames.push(
        snapshot(tui, "O fundo da ferramenta acompanha o download", "feature-option-runner", 40),
      )
    }
    act(() => update({ busy: null, progress: null, installed: ["runner", "git"] }))
    await settle(tui)
    frames.push(snapshot(tui, "Ferramentas instaladas · [Enter] abrir", "feature-option-git", 190))
    await pressKey(tui, "d")
    frames.push(snapshot(tui, "[D] Desinstalar pede confirmação", "feature-uninstall-dialog", 190))
    await pressKey(tui, "y")
    frames.push(
      snapshot(tui, "A ferramenta pode ser instalada novamente", "feature-option-git", 170),
    )
    return frames
  } finally {
    destroy(tui)
  }
}

async function databaseFrames() {
  const tui = await testRender(createElement(DatabaseTutorialDemo), {
    width: TERMINAL_COLUMNS,
    height: TERMINAL_ROWS,
  })
  try {
    await settle(tui)
    return [
      snapshot(tui, "[Alt+1] Banco · catálogo, grade e inspetor", "tutorial-db-grid", 170),
      snapshot(
        tui,
        "[Space] marca linhas · [Alt+Space] seleciona intervalos",
        "tutorial-db-table-grid",
      ),
      snapshot(
        tui,
        "[F] ordena · [S] busca · [V] mascara dados sensíveis",
        "tutorial-db-table-tools",
      ),
      snapshot(
        tui,
        "[Ctrl+S] revisa INSERT, UPDATE e DELETE antes da transação",
        "tutorial-db-review",
      ),
      snapshot(tui, "[A] abre queries SQL sem perder a tabela atual", "tutorial-db-new-query", 170),
    ]
  } finally {
    destroy(tui)
  }
}

async function gitFrames() {
  updateUiSettings({ layout: "compact" })
  const tui = await testRender(createElement(GitViewer, { active: true }), {
    width: TERMINAL_COLUMNS,
    height: TERMINAL_ROWS,
  })
  try {
    await settle(tui, () => tui.captureCharFrame().includes("export const ttl"))
    const frames = [
      snapshot(tui, "[1] Diffs · arquivos, grafo e preview local", "git-base-files-panel", 160),
    ]

    await pressKey(tui, "l")
    frames.push(
      snapshot(tui, "[H/L] alterna o foco entre a árvore e o diff", "git-base-preview-panel"),
    )

    await pressRenderable(tui, "git-tab-pr")
    await settle(tui, () => tui.captureCharFrame().includes("integração GitHub"))
    frames.push(snapshot(tui, "[2] PR · filas, checks e revisão", "git-pr-preview-panel"))

    await clickRenderable(tui, "git-pr-open-diff")
    await settle(tui, () => tui.captureCharFrame().includes("src/cache.ts"))
    frames.push(snapshot(tui, "[D] abre o diff completo sem sair do terminal"))

    await pressKey(tui, "escape")
    await pressRenderable(tui, "git-tab-issues")
    await settle(tui, () => tui.captureCharFrame().includes("Cache expira"))
    frames.push(snapshot(tui, "[3] Issues · triagem, contexto e ações seguras", "git-issue-row-0"))

    await pressRenderable(tui, "git-tab-inbox")
    await settle(tui, () => tui.captureCharFrame().includes("Evitar corrida"))
    frames.push(
      snapshot(tui, "[4] Inbox · notificações, revisão e itens salvos", "git-inbox-row-0", 170),
    )
    return frames
  } finally {
    destroy(tui)
  }
}

async function runnerFrames() {
  updateUiSettings({ layout: "framed" })
  const tui = await testRender(createElement(Runner, { active: true }), {
    width: TERMINAL_COLUMNS,
    height: TERMINAL_ROWS,
  })
  try {
    await settle(
      tui,
      () =>
        tui.renderer.currentFocusedRenderable?.id === "runner-command-list" &&
        tui.captureCharFrame().includes("dev:api"),
    )
    const frames = [
      snapshot(tui, "[Alt+3] Runner · comandos detectados no projeto", "runner-command-panel", 160),
    ]

    await pressKey(tui, "down")
    await pressKey(tui, "enter")
    await settle(tui, () => tui.captureCharFrame().includes("API ready"))
    frames.push(snapshot(tui, "[Enter] inicia e acompanha logs em tempo real", "runner-log-scroll"))

    await pressKey(tui, "down")
    await pressKey(tui, "enter")
    await settle(tui, () => tui.captureCharFrame().includes("Web ready"))
    await pressKey(tui, "m")
    await settle(tui, () => tui.captureCharFrame().includes("MULTI"))
    frames.push(snapshot(tui, "[M] acompanha vários processos lado a lado"))

    await pressKey(tui, "m")
    await pressKey(tui, "p")
    await settle(tui, () => Boolean(tui.renderer.root.findDescendantById("runner-process-list")))
    frames.push(
      snapshot(tui, "[P] alterna entre comandos e processos ativos", "runner-process-list"),
    )

    await pressKey(tui, "y", { ctrl: true })
    await settle(tui, () => tui.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
    frames.push(
      snapshot(
        tui,
        "[Ctrl+Y] abre o arquivo YAML com comandos e fluxos",
        "runner-config-editor",
        180,
      ),
    )
    const editor = tui.renderer.root.findDescendantById("runner-config-yaml") as TextareaRenderable
    await act(async () => {
      const lines = editor.plainText.split("\n")
      const line = lines.findIndex((entry) => entry.includes("restart: never"))
      editor.setCursor(line, lines[line]!.length)
      editor.insertText("x")
      await Bun.sleep(20)
    })
    await settle(tui, () => tui.captureCharFrame().includes("RECOMENDAÇÕES"))
    frames.push(
      snapshot(tui, "Recomendações de valores durante a digitação", "runner-config-suggestions"),
    )
    await pressKey(tui, "BACKSPACE")
    await settle(tui, () => !editor.plainText.includes("restart: neverx"))
    const originalSource = editor.plainText
    await act(async () => {
      editor.setSelection(0, editor.plainText.length)
      await tui.mockInput.pasteBracketedText("flows:\n  ")
    })
    await settle(tui, () => tui.captureCharFrame().includes("ID único do fluxo."))
    frames.push(
      snapshot(tui, "Depois de flows:, recomenda um ID de fluxo", "runner-config-suggestions"),
    )
    await act(async () => {
      editor.setSelection(0, editor.plainText.length)
      await tui.mockInput.pasteBracketedText(originalSource)
    })
    const { runnerYamlDocument, setRunnerYamlDefinition } = await import(
      "../packages/feature-runner/src/model/configuration-yaml"
    )
    const document = runnerYamlDocument(editor.plainText)
    setRunnerYamlDefinition(document, "flows", "development", {
      label: "Ambiente local",
      autostart: false,
      stages: [
        { commandIds: ["test"], waitFor: "completed" },
        { commandIds: ["dev:api", "dev:web"], waitFor: "started" },
      ],
    })
    await act(async () => {
      editor.setSelection(0, editor.plainText.length)
      await tui.mockInput.pasteBracketedText(document.toString({ lineWidth: 0 }))
    })
    await act(async () => {
      const lines = editor.plainText.split("\n")
      const line = lines.findIndex((line) => line.includes("commandIds:"))
      editor.setCursor(line, 8)
      await Bun.sleep(20)
    })
    await settle(tui, () => tui.captureCharFrame().includes("Configuração válida."))
    frames.push(
      snapshot(
        tui,
        "YAML: etapas sequenciais e paralelas, ajuda e validação",
        "runner-config-editor",
        220,
      ),
    )
    await pressKey(tui, "s", { ctrl: true })
    await settle(tui, () => tui.captureCharFrame().includes("CONFIGURAÇÃO DO RUNNER"))
    frames.push(
      snapshot(tui, "Fluxos salvos: executar, parar e reiniciar", "runner-config-modal", 180),
    )
    await pressKey(tui, "escape")
    await pressKey(tui, "n")
    await settle(tui, () => tui.captureCharFrame().includes("PROCURAR NOS ARQUIVOS"))
    frames.push(
      snapshot(tui, "[N] abre outro projeto sem parar os atuais", "runner-project-list", 170),
    )
    return frames
  } finally {
    destroy(tui)
    stopAllRunnerProcesses()
  }
}

async function httpFrames() {
  const tui = await testRender(createElement(HttpTutorialDemo), {
    width: TERMINAL_COLUMNS,
    height: TERMINAL_ROWS,
  })
  try {
    await settle(tui)
    return [
      snapshot(tui, "[Alt+4] HTTP · documentos e coleção", "tutorial-http-documents", 160),
      snapshot(tui, "Método, URL, ambiente e envio em uma única barra", "tutorial-http-omnibar"),
      snapshot(tui, "Params, headers, body, autenticação e opções", "tutorial-http-request"),
      snapshot(
        tui,
        "Assertions, chaining e preview usam o mesmo fluxo da coleção",
        "tutorial-http-automation",
      ),
      snapshot(
        tui,
        "Request e response começam em 50/50 e o split é ajustável",
        "tutorial-http-response",
        170,
      ),
    ]
  } finally {
    destroy(tui)
  }
}

async function nativeTerminalFrames() {
  const agentPath = join(PROJECT_ROOT, "codex.js")
  const reviewerPath = join(PROJECT_ROOT, "claude.js")
  writeFileSync(
    agentPath,
    `process.stdout.write(${JSON.stringify("\x1b[2J\x1b[HCodex · simulated session\r\n\r\nReview the API and its tests.\r\n\r\n• Reading src/server.ts (2s • esc to interrupt)\r\n› \r\n? for shortcuts")}); setInterval(() => {}, 1000)\n`,
  )
  writeFileSync(
    reviewerPath,
    `process.stdout.write(${JSON.stringify("\x1b[2J\x1b[HClaude Code · simulated session\r\n\r\n────────────\r\nDo you want to proceed?\r\n❯ 1. Yes\r\n2. No\r\nEnter to confirm · Esc to cancel")}); setInterval(() => {}, 1000)\n`,
  )
  const tui = await testRender(createElement(FreeTerminal, { active: true }), {
    width: TERMINAL_COLUMNS,
    height: TERMINAL_ROWS,
  })
  const prefix = async (key: string) => {
    await pressKey(tui, "b", { ctrl: true })
    await pressKey(tui, key)
  }
  try {
    await settle(tui)
    const frames = [snapshot(tui, "Terminal · sessões e agentes na sidebar", undefined, 140)]
    await prefix("d")
    await typeInto(tui, "terminal-command-input", "Development")
    await pressKey(tui, "enter")
    await prefix("/")
    await typeInto(
      tui,
      "terminal-command-input",
      `node -e "console.log('API shell ready'); setTimeout(()=>{},30000)"`,
    )
    await pressKey(tui, "enter")
    await settle(tui, () => tui.captureCharFrame().includes("API shell ready"))
    frames.push(snapshot(tui, "Pastas organizam as seções abertas"))
    await prefix("v")
    await settle(
      tui,
      () =>
        (tui.renderer.root.findDescendantById("terminal-panes")?.getChildren().length ?? 0) === 2,
    )
    frames.push(snapshot(tui, "[Ctrl+B] [V] · dois terminais por seção"))
    await pressKey(tui, "b", { ctrl: true })
    frames.push(
      snapshot(tui, "Master Key · ações na parte inferior · [Esc] cancela", undefined, 220),
    )
    await pressKey(tui, "escape")
    await prefix("/")
    await typeInto(tui, "terminal-command-input", `node "${agentPath}"`)
    await pressKey(tui, "enter")
    await prefix("e")
    await typeInto(tui, "terminal-command-input", "API review", true)
    await pressKey(tui, "enter")
    await prefix("v")
    await prefix("/")
    await typeInto(tui, "terminal-command-input", `node "${reviewerPath}"`)
    await pressKey(tui, "enter")
    await prefix("e")
    await typeInto(tui, "terminal-command-input", "Tests review", true)
    await pressKey(tui, "enter")
    await prefix("a")
    await prefix("1")
    await settle(
      tui,
      () =>
        tui.captureCharFrame().includes("Lendo") && tui.captureCharFrame().includes("Aguardando"),
      400,
    )
    frames.push(
      snapshot(
        tui,
        "Agentes simulados · atividade e pedidos de atenção sempre visíveis",
        undefined,
        260,
      ),
    )
    return frames
  } finally {
    destroy(tui)
    await stopAllFreeTerminalProcesses()
  }
}

async function terminalFrames() {
  const frames = await nativeTerminalFrames()
  if (process.platform === "win32") return frames
  const restore = prepareTerminalMirrorDemo(CAPTURE_ROOT)
  let tui: TestRendererSetup | undefined
  try {
    tui = await testRender(createElement(FreeTerminal, { active: true }), {
      width: TERMINAL_COLUMNS,
      height: TERMINAL_ROWS,
    })
    const capture = tui
    await settle(capture, () => capture.captureCharFrame().includes("Lendo"), 400)
    frames.push(
      snapshot(
        capture,
        "Agente já aberto no tmux · espelho automático com a tela existente",
        undefined,
        260,
      ),
    )
    return frames
  } finally {
    if (tui) destroy(tui)
    await stopAllFreeTerminalProcesses()
    restore()
  }
}

function frameSvg(frame: DemoFrame, title: string, index: number, count: number) {
  const terminalWidth = frame.capture.cols * CELL_WIDTH
  const terminalHeight = frame.capture.rows * CELL_HEIGHT
  const width = terminalWidth + OUTER_PADDING * 2
  const height = TITLE_HEIGHT + terminalHeight + FOOTER_HEIGHT + OUTER_PADDING
  const terminalX = OUTER_PADDING
  const terminalY = TITLE_HEIGHT
  const chunks: string[] = []

  chunks.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  chunks.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  )
  chunks.push(`<defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`)
  chunks.push(`<rect width="100%" height="100%" rx="15" fill="#090c14"/>`)
  chunks.push(
    `<rect x="${OUTER_PADDING}" y="10" width="${terminalWidth}" height="${terminalHeight + TITLE_HEIGHT + FOOTER_HEIGHT - 10}" rx="10" fill="#10131e" stroke="#2d3348" filter="url(#shadow)"/>`,
  )
  chunks.push(`<circle cx="30" cy="22" r="5" fill="#ff6b6b"/>`)
  chunks.push(`<circle cx="47" cy="22" r="5" fill="#f7c873"/>`)
  chunks.push(`<circle cx="64" cy="22" r="5" fill="#72d5a3"/>`)
  chunks.push(
    `<text x="${width / 2}" y="26" text-anchor="middle" fill="#8f9bb3" font-family="Menlo, Monaco, monospace" font-size="11" font-weight="600">TUIMINAL · ${xml(title.toUpperCase())}</text>`,
  )
  chunks.push(
    `<rect x="${terminalX}" y="${terminalY}" width="${terminalWidth}" height="${terminalHeight}" fill="#0c0f18"/>`,
  )

  for (const [lineIndex, line] of frame.capture.lines.entries()) {
    let column = 0
    const textRuns: string[] = []
    for (const span of line.spans) {
      const spanWidth = span.width * CELL_WIDTH
      const background = rgbaToHex(span.bg, "#0c0f18")
      const foreground = rgbaToHex(span.fg, "#c8cfdd")
      const x = terminalX + column * CELL_WIDTH
      const y = terminalY + lineIndex * CELL_HEIGHT
      chunks.push(
        `<rect x="${x}" y="${y}" width="${spanWidth + 0.2}" height="${CELL_HEIGHT}" fill="${background}"/>`,
      )
      for (const run of demoTextRuns(span.text)) {
        textRuns.push(
          `<text x="${x + run.column * CELL_WIDTH}" y="${y + 12.4}" fill="${foreground}" font-family="Menlo, Monaco, monospace" font-size="${FONT_SIZE}" textLength="${run.width * CELL_WIDTH}" lengthAdjust="spacingAndGlyphs">${xml(run.text)}</text>`,
        )
      }
      column += span.width
    }
    // Paint backgrounds first so a neighboring span cannot erase a glyph edge.
    chunks.push(...textRuns)
  }

  if (frame.focus) {
    const x = terminalX + frame.focus.x * CELL_WIDTH
    const y = terminalY + frame.focus.y * CELL_HEIGHT
    const targetWidth = frame.focus.width * CELL_WIDTH
    const targetHeight = frame.focus.height * CELL_HEIGHT
    chunks.push(
      `<rect x="${x + 1}" y="${y + 1}" width="${Math.max(2, targetWidth - 2)}" height="${Math.max(2, targetHeight - 2)}" rx="4" fill="#4b75ff" fill-opacity="0.07" stroke="#4b75ff" stroke-width="2" filter="url(#glow)"/>`,
    )
  }

  const footerY = terminalY + terminalHeight
  chunks.push(
    `<rect x="${terminalX}" y="${footerY}" width="${terminalWidth}" height="${FOOTER_HEIGHT}" fill="#151927"/>`,
  )
  chunks.push(
    `<text x="${terminalX + 14}" y="${footerY + 23}" fill="#eef2ff" font-family="Menlo, Monaco, monospace" font-size="12.5" font-weight="600">${xml(frame.caption)}</text>`,
  )
  const dots = Math.min(count, 8)
  const activeDot = Math.min(dots - 1, Math.floor((index / count) * dots))
  for (let dot = 0; dot < dots; dot += 1) {
    chunks.push(
      `<circle cx="${terminalX + terminalWidth - 18 - (dots - dot - 1) * 12}" cy="${footerY + 18}" r="${dot === activeDot ? 4 : 2.5}" fill="${dot === activeDot ? "#4b75ff" : "#4a5268"}"/>`,
    )
  }
  chunks.push(`</svg>`)
  return chunks.join("\n")
}

function commandExists(command: string) {
  try {
    execFileSync("which", [command], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function renderGif(name: string, title: string, frames: DemoFrame[]) {
  if (!commandExists("magick")) {
    throw new Error("ImageMagick é necessário para gerar os GIFs (`brew install imagemagick`).")
  }
  const frameRoot = join(CAPTURE_ROOT, name)
  mkdirSync(frameRoot, { recursive: true })
  const pngs: string[] = []
  for (const [index, frame] of frames.entries()) {
    const base = `${index.toString().padStart(2, "0")}`
    const svgPath = join(frameRoot, `${base}.svg`)
    const pngPath = join(frameRoot, `${base}.png`)
    writeFileSync(svgPath, frameSvg(frame, title, index, frames.length))
    execFileSync("magick", ["-background", "none", svgPath, pngPath])
    pngs.push(pngPath)
  }

  const output = join(OUTPUT_ROOT, `${name}.gif`)
  const animationArguments = pngs.flatMap((png, index) => [
    "-delay",
    String(frames[index]?.delay ?? 130),
    png,
  ])
  execFileSync("magick", [
    ...animationArguments,
    "-loop",
    "0",
    "-layers",
    "Optimize",
    "-colors",
    "128",
    output,
  ])
  process.stdout.write(`✓ ${output}\n`)
}

try {
  mkdirSync(OUTPUT_ROOT, { recursive: true })
  const demos = [
    ["installation", "Ferramentas oficiais", installationFrames],
    ["database", "Banco", databaseFrames],
    ["git", "Git", gitFrames],
    ["runner", "Runner", runnerFrames],
    ["http", "HTTP", httpFrames],
    ["terminal", "Free Terminal", terminalFrames],
  ] as const
  const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice(7)
  if (only && !demos.some(([id]) => id === only)) throw new Error(`Unknown demo: ${only}`)
  for (const [id, title, capture] of demos) {
    if (!only || only === id) renderGif(id, title, await capture())
  }
} finally {
  await stopAllRunnerProcesses()
  await stopAllFreeTerminalProcesses()
  rmSync(CAPTURE_ROOT, { recursive: true, force: true })
}
