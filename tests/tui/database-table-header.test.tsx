import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import type { DatabaseTable } from "../../packages/feature-database/src/model/types"
import type { DatabaseView } from "../../packages/feature-database/src/model/workspace"
import { DatabaseTableHeader } from "../../packages/feature-database/src/ui/DatabaseTableHeader"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()
const history: DatabaseTable[] = [
  "permissions_groups",
  "phone_token",
  "prepaid_cards",
  "selecao",
  "tokens",
  "transfers_internal",
].map((name) => ({ name, schema: "main", type: "table" }))

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

function element(id: string) {
  const found = tui?.renderer.root.findDescendantById(id)
  if (!found) throw new Error(`Missing ${id}\n${tui?.captureCharFrame()}`)
  return found
}

async function click(id: string) {
  const target = element(id)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}

test.each([33, 59, 101, 181])(
  "view controls and recent tables share a bounded row at %s columns",
  async (width) => {
    updateUiSettings({ language: "pt-BR", layout: "compact" })
    const selectedTable = history.at(-1)
    if (!selectedTable) throw new Error("Missing fixture")
    tui = await testRender(
      <DatabaseTableHeader
        width={width}
        view="data"
        history={history}
        selectedTable={selectedTable}
        onView={() => {}}
        onTable={() => {}}
        onNavigate={() => {}}
      />,
      { width, height: 8 },
    )
    await tui.renderOnce()
    const controls = ["data", "columns", "indexes", "schema"].map((view) =>
      element(`tutorial-db-view-${view}`),
    )
    const recent = element("tutorial-db-table-history")
    const activeTable = element("database-table-history-5")
    for (const control of controls) expect(control.screenY).toBe(recent.screenY)
    const lastControl = element("tutorial-db-view-schema")
    expect(recent.screenX).toBeGreaterThanOrEqual(lastControl.screenX + lastControl.width + 1)
    expect(recent.screenX + recent.width).toBeLessThanOrEqual(width)
    expect(activeTable.screenX + activeTable.width).toBeLessThanOrEqual(width)
    expect(tui.captureCharFrame().split("\n")[recent.screenY]).toContain("─")
    if (width >= 101) expect(tui.captureCharFrame()).toContain("[4] Schema")
  },
)

test("view selection, table clicks and history arrows remain independent", async () => {
  const chosenViews: DatabaseView[] = []
  let chosenTable = 2
  function Harness() {
    const [view, setView] = useState<DatabaseView>("data")
    const [index, setIndex] = useState(2)
    const selectedTable = history[index]
    if (!selectedTable) throw new Error("Missing fixture")
    return (
      <DatabaseTableHeader
        width={181}
        view={view}
        history={history}
        selectedTable={selectedTable}
        onView={(next) => {
          chosenViews.push(next)
          setView(next)
        }}
        onTable={(table) => {
          chosenTable = history.indexOf(table)
          setIndex(chosenTable)
        }}
        onNavigate={(direction) => {
          chosenTable = index + direction
          setIndex(chosenTable)
        }}
      />
    )
  }
  tui = await testRender(<Harness />, { width: 181, height: 8 })
  await tui.renderOnce()
  await click("tutorial-db-view-columns")
  expect(chosenViews.at(-1)).toBe("columns")
  expect(chosenTable).toBe(2)
  await click("database-table-history-previous")
  expect(chosenTable).toBe(1)
  await click("database-table-history-next")
  expect(chosenTable).toBe(2)
  await click("database-table-history-5")
  expect(chosenTable).toBe(5)
  expect(chosenViews.at(-1)).toBe("columns")
})
