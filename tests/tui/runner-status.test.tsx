import "./setup"
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { RGBA, type SelectRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState, useSyncExternalStore } from "react"
import {
  COLORS,
  getUiSettings,
  subscribeUiTheme,
  updateUiSettings,
} from "../../packages/core/src/settings/theme"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import type { RunnerExecution } from "../../packages/feature-runner/src/model/execution"
import type {
  RunnerCommand,
  RunnerProcessCallbacks,
} from "../../packages/feature-runner/src/model/types"
import * as service from "../../packages/feature-runner/src/services/runner"
import { RUNNER_SETTINGS_PATH } from "../../packages/feature-runner/src/storage/runner-paths"
import { RunnerExecutionStatus } from "../../packages/feature-runner/src/ui/RunnerExecutionStatus"
import { RunnerFlowStatus } from "../../packages/feature-runner/src/ui/RunnerFlowStatus"

let tui: TestRendererSetup | undefined
let root = ""
const initialSettings = getUiSettings()
const settingsPaths = [RUNNER_SETTINGS_PATH, `${RUNNER_SETTINGS_PATH}.bak`]
let snapshots: (Buffer | null)[] = []
const restoreMocks: (() => void)[] = []

beforeEach(() => {
  snapshots = settingsPaths.map((path) => (existsSync(path) ? readFileSync(path) : null))
  updateUiSettings({ language: "pt-BR", colorMode: "dark", palette: "prime", layout: "framed" })
})
afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  for (const restore of restoreMocks.splice(0)) restore()
  for (const [index, path] of settingsPaths.entries()) {
    const snapshot = snapshots[index]
    if (snapshot) writeFileSync(path, snapshot)
    else rmSync(path, { force: true })
  }
  if (root) rmSync(root, { recursive: true, force: true })
  root = ""
  updateUiSettings(initialSettings)
})

function view() {
  if (!tui) throw new Error("Runner not mounted")
  return tui
}
function node(id: string) {
  const found = view().renderer.root.findDescendantById(id)
  if (!found) throw new Error(`Missing ${id}\n${view().captureCharFrame()}`)
  return found
}
async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await view().renderOnce()
    if (until()) return
  }
  throw new Error(`Runner did not settle\n${view().captureCharFrame()}`)
}
async function key(name: string) {
  act(() => view().mockInput.pressKey(name))
  await act(async () => Bun.sleep(name === "ESCAPE" ? 65 : 10))
  await view().renderOnce()
}
function colorAt(id: string, x = 0, y = 0) {
  const target = node(id)
  let column = 0
  for (const span of view().captureSpans().lines[target.screenY + y]?.spans ?? []) {
    column += span.width
    if (column > target.screenX + x) return span.fg.toInts()
  }
  throw new Error(`Missing color at ${id}`)
}
function colorOf(text: string) {
  const span = view()
    .captureSpans()
    .lines.flatMap((line) => line.spans)
    .find((span) => span.text.includes(text))
  if (!span) throw new Error(`Missing ${text}\n${view().captureCharFrame()}`)
  return span.fg.toInts()
}
function textIn(id: string) {
  const target = node(id)
  return view()
    .captureCharFrame()
    .split("\n")
    .slice(target.screenY, target.screenY + target.height)
    .map((line) => line.slice(target.screenX, target.screenX + target.width))
    .join("\n")
}
function commandColor(label: string, marker = false) {
  const row = textIn("runner-command-list")
    .split("\n")
    .findIndex((line) => line.includes(label))
  if (row < 0) throw new Error(`Missing command ${label}`)
  const line = textIn("runner-command-list").split("\n")[row] ?? ""
  return colorAt("runner-command-list", marker ? 3 : line.indexOf(label), row)
}
function ThemedRunner() {
  useSyncExternalStore(subscribeUiTheme, () => JSON.stringify(getUiSettings()))
  return <Runner active />
}
const commands: RunnerCommand[] = Array.from({ length: 24 }, (_, index) => ({
  id: `cmd-${index}`,
  label: `cmd-${index}`,
  description: "fixture",
  category: "custom",
  program: "fixture",
  args: [],
  displayCommand: `fixture ${index}`,
}))
async function mount() {
  root = mkdtempSync(join(tmpdir(), "runner-status-"))
  const roots = [join(root, "first"), join(root, "second")] as const
  for (const path of roots) mkdirSync(path)
  mkdirSync(dirname(RUNNER_SETTINGS_PATH), { recursive: true })
  writeFileSync(
    RUNNER_SETTINGS_PATH,
    JSON.stringify({
      version: 2,
      history: [],
      sessions: {
        [roots[0]]: {
          openedProjects: roots,
          activeProject: roots[0],
          environmentProfiles: {},
          viewMode: "single",
        },
      },
    }),
  )
  const scope = spyOn(service, "resolveRunnerSessionScope").mockReturnValue(roots[0])
  const context = spyOn(service, "resolveRunnerProjectContext").mockImplementation(
    async (root = roots[0]) => ({ root, commands, flows: [], environmentProfiles: [] }),
  )
  const launches: RunnerProcessCallbacks[] = []
  const spawn = spyOn(service, "startRunnerProcess").mockImplementation(
    (_root, _command, callbacks) => {
      launches.push(callbacks)
      return {
        pid: null,
        interactive: false,
        write: () => {},
        stop: async () => callbacks.onExit({ code: null, signal: "SIGTERM", stopped: true }),
      }
    },
  )
  restoreMocks.push(
    () => scope.mockRestore(),
    () => context.mockRestore(),
    () => spawn.mockRestore(),
  )
  tui = await testRender(<ThemedRunner />, { width: 160, height: 36 })
  await settle(() => view().renderer.currentFocusedRenderable?.id === "runner-command-list")
  return launches
}
function finish(launches: RunnerProcessCallbacks[], index: number, code: number) {
  const callbacks = launches[index]
  if (!callbacks) throw new Error(`Missing launch ${index}`)
  act(() => callbacks.onExit({ code, signal: null, stopped: false }))
}

