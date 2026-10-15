import "./setup"
import { expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import { activeProcesses } from "../../packages/feature-runner/src/services/process-registry"
import * as service from "../../packages/feature-runner/src/services/runner"

async function settle(tui: TestRendererSetup, until: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (until()) return
  }
  throw new Error(`Runner did not settle:\n${tui.captureCharFrame()}`)
}

async function activate(tui: TestRendererSetup, method: string) {
  await act(async () => {
    const list = tui.renderer.root.findDescendantById("runner-command-list")
    if (!list) throw new Error("Missing command list")
    list.focus()
    if (method === "click") await tui.mockMouse.click(list.screenX + 2, list.screenY)
    else tui.mockInput.pressKey(method)
  })
  await tui.renderOnce()
}

test.each(["RETURN", " ", "click"])(
  "%s starts, stops and restarts an owned process from the command list",
  async (method) => {
    const root = mkdtempSync(join(tmpdir(), "runner-toggle-"))
    const before = new Set(activeProcesses)
    const owned = () => [...activeProcesses].filter((handle) => !before.has(handle))
    const discovery = spyOn(service, "resolveRunnerProjectContext").mockResolvedValue({
      root,
      flows: [],
      environmentProfiles: [],
      commands: [
        {
          ...service.createShellRunnerCommand("toggle fixture", { id: "toggle-fixture" }),
          program: process.execPath,
          args: ["-e", 'console.log("toggle-ready"); setInterval(() => {}, 1000)'],
          workingDirectory: root,
        },
      ],
    })
    let tui: TestRendererSetup | undefined
    try {
      tui = await testRender(<Runner active />, { width: 140, height: 36 })
      const view = tui
      await settle(view, () => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await activate(view, method)
        await settle(
          view,
          () => owned().length === 1 && view.captureCharFrame().includes("toggle-ready"),
        )
        const pid = owned()[0]?.pid
        if (!pid) throw new Error("Missing owned process PID")
        expect(pid).toBeGreaterThan(0)
        expect(() => process.kill(pid, 0)).not.toThrow()
        await activate(view, method)
        await settle(
          view,
          () => owned().length === 0 && view.captureCharFrame().includes("INTERROMPIDO"),
        )
        expect(() => process.kill(pid, 0)).toThrow()
      }
    } finally {
      await act(async () => {
        tui?.renderer.destroy()
        await Promise.all(owned().map((handle) => handle.stop()))
      })
      discovery.mockRestore()
      rmSync(root, { recursive: true, force: true })
    }
  },
)

test("activation while stopping neither restarts nor stops the command again", async () => {
  let stops = 0
  const spawn = spyOn(service, "startRunnerProcess").mockImplementation(() => ({
    pid: null,
    interactive: false,
    write: () => {},
    stop: async () => {
      stops += 1
    },
  }))
  let tui: TestRendererSetup | undefined
  try {
    tui = await testRender(<Runner active />, { width: 140, height: 36 })
    const view = tui
    await settle(view, () => view.renderer.currentFocusedRenderable?.id === "runner-command-list")
    await activate(view, "RETURN")
    await settle(view, () => spawn.mock.calls.length === 1)
    await activate(view, " ")
    await settle(view, () => stops === 1)
    for (const method of ["RETURN", " ", "click"]) await activate(view, method)
    expect(stops).toBe(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(view.captureCharFrame()).toContain("ENCERRANDO")
  } finally {
    act(() => tui?.renderer.destroy())
    spawn.mockRestore()
  }
})
