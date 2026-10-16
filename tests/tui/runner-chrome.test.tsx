import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { activeProcesses } from "../../packages/feature-runner/src/services/process-registry"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { LANGUAGE_OPTIONS, translateUi } from "../../packages/core/src/i18n/index"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import * as service from "../../packages/feature-runner/src/services/runner"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

function renderedRunner() {
  if (!tui) throw new Error("Runner has not been rendered")
  return tui
}

async function settle(until: () => boolean) {
  const view = renderedRunner()
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await view.renderOnce()
    if (until()) return
  }
  throw new Error(`Runner did not settle:\n${view.captureCharFrame()}`)
}

function node(id: string) {
  const view = renderedRunner()
  const found = view.renderer.root.findDescendantById(id)
  if (!found) throw new Error(`Missing ${id}\n${view.captureCharFrame()}`)
  return found
}

async function click(id: string) {
  const view = renderedRunner()
  const target = node(id)
  await act(async () => view.mockMouse.click(target.screenX + 1, target.screenY))
  await view.renderOnce()
}

async function key(name: string, ctrl = false) {
  const view = renderedRunner()
  act(() => view.mockInput.pressKey(name, { ctrl }))
  await act(async () => Bun.sleep(name === "ESCAPE" ? 65 : 10))
  await view.renderOnce()
}

const footerIds = [
  "runner-footer-log",
  "runner-footer-open",
  "runner-footer-multi",
  "runner-footer-history",
  "runner-footer-environment",
  "runner-footer-remove",
  "runner-configuration",
  "runner-footer-copy",
  "runner-footer-export",
  "runner-footer-clear",
  "runner-action-palette-open",
]

const logFooterIds = [
  "runner-footer-list",
  "runner-footer-scroll",
  "runner-footer-filter",
  "runner-footer-stream",
  "runner-footer-timestamps",
  "runner-footer-copy",
  "runner-footer-export",
  "runner-footer-clear",
  "runner-footer-multi",
  "runner-footer-history",
  "runner-action-palette-open",
]

function expectFooterItems(footerId: string, ids: string[]) {
  const footer = node(footerId)
  const buttons = ids.map(node)
  for (const button of buttons) {
    expect(button.screenX).toBeGreaterThanOrEqual(footer.screenX)
    expect(button.screenX + button.width).toBeLessThanOrEqual(footer.screenX + footer.width)
    expect(button.screenY).toBeGreaterThanOrEqual(footer.screenY)
    expect(button.screenY + button.height).toBeLessThanOrEqual(footer.screenY + footer.height)
  }
  for (const [index, button] of buttons.entries()) {
    for (const other of buttons.slice(index + 1)) {
      if (button.screenY === other.screenY) {
        expect(button.screenX + button.width).toBeLessThanOrEqual(other.screenX)
      }
    }
  }
}

test.each(LANGUAGE_OPTIONS.map(({ id }) => id))(
  "Runner keeps all footer actions and the centered new-tab action visible in %s",
  async (language) => {
    updateUiSettings({ language, layout: "framed" })
    tui = await testRender(<Runner active />, { width: 140, height: 36 })
    const view = tui
    await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
    for (const [width, height, layout] of [
      [140, 36, "framed"],
      [100, 30, "framed"],
      [60, 24, "framed"],
      [60, 24, "compact"],
      [140, 36, "compact"],
    ] as const) {
      await act(async () => {
        updateUiSettings({ layout })
        view.resize(width, height)
      })
      await view.renderOnce()
      const footer = node("runner-command-footer")
      const panel = node("runner-command-panel")
      expect(footer.height).toBeGreaterThanOrEqual(width <= 60 ? 2 : 1)
      expect(panel.screenY + panel.height).toBeLessThanOrEqual(footer.screenY)
      expect(footer.screenY + footer.height).toBeLessThanOrEqual(height)
      expectFooterItems("runner-command-footer", footerIds)
      const header = node("runner-header")
      const tabs = node("runner-project-tabs")
      const newTab = node("runner-project-new")
      const summary = node("runner-project-summary")
      expect(newTab.screenX).toBeGreaterThanOrEqual(tabs.screenX + tabs.width)
      expect(newTab.screenX + newTab.width).toBeLessThanOrEqual(summary.screenX)
      expect(newTab.screenY).toBeGreaterThanOrEqual(header.screenY)
      expect(newTab.screenX + newTab.width).toBeLessThanOrEqual(width)
      expect(view.captureCharFrame()).toContain(translateUi("[N] Nova aba", language))
      expect(view.captureCharFrame()).toContain(translateUi("[Del] Remover salvo", language))
      expect(view.captureCharFrame()).toContain(translateUi("[?] Ações", language))
      expect(view.captureCharFrame()).not.toContain("[R]")
      const input = node("runner-command-input")
      const shortcut = node("runner-command-input-shortcut")
      expect(shortcut.screenY).toBe(input.screenY)
      expect(shortcut.screenX + shortcut.width).toBeLessThanOrEqual(input.screenX)
      expect(input.width).toBeGreaterThan(0)
      expect(input.screenX + input.width).toBeLessThan(panel.screenX + panel.width)
      const footerText = view.captureCharFrame().split("\n").slice(footer.screenY).join("\n")
      expect(footerText).not.toContain("[/]")
      expect(footerText).not.toContain("[N]")
      expect(footerText).not.toContain("[D]")
      expect(footerText).not.toContain("[P]")
      await key("l")
      await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-log-scroll")
      const logFooter = node("runner-log-footer")
      expect(logFooter.screenY + logFooter.height).toBeLessThanOrEqual(height)
      const logPanel = node("runner-log-scroll")
      expect(logPanel.screenY + logPanel.height).toBeLessThanOrEqual(logFooter.screenY)
      expectFooterItems("runner-log-footer", logFooterIds)
      expect(view.captureCharFrame()).toContain(translateUi("[T] Horários", language))
      await key("h")
      await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
    }
  },
)