test("Runner retains failed outcomes in commands, tabs and history, and scopes counters to the selected project", async () => {
  const launches = await mount()
  expect(commandColor("cmd-0")).toEqual(RGBA.fromHex("#ffffff").toInts())
  expect(commandColor("cmd-1")).toEqual(RGBA.fromHex("#ffffff").toInts())
  await key(" ")
  await settle(() => launches.length === 1)
  expect(colorAt("runner-command-list", 3)).toEqual(RGBA.fromHex(COLORS.runner).toInts())
  expect(commandColor("cmd-0")).toEqual(RGBA.fromHex("#ffffff").toInts())
  expect(textIn("runner-command-list")).not.toMatch(/RODANDO|CONCLUÍDO|FALHOU|INTERROMPIDO/)
  expect(colorAt("runner-project-status-0")).toEqual(RGBA.fromHex(COLORS.runner).toInts())
  expect(textIn("runner-project-summary")).toContain("1 RODANDO")
  finish(launches, 0, 7)
  await settle(() => textIn("runner-command-list").includes("× cmd-"))
  expect(colorAt("runner-command-list", 3)).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  expect(commandColor("cmd-0")).toEqual(RGBA.fromHex("#ffffff").toInts())
  expect(textIn("runner-command-list")).not.toMatch(/RODANDO|CONCLUÍDO|FALHOU|INTERROMPIDO/)
  expect(colorAt("runner-project-status-0")).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  expect(textIn("runner-project-summary")).toContain("1 FALHA")
  await key("s")
  await settle(() => Boolean(view().renderer.root.findDescendantById("runner-history-list")))
  expect(textIn("runner-history-list")).toContain("SAÍDA 7")
  expect(colorAt("runner-history-list", 3)).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  await key("s")
  await key("h")
  await key("2")
  await settle(() => textIn("runner-project-summary").includes("0 RODANDO"))
  expect(textIn("runner-project-summary")).not.toContain("FALHA")
  expect(colorAt("runner-project-status-0")).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  await key(" ")
  await settle(() => launches.length === 2)
  expect(textIn("runner-project-summary")).toContain("1 RODANDO")
  await key("1")
  await settle(() => textIn("runner-command-list").includes("× cmd-"))
  expect(textIn("runner-project-summary")).toContain("0 RODANDO")
  await key(" ")
  await settle(() => launches.length === 3)
  expect(colorAt("runner-project-status-0")).toEqual(RGBA.fromHex(COLORS.runner).toInts())
  expect(textIn("runner-project-summary")).not.toContain("FALHA")
  finish(launches, 2, 0)
  await settle(() => textIn("runner-command-list").includes("✓ cmd-"))
  expect(colorAt("runner-command-list", 3)).toEqual(RGBA.fromHex(COLORS.success).toInts())
  expect(commandColor("cmd-0")).toEqual(RGBA.fromHex("#ffffff").toInts())
  expect(textIn("runner-command-list")).not.toMatch(/RODANDO|CONCLUÍDO|FALHOU|INTERROMPIDO/)
  expect(colorAt("runner-project-status-0")).toEqual(RGBA.fromHex(COLORS.success).toInts())
  expect(colorAt("runner-project-status-1")).toEqual(RGBA.fromHex(COLORS.runner).toInts())
})

