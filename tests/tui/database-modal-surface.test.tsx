import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { DatabaseCellEditor } from "../../packages/feature-database/src/ui/DatabaseCellEditor"
import { DatabaseChangesModal } from "../../packages/feature-database/src/ui/DatabaseChangesModal"
import { DatabaseConnectionModal } from "../../packages/feature-database/src/ui/DatabaseConnectionModal"
import { DatabaseQueryFavoritesModal } from "../../packages/feature-database/src/ui/DatabaseQueryFavoritesModal"
import { DatabaseTableSearchModal } from "../../packages/feature-database/src/ui/DatabaseTableSearchModal"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test("database search keeps its input focus stack and closes from the shared backdrop", async () => {
  let closes = 0
  tui = await testRender(
    <DatabaseTableSearchModal
      open
      table={{ schema: "main", name: "items", type: "table" }}
      initialValue=""
      onApply={() => undefined}
      onClose={() => {
        closes += 1
      }}
    />,
    { width: 90, height: 24 },
  )
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    if (tui.renderer.currentFocusedRenderable?.id === "database-table-search-value") break
  }
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("database-table-search-value")
  act(() => tui?.mockInput.pressEscape())
  await act(async () => Bun.sleep(60))
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("database-table-search-modal")
  expect(closes).toBe(0)
  await act(async () => {
    await tui?.mockMouse.click(0, 0)
  })
  expect(closes).toBe(1)
})

test("saved-query dialog keeps clicks inside and closes from the shared backdrop", async () => {
  let closes = 0
  tui = await testRender(
    <DatabaseQueryFavoritesModal
      mode="save"
      connectionName="fixture"
      availableWidth={90}
      queries={[]}
      defaultName="Example"
      sql="SELECT 1"
      onClose={() => {
        closes += 1
      }}
      onSave={() => undefined}
      onLoad={() => undefined}
      onDelete={() => undefined}
    />,
    { width: 90, height: 24 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const input = tui.renderer.root.findDescendantById("database-saved-query-name")
  if (!input) throw new Error("Saved-query name input did not mount")
  await act(async () => tui?.mockMouse.click(input.screenX + 2, input.screenY))
  expect(closes).toBe(0)
  await act(async () => tui?.mockMouse.click(0, 0))
  expect(closes).toBe(1)
})

test.each([false, true])("write review honors busy=%s on backdrop clicks", async (busy) => {
  let closes = 0
  tui = await testRender(
    <DatabaseChangesModal
      open
      items={[
        {
          id: "fixture",
          kind: "update",
          tableName: "main.items",
          sql: "UPDATE items SET title = ?",
          parameters: ["test"],
          approved: false,
          description: "fixture edit",
        },
      ]}
      busy={busy}
      notice=""
      onClose={() => {
        closes += 1
      }}
      onToggle={() => undefined}
      onToggleAll={() => undefined}
      onExecute={() => undefined}
    />,
    { width: 100, height: 28 },
  )
  await tui.renderOnce()
  const dialog = tui.renderer.root.findDescendantById("database-changes-modal")
  if (!dialog) throw new Error("Write review did not mount")
  await act(async () => tui?.mockMouse.click(dialog.screenX + 2, dialog.screenY + 1))
  expect(closes).toBe(0)
  await act(async () => tui?.mockMouse.click(0, 0))
  expect(closes).toBe(busy ? 0 : 1)
})

test("cell editor preserves input focus and outside-click dismissal", async () => {
  let closes = 0
  tui = await testRender(
    <DatabaseCellEditor
      open
      tableName="main.items"
      column={{ field: "title", type: "TEXT", nullable: false, key: "", defaultValue: null }}
      value="fixture"
      isNewRow={false}
      onClose={() => {
        closes += 1
      }}
      onApply={() => undefined}
    />,
    { width: 90, height: 24 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const input = tui.renderer.root.findDescendantById("database-cell-editor-value")
  if (!input) throw new Error("Cell editor input did not mount")
  await act(async () => tui?.mockMouse.click(input.screenX + 2, input.screenY))
  expect(closes).toBe(0)
  await act(async () => tui?.mockMouse.click(0, 0))
  expect(closes).toBe(1)
})

test("connection form preserves input focus and outside-click dismissal", async () => {
  let closes = 0
  tui = await testRender(
    <DatabaseConnectionModal
      open
      connections={[]}
      selectedConnectionId={null}
      startInForm
      onClose={() => {
        closes += 1
      }}
      onSelect={() => undefined}
      onCreated={() => undefined}
      onDeleted={() => undefined}
    />,
    { width: 100, height: 30 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const input = tui.renderer.root.findDescendantById("db-connection-name")
  if (!input) throw new Error("Connection name input did not mount")
  await act(async () => tui?.mockMouse.click(input.screenX + 2, input.screenY))
  expect(closes).toBe(0)
  await act(async () => tui?.mockMouse.click(0, 0))
  expect(closes).toBe(1)
})