test.each([60, 140])(
  "Runner header and footer actions respond to clicks at %i columns",
  async (width) => {
    const discovery = spyOn(service, "resolveRunnerProjectContext")
    try {
      updateUiSettings({ language: "pt-BR", layout: "framed" })
      tui = await testRender(<Runner active />, { width, height: 36, kittyKeyboard: true })
      const view = tui
      const commandFocused = () =>
        view.renderer.currentFocusedRenderable?.id === "runner-command-list"
      await settle(commandFocused)

      await click("runner-command-input-shortcut")
      await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-command-input")
      await act(async () => view.mockInput.typeText("echo r/"))
      expect(node("runner-command-input")).toHaveProperty("value", "echo r/")
      await key("ESCAPE")
      await settle(commandFocused)
      await key("/")
      await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-command-input")
      expect(node("runner-command-input")).toHaveProperty("value", "echo r/")
      await key("ESCAPE")
      await settle(commandFocused)

      await click("runner-project-new")
      await settle(() => Boolean(view.renderer.root.findDescendantById("runner-project-list")))
      expect(view.captureCharFrame()).toContain("PROJETOS")
      await key("ESCAPE")
      await settle(commandFocused)

      await click("runner-footer-multi")
      await settle(() => view.captureCharFrame().includes("[Shift+M] Único"))
      await key("m", true)
      await settle(commandFocused)

      await click("runner-footer-history")
      await settle(
        () => view.renderer.currentFocusedRenderable?.id.startsWith("runner-history-") ?? false,
      )
      expect(node("runner-history-panel").height).toBeGreaterThan(0)
      await key("s")
      await key("h")
      await settle(commandFocused)

      const previousScans = discovery.mock.calls.length
      await click("runner-scan")
      await settle(() => discovery.mock.calls.length > previousScans && commandFocused())
      await key("n")
      await settle(() => Boolean(view.renderer.root.findDescendantById("runner-project-list")))
      await key("ESCAPE")
      await settle(commandFocused)

      await click("runner-action-palette-open")
      await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-action-palette")
      await key("ESCAPE")
      await settle(commandFocused)
    } finally {
      discovery.mockRestore()
    }
  },
)

test("expanded log footer filters, copies, exports and clears an isolated execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "runner-footer-"))
  const before = new Set(activeProcesses)
  const owned = () => [...activeProcesses].filter((handle) => !before.has(handle))
  const discovery = spyOn(service, "resolveRunnerProjectContext").mockResolvedValue({
    root,
    flows: [],
    environmentProfiles: [],
    commands: [
      {
        ...service.createShellRunnerCommand("footer fixture", { id: "footer-fixture" }),
        program: process.execPath,
        args: ["-e", 'console.log("footer-output"); console.error("footer-error")'],
        workingDirectory: root,
      },
    ],
  })
  try {
    updateUiSettings({ language: "pt-BR", layout: "framed" })
    tui = await testRender(<Runner active />, { width: 80, height: 30 })
    const view = tui
    await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
    for (const id of ["runner-footer-copy", "runner-footer-export", "runner-footer-clear"]) {
      expect(node(id)).toHaveProperty("disabled", true)
    }
    await key("RETURN")
    await settle(() => view.captureCharFrame().includes("footer-output") && owned().length === 0)
    await click("runner-footer-log")
    await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-log-scroll")
    await click("runner-footer-filter")
    await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-log-filter")
    await act(async () => view.mockInput.typeText("footer-error"))
    await settle(() => !view.captureCharFrame().includes("footer-output"))
    expect(view.captureCharFrame()).toContain("footer-error")
    await key("ESCAPE")
    await key("l")
    await click("runner-footer-stream")
    expect(view.captureCharFrame()).not.toContain("footer-error")
    await key("v")
    await settle(() => view.captureCharFrame().includes("footer-error"))
    await click("runner-footer-timestamps")
    expect(view.captureCharFrame()).toMatch(/\d{2}:\d{2}:\d{2}/)
    await key("t")
    expect(view.captureCharFrame()).not.toMatch(/\d{2}:\d{2}:\d{2}/)
    const copy = spyOn(view.renderer, "copyToClipboardOSC52").mockReturnValue(true)
    try {
      await click("runner-footer-copy")
      expect(copy.mock.calls[0]?.[0]).toContain("footer-output")
      await click("runner-footer-list")
      await settle(() => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
      await click("runner-footer-copy")
      expect(copy).toHaveBeenCalledTimes(2)
      await click("runner-footer-export")
      const exports = readdirSync(join(root, "tuiminal-logs"))
      expect(exports).toHaveLength(1)
      const exportedFile = exports[0]
      if (!exportedFile) throw new Error("Missing exported log")
      expect(readFileSync(join(root, "tuiminal-logs", exportedFile), "utf8")).toContain(
        "footer-output",
      )
      await click("runner-footer-log")
      await click("runner-footer-clear")
      await settle(() => !view.captureCharFrame().includes("footer-error"))
      expect(node("runner-footer-copy")).toHaveProperty("disabled", true)
      expect(node("runner-footer-export")).toHaveProperty("disabled", true)
    } finally {
      copy.mockRestore()
    }
  } finally {
    await act(async () => {
      tui?.renderer.destroy()
      tui = undefined
      await Promise.all(owned().map((handle) => handle.stop()))
    })
    discovery.mockRestore()
    rmSync(root, { recursive: true, force: true })
  }
})
