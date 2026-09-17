import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { AppContent } from "../../apps/cli/src/App"
import { withFeatures } from "../../apps/cli/src/features/workspace"
import { FeatureController } from "../../apps/cli/src/features/controller"
import { FeatureStore } from "../../apps/cli/src/features/store"
import type { FeatureId } from "../../apps/cli/src/features/model"
import { featureFixture } from "../fixtures/feature-payload"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { startRunnerProcess } from "../../packages/feature-runner/src/services/process"

let tui: TestRendererSetup | undefined
const cleanup: Array<() => void | Promise<void>> = []
const settings = getUiSettings()
const launch = process.env.TUIMINAL_ONLY_TAB
const initial = process.env.TUIMINAL_INITIAL_TAB

afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  updateUiSettings(settings)
  if (launch === undefined) delete process.env.TUIMINAL_ONLY_TAB
  else process.env.TUIMINAL_ONLY_TAB = launch
  if (initial === undefined) delete process.env.TUIMINAL_INITIAL_TAB
  else process.env.TUIMINAL_INITIAL_TAB = initial
})
async function settle(predicate: (frame: string) => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (predicate(tui!.captureCharFrame())) return
  }
  throw new Error(`Installer did not settle:\n${tui!.captureCharFrame()}`)
}
async function key(name: string, options: { meta?: boolean; ctrl?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, options)
    await Bun.sleep(15)
  })
  await tui?.renderOnce()
}
async function click(id: string) {
  const node = tui?.renderer.root.findDescendantById(id)
  if (!node) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  await act(async () => {
    await tui?.mockMouse.click(node.screenX + 2, node.screenY)
    await Bun.sleep(15)
  })
  await tui?.renderOnce()
}
async function mount(
  width: number,
  height: number,
  layout: "compact" | "framed",
  only?: FeatureId,
) {
  if (only) process.env.TUIMINAL_ONLY_TAB = only
  else delete process.env.TUIMINAL_ONLY_TAB
  process.env.TUIMINAL_INITIAL_TAB = "runner"
  updateUiSettings({ language: "en", layout })
  const root = await mkdtemp(join(tmpdir(), "tuiminal-installer-tui-"))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { catalog, archives } = featureFixture()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new Response(new Uint8Array(archives.get(new URL(request.url).pathname.slice(1))!))
    },
  })
  cleanup.push(() => {
    server.stop(true)
  })
  const store = new FeatureStore(root)
  const controller = new FeatureController({
    source: false,
    environment: async () => ({
      catalog,
      store,
      baseUrl: new URL(`http://127.0.0.1:${server.port}/`),
      allowLocalFiles: false,
    }),
    load: async () => {},
  })
  cleanup.push(() => controller.dispose())
  const Workspace = withFeatures(AppContent, () => controller)
  tui = await testRender(<Workspace />, { width, height, kittyKeyboard: true, exitOnCtrlC: false })
  await settle((frame) => frame.includes("Install official features"))
  return { controller, store, catalog }
}
for (const layout of ["framed", "compact"] as const) {
  test(`empty install, keyboard download, open, settings return and preserved workspace: ${layout}`, async () => {
    const { controller, store, catalog } = await mount(120, 30, layout)
    expect(tui!.renderer.root.findDescendantById("runner-command-list")).toBeUndefined()
    expect(tui!.captureCharFrame()).not.toContain("[Alt+3]")
    await key("RETURN") // Runner is the default requested feature.
    await settle((frame) => frame.includes("[Enter] Open"))
    expect(controller.snapshot().installed).toEqual(["runner"])
    expect(tui!.renderer.root.findDescendantById("feature-installer")).toBeDefined()
    await key("RETURN")
    await settle((frame) => frame.includes("[Alt+3]"))
    for (
      let attempt = 0;
      attempt < 100 && !tui!.renderer.root.findDescendantById("runner-command-list");
      attempt++
    ) {
      await act(async () => Bun.sleep(10))
      await tui!.renderOnce()
    }
    const commands = tui!.renderer.root.findDescendantById("runner-command-list")
    expect(commands).toBeDefined()
    expect(tui!.captureCharFrame()).not.toContain("[Alt+1]")
    await click("tutorial-settings-button")
    for (let i = 0; i < 5; i++) await key("ARROW_DOWN")
    await settle((frame) => frame.includes("Manage features"))
    await click("configuration-open-features")
    expect(tui!.renderer.root.findDescendantById("feature-installer")).toBeDefined()
    expect(tui!.renderer.root.findDescendantById("runner-command-list")).toBe(commands)
    await key("ESCAPE")
    expect(tui!.renderer.root.findDescendantById("feature-installer")).toBeUndefined()
    expect(tui!.renderer.root.findDescendantById("runner-command-list")).toBe(commands)
    await key("2", { meta: true })
    expect(tui!.captureCharFrame()).toContain("Install official features")
    expect(controller.snapshot().installed).toEqual(["runner"])
    await click("feature-remove-runner")
    await settle((frame) => frame.includes("Uninstall feature · Runner"))
    expect(tui!.captureCharFrame()).toContain("Projects and settings will be kept.")
    await key(",")
    expect(tui!.captureCharFrame()).toContain("Uninstall feature · Runner")
    await key("2", { meta: true })
    expect(tui!.captureCharFrame()).toContain("Uninstall feature · Runner")
    await key("c", { ctrl: true })
    expect(tui!.captureCharFrame()).toContain("Uninstall feature · Runner")
    await key("q")
    expect(tui!.captureCharFrame()).toContain("Uninstall feature · Runner")
    await key("ESCAPE")
    expect(tui!.renderer.root.findDescendantById("feature-uninstall-dialog")).toBeUndefined()
    expect(tui!.renderer.root.findDescendantById("feature-installer")).toBeDefined()
    expect(tui!.renderer.root.findDescendantById("runner-command-list")).toBe(commands)
    expect(controller.snapshot().installed).toEqual(["runner"])
    let ready = false
    let exited = false
    const child = startRunnerProcess(
      tmpdir(),
      {
        id: "uninstall-fixture",
        label: "fixture",
        description: "fixture",
        category: "custom",
        program: process.execPath,
        args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
        displayCommand: "fixture",
      },
      {
        onLine: () => {
          ready = true
        },
        onExit: () => {
          exited = true
        },
      },
    )
    cleanup.push(() => child.stop())
    await settle(() => ready)
    const originalRemove = store.remove.bind(store)
    const removal = spyOn(store, "remove").mockImplementation(async (artifact) => {
      expect(tui!.renderer.root.findDescendantById("runner-command-list")).toBeUndefined()
      expect(exited).toBe(true)
      await originalRemove(artifact)
    })
    cleanup.push(() => removal.mockRestore())
    await click("feature-remove-runner")
    await click("feature-uninstall-confirm")
    await settle(() => controller.snapshot().installed.length === 0 && !controller.snapshot().busy)
    expect(removal).toHaveBeenCalledTimes(1)
    removal.mockRestore()
    expect(await store.installed(catalog.artifacts[2]!)).toBe(false)
    expect(tui!.captureCharFrame()).toContain("[Esc] Exit")
    expect(tui!.captureCharFrame()).not.toContain("[Alt+3]")
    expect(tui!.renderer.root.findDescendantById("feature-remove-runner")).toBeUndefined()
    await click("feature-install-runner")
    await settle((frame) => frame.includes("[Enter] Open"))
    expect(await store.installed(catalog.artifacts[2]!)).toBe(true)
    await key("RETURN")
    await settle(() => Boolean(tui!.renderer.root.findDescendantById("runner-command-list")))
    expect(tui!.renderer.root.findDescendantById("runner-command-list")).not.toBe(commands)
  })
}
test("small terminal scrolls to keyboard selection and installs with the mouse", async () => {
  const { controller, store, catalog } = await mount(58, 17, "compact")
  await key("j")
  await key("ARROW_DOWN")
  await settle((frame) => frame.includes("Free Terminal"))
  await click("feature-install-terminal")
  await settle((frame) => frame.includes("[Enter] Open"))
  expect(controller.snapshot().installed).toEqual(["terminal"])
  expect(tui!.captureCharFrame()).toContain("[Esc] Back")
  await key("d")
  await settle((frame) => frame.includes("[Y] Uninstall"))
  expect(tui!.captureCharFrame()).toContain("[Esc] Cancel")
  await key("y")
  await settle(() => controller.snapshot().installed.length === 0)
  expect(await store.installed(catalog.artifacts[4]!)).toBe(false)
  expect(tui!.captureCharFrame()).toContain("[Enter] Install")
})

