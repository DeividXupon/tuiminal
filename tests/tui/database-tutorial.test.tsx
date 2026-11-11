import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getTutorialSteps, TutorialOverlay } from "../../apps/cli/src/tutorial/TutorialOverlay"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { DatabaseViewer } from "../../packages/feature-database/src/DatabaseWorkspace"
import * as service from "../../packages/feature-database/src/services/database"
import * as external from "../../packages/feature-database/src/services/external-database-connections"
import { DatabaseTutorialDemo } from "../../packages/feature-database/src/tutorial/DatabaseTutorialDemo"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

function element(id: string) {
  const value = tui?.renderer.root.findDescendantById(id)
  if (!value) throw new Error(`Missing ${id}\n${tui?.captureCharFrame()}`)
  return value
}

test.each([
  [180, 40, "framed", "pt-BR"],
  [140, 36, "compact", "en"],
  [100, 30, "framed", "pt-BR"],
  [80, 24, "compact", "ja"],
] as const)(
  "every Database step has a visible result at %ix%i (%s, %s)",
  async (width, height, layout, language) => {
    updateUiSettings({ layout, language })
    let show = (_id: string) => {}
    function Host() {
      const [target, setTarget] = useState<string | null>(null)
      show = setTarget
      return <DatabaseTutorialDemo activeTargetId={target} />
    }
    tui = await testRender(<Host />, { width, height })
    for (const step of getTutorialSteps("database")) {
      await act(async () => show(step.targetId))
      await tui.renderOnce()
      const target = element(step.targetId)
      expect(target.visible, step.targetId).toBe(true)
      expect(target.width, step.targetId).toBeGreaterThan(0)
      expect(target.height, step.targetId).toBeGreaterThan(0)
      expect(target.screenX, step.targetId).toBeGreaterThanOrEqual(0)
      expect(target.screenY, step.targetId).toBeGreaterThanOrEqual(0)
      expect(target.screenX + target.width, step.targetId).toBeLessThanOrEqual(width)
      expect(target.screenY + target.height, step.targetId).toBeLessThanOrEqual(height)
    }
  },
  30_000,
)

test.each(["framed", "compact"] as const)(
  "the %s table uses the real hierarchy and responsive inspector",
  async (layout) => {
    updateUiSettings({ layout, language: "pt-BR" })
    tui = await testRender(<DatabaseTutorialDemo activeTargetId="tutorial-db-table-grid" />, {
      width: 160,
      height: 36,
    })
    await tui.renderOnce()
    const area = element("tutorial-db-grid")
    const header = element("database-table-header")
    const rows = element("tutorial-db-table-grid")
    const inspector = element("tutorial-db-inspector")
    const footer = element("tutorial-db-navigation")
    expect(header.screenY).toBe(area.screenY + (layout === "framed" ? 1 : 0))
    expect(rows.screenY).toBe(header.screenY + 1)
    expect(inspector.screenY).toBe(rows.screenY)
    expect(inspector.screenX).toBeGreaterThan(rows.screenX)
    expect(inspector.screenX + inspector.width).toBeLessThanOrEqual(area.screenX + area.width)
    expect(inspector.screenY + inspector.height).toBe(footer.screenY)
    const frame = tui.captureCharFrame()
    expect(frame).not.toContain("CONSULTA EXECUTADA")
    expect(frame).not.toContain("SELECT *")
    expect(frame).not.toContain("DEMO ·")
    expect(frame).toContain("▾ main")
    expect(frame).not.toContain("public")
    expect(frame).not.toContain("[I]")
  },
)

test("steps switch real views and return to clean table state", async () => {
  updateUiSettings({ language: "pt-BR", layout: "framed" })
  let show = (_id: string) => {}
  function Host() {
    const [target, setTarget] = useState<string | null>(null)
    show = setTarget
    return <DatabaseTutorialDemo activeTargetId={target} />
  }
  tui = await testRender(<Host />, { width: 100, height: 30 })
  async function scene(target: string) {
    await act(async () => show(target))
    await tui?.renderOnce()
    return tui?.captureCharFrame() ?? ""
  }
  expect(await scene("tutorial-db-columns")).toContain("ATRIBUTOS")
  expect(await scene("tutorial-db-indexes")).toContain("UNIQUE")
  expect(await scene("tutorial-db-schema")).toContain("CREATE TABLE users")
  expect(await scene("tutorial-db-query-editor")).toContain("ORDER BY id")
  expect(tui.renderer.root.findDescendantById("database-table-header")).toBeUndefined()
  expect(await scene("tutorial-db-inspector")).toContain("REGISTRO")
  expect(tui.renderer.root.findDescendantById("tutorial-db-table-grid")).toBeUndefined()
  await scene("tutorial-db-selection")
  expect(tui.renderer.root.findDescendantById("database-tutorial-new-row-action")).toBeUndefined()
  expect(element("database-export-selected-rows")).toBeDefined()
  expect(await scene("tutorial-db-new-row")).toContain("107")
  expect(await scene("tutorial-db-edit-cell")).toContain("editor")
  expect(await scene("tutorial-db-review")).toContain("REVISAR ALTERAÇÕES SQL")
  expect(await scene("tutorial-db-table-grid")).toContain("[Ctrl+S]0")
  expect(tui.renderer.root.findDescendantById("tutorial-db-review")).toBeUndefined()
  expect(tui.renderer.root.findDescendantById("database-row-6")).toBeUndefined()
})