test("native command colors follow scrolling, mouse activation, theme and language without replacing the list", async () => {
  const launches = await mount()
  const list = node("runner-command-list") as SelectRenderable
  for (let index = 0; index < 18; index += 1) await key("ARROW_DOWN")
  expect(list.getSelectedIndex()).toBe(18)
  await key(" ")
  await settle(() => launches.length === 1)
  finish(launches, 0, 2)
  await settle(() => textIn("runner-command-list").includes("× cmd-"))
  expect(commandColor("cmd-18", true)).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  const firstVisible = list.getSelectedIndex() - Math.floor(Math.floor(list.height / 2) / 2)
  await act(async () => view().mockMouse.click(list.screenX + 5, list.screenY))
  await settle(() => list.getSelectedIndex() === firstVisible && launches.length === 2)
  expect(commandColor(`cmd-${firstVisible}`, true)).toEqual(RGBA.fromHex(COLORS.runner).toInts())
  await key(" ")
  await settle(() => textIn("runner-command-list").includes("■ cmd-"))
  expect(commandColor(`cmd-${firstVisible}`)).toEqual(RGBA.fromHex("#ffffff").toInts())
  expect(textIn("runner-command-list")).not.toContain("INTERROMPIDO")
  expect(launches).toHaveLength(2)
  await key("ARROW_UP")
  expect(colorAt("runner-command-list", 3)).toEqual(RGBA.fromHex(COLORS.muted).toInts())
  for (let index = list.getSelectedIndex(); index < 18; index += 1) await key("ARROW_DOWN")
  await act(async () =>
    updateUiSettings({ language: "en", palette: "gruvbox", colorMode: "light" }),
  )
  await settle(() => textIn("runner-command-list").includes("× cmd-"))
  expect(node("runner-command-list")).toBe(list)
  expect(list.getSelectedIndex()).toBe(18)
  expect(view().renderer.currentFocusedRenderable).toBe(list)
  expect(commandColor("cmd-18", true)).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  expect(textIn("runner-command-list")).not.toContain("EXIT 2")
  expect(commandColor("cmd-18")).toEqual(RGBA.fromHex("#ffffff").toInts())
  const tabs = node("runner-project-tabs")
  const add = node("runner-project-new")
  const summary = node("runner-project-summary")
  expect(tabs.screenX + tabs.width).toBeLessThanOrEqual(add.screenX)
  expect(add.screenX + add.width).toBeLessThanOrEqual(summary.screenX)
})

test("process health and flow outcomes have separate native colors", async () => {
  const command = commands[0]
  if (!command) throw new Error("Missing fixture command")
  const execution: RunnerExecution = {
    id: "health",
    commandId: command.id,
    commandKey: command.id,
    command,
    label: command.label,
    displayCommand: command.displayCommand,
    projectRoot: "fixture",
    projectName: "fixture",
    status: "running",
    health: "checking",
    pid: null,
    startedAt: 0,
    endedAt: null,
    exitCode: null,
    logs: [],
    restartAttempt: 0,
  }
  let change = (_health: RunnerExecution["health"]) => {}
  function Harness() {
    const [health, setHealth] = useState(execution.health)
    change = setHealth
    return (
      <box>
        <RunnerExecutionStatus execution={{ ...execution, health }} now={1000} width={100} />
        <RunnerFlowStatus
          commands={[]}
          states={[
            ["build", "success"],
            ["api", "failed"],
            ["web", "blocked"],
          ]}
        />
      </box>
    )
  }
  tui = await testRender(<Harness />, { width: 120, height: 12 })
  await view().renderOnce()
  expect(colorOf("RODANDO")).toEqual(RGBA.fromHex(COLORS.runner).toInts())
  expect(colorOf("VERIFICANDO")).toEqual(RGBA.fromHex(COLORS.warning).toInts())
  expect(colorOf("build")).toEqual(RGBA.fromHex(COLORS.success).toInts())
  expect(colorOf("api")).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  expect(colorOf("web")).toEqual(RGBA.fromHex(COLORS.warning).toInts())
  act(() => change("healthy"))
  await settle(() => view().captureCharFrame().includes("saudável"))
  expect(colorOf("saudável")).toEqual(RGBA.fromHex(COLORS.success).toInts())
  act(() => change("unhealthy"))
  await settle(() => view().captureCharFrame().includes("SEM SAÚDE"))
  expect(colorOf("SEM SAÚDE")).toEqual(RGBA.fromHex(COLORS.danger).toInts())
  expect(colorOf("RODANDO")).toEqual(RGBA.fromHex(COLORS.runner).toInts())
})