test("an isolated installer can download siblings but cannot open an unrelated tool", async () => {
  const { FeatureInstaller } = await import("../../apps/cli/src/features/FeatureInstaller")
  const opened: string[] = []
  const installed: string[] = []
  tui = await testRender(
    <FeatureInstaller
      onlyTool="git"
      selected="git"
      blocked={false}
      state={{ ready: true, installed: ["runner"], busy: null, progress: null, error: "" }}
      onUninstall={() => {}}
      onOpen={(id) => opened.push(id)}
      onInstall={(ids) => installed.push(...ids)}
      onClose={() => {}}
      onCancel={() => {}}
      onSettings={() => {}}
    />,
    { width: 100, height: 30 },
  )
  await settle((frame) => frame.includes("Runner"))
  await click("feature-install-runner")
  expect(opened).toEqual([])
  await click("feature-install-http")
  expect(installed).toEqual(["http"])
})

for (const only of [undefined, "runner"] as const) {
  test(`removing the active tool retains installed siblings and respects isolated mode: ${only ?? "all"}`, async () => {
    const { controller } = await mount(120, 30, "compact", only)
    await act(async () => controller.install(["runner", "git"]))
    await key("RETURN")
    await settle(() => Boolean(tui!.renderer.root.findDescendantById("runner-command-list")))
    await click("tutorial-settings-button")
    for (let i = 0; i < 5; i++) await key("ARROW_DOWN")
    await settle((frame) => frame.includes("Manage features"))
    await click("configuration-open-features")
    await settle((frame) => frame.includes("Install official features"))
    await click("feature-remove-runner")
    await key("y")
    await settle(() => controller.snapshot().installed.length === 1 && !controller.snapshot().busy)
    expect(controller.snapshot().installed).toEqual(["git"])
    expect(tui!.renderer.root.findDescendantById("runner-command-list")).toBeUndefined()
    expect(tui!.renderer.root.findDescendantById("feature-installer")).toBeDefined()
    if (only) {
      await click("feature-install-git")
      expect(tui!.renderer.root.findDescendantById("feature-installer")).toBeDefined()
      expect(tui!.renderer.root.findDescendantById("git-base-files-panel")).toBeUndefined()
    } else {
      await key("ESCAPE")
      await settle(() => !tui!.renderer.root.findDescendantById("feature-installer"))
      expect(tui!.captureCharFrame()).toContain("[Alt+2]")
      expect(tui!.captureCharFrame()).not.toContain("[Alt+3]")
    }
  })
}