test("a tour-only Database mount cannot discover, query or mutate a database", async () => {
  const spies = [
    spyOn(service, "listDatabaseConnections"),
    spyOn(external, "discoverExternalDatabaseConnections"),
    spyOn(service, "listDatabaseTables"),
    spyOn(service, "loadTablePage"),
    spyOn(service, "applyTableMutations"),
    spyOn(service, "addDatabaseConnection"),
  ]
  try {
    let show = (_id: string) => {}
    function Host() {
      const [target, setTarget] = useState<string | null>(null)
      show = setTarget
      return <DatabaseViewer active={false} tutorialMode tutorialTargetId={target} />
    }
    tui = await testRender(<Host />, { width: 140, height: 36 })
    for (const step of getTutorialSteps("database")) {
      await act(async () => show(step.targetId))
      await tui.renderOnce()
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
})

test("opening and closing the tour preserves a live SQL buffer without executing it", async () => {
  updateUiSettings({ language: "pt-BR", layout: "framed" })
  const connections = spyOn(service, "listDatabaseConnections").mockReturnValue([
    {
      id: "tutorial-preservation",
      name: "Preserved workspace",
      driver: "sqlite",
      source: "saved",
      filename: "never-opened.sqlite",
      ssl: false,
      writeEnabled: false,
    },
  ])
  const defaultConnection = spyOn(service, "getDefaultDatabaseConnectionId").mockReturnValue(
    "tutorial-preservation",
  )
  const catalog = spyOn(service, "listDatabaseTables").mockResolvedValue({
    databaseName: "Fixture",
    tables: [],
  })
  const execute = spyOn(service, "executeDatabaseQuery")
  let show = (_open: boolean) => {}
  function Host() {
    const [open, setOpen] = useState(false)
    const [target, setTarget] = useState<string | null>(null)
    show = setOpen
    return (
      <>
        <DatabaseViewer active={!open} tutorialMode={open} tutorialTargetId={target} />
        {open && (
          <TutorialOverlay
            open
            steps={getTutorialSteps("database")}
            onClose={() => setOpen(false)}
            onStepChange={setTarget}
          />
        )}
      </>
    )
  }
  try {
    tui = await testRender(<Host />, { width: 140, height: 36 })
    for (let attempt = 0; attempt < 50 && !tui.captureCharFrame().includes("Fixture"); attempt++) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
    }
    expect(tui.captureCharFrame()).toContain("Fixture")
    await act(async () => tui?.mockInput.pressKey("w"))
    await tui.renderOnce()
    const editor = element("database-query-sql-1-editor")
    expect(editor).toBeInstanceOf(TextareaRenderable)
    const buffer = editor as TextareaRenderable
    await act(async () => buffer.setText("SELECT 'keep my draft';"))
    const reads = catalog.mock.calls.length
    await act(async () => show(true))
    await act(async () => Bun.sleep(200))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("ana@example.test")
    expect(tui.captureCharFrame()).not.toContain("keep my draft")
    const outline = element("tutorial-target-outline")
    expect(outline.width).toBeGreaterThan(0)
    await act(async () => {
      tui?.mockInput.pressEnter()
      await Bun.sleep(320)
    })
    await act(async () => tui?.mockInput.pressKey("ESCAPE"))
    // A lone Esc waits for the terminal's Alt-sequence deadline before dispatch.
    for (
      let attempt = 0;
      attempt < 50 && tui.renderer.root.findDescendantById("tutorial-db-catalog");
      attempt++
    ) {
      await act(async () => Bun.sleep(10))
    }
    await tui.renderOnce()
    expect(element("database-query-sql-1-editor")).toBe(buffer)
    expect(buffer.plainText).toBe("SELECT 'keep my draft';")
    expect(tui.captureCharFrame()).toContain("keep my draft")
    expect(catalog.mock.calls.length).toBe(reads)
    expect(execute).not.toHaveBeenCalled()
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    for (const spy of [connections, defaultConnection, catalog, execute]) spy.mockRestore()
  }
})

test("the tour advances through dialogs and restores the previous scene with Left", async () => {
  const steps = getTutorialSteps("database")
  const seen: string[] = []
  let closed = false
  function Host() {
    const [target, setTarget] = useState<string | null>(null)
    return (
      <>
        <DatabaseTutorialDemo activeTargetId={target} />
        <TutorialOverlay
          open
          steps={steps}
          onClose={() => {
            closed = true
          }}
          onStepChange={(id) => {
            setTarget(id)
            if (id) seen.push(id)
          }}
        />
      </>
    )
  }
  tui = await testRender(<Host />, { width: 140, height: 36 })
  async function key(name: string) {
    await act(async () => {
      if (name === "enter") tui?.mockInput.pressEnter()
      else if (name === "left") tui?.mockInput.pressArrow("left")
      else tui?.mockInput.pressKey("ESCAPE")
      await Bun.sleep(320)
    })
    await tui?.renderOnce()
  }
  await act(async () => Bun.sleep(200))
  for (let index = 1; index < steps.length; index++) {
    await key("enter")
    expect(seen.at(-1)).toBe(steps[index]?.targetId)
    expect(element(steps[index]?.targetId ?? "")).toBeDefined()
  }
  await key("left")
  expect(seen.at(-1)).toBe(steps.at(-2)?.targetId)
  await key("escape")
  expect(closed).toBe(true)
}, 30_000)
