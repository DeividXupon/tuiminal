import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { DatabaseBatchExportModal } from "../../packages/feature-database/src/ui/DatabaseBatchExportModal"
import { serializeDatabaseBatchRows } from "../../packages/feature-database/src/model/batch"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})

test("batch export preview preserves raw column names and values in another UI language", async () => {
  updateUiSettings({ language: "en" })
  tui = await testRender(
    <DatabaseBatchExportModal
      open
      tableName="fixture"
      columns={["Dados"]}
      rows={[{ id: "1", rowKey: null, data: { Dados: "Nenhum processo ativo." } }]}
      onClose={() => undefined}
    />,
    { width: 80, height: 24 },
  )
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("Dados")
  expect(tui.captureCharFrame()).toContain("Nenhum processo ativo.")
})

test("opening a large export reads only preview rows, while copy keeps the complete content", async () => {
  let reads = 0
  const rows = Array.from({ length: 2000 }, (_, index) => ({
    id: String(index),
    rowKey: null,
    data: {
      get value() {
        reads += 1
        return `row-${index}`
      },
    },
  }))
  tui = await testRender(
    <DatabaseBatchExportModal
      open
      tableName="fixture"
      columns={["value"]}
      rows={rows}
      onClose={() => undefined}
    />,
    { width: 80, height: 24 },
  )
  await tui.renderOnce()
  expect(reads).toBeLessThan(40)
  const copy = spyOn(tui.renderer, "copyToClipboardOSC52").mockReturnValue(true)
  try {
    await act(async () => tui?.mockInput.pressKey("c"))
    await tui.renderOnce()
    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy.mock.calls[0]?.[0]).toBe(serializeDatabaseBatchRows(rows, ["value"], "csv"))
    for (const [key, format] of [
      ["2", "tsv"],
      ["3", "json"],
    ] as const) {
      await act(async () => tui?.mockInput.pressKey(key))
      await act(async () => tui?.mockInput.pressKey("c"))
      expect(copy.mock.calls.at(-1)?.[0]).toBe(serializeDatabaseBatchRows(rows, ["value"], format))
    }
  } finally {
    copy.mockRestore()
  }
})
