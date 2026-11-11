import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { buildHttpCollectionTree } from "../../packages/feature-http/src/model/collection-tree"
import { createScratchRequest } from "../../packages/feature-http/src/model/workspace"
import { HttpCollectionRow } from "../../packages/feature-http/src/ui/HttpCollectionRow"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test.each([24, 32])("aligns HTTP methods and names in a %i-column collection", async (width) => {
  const methods = ["GET", "POST", "DELETE", "OPTIONS"]
  const items = methods.flatMap((method) =>
    ["Short", "Long request name that exceeds the sidebar"].map((name) => ({
      filePath: "api/requests.http",
      request: { ...createScratchRequest(`${method}-${name}`), method, name },
    })),
  )
  const rows = buildHttpCollectionTree(items)
  tui = await testRender(
    <box width={width}>
      {rows.map((row) => (
        <HttpCollectionRow
          key={row.id}
          row={row}
          contentWidth={width}
          methodWidth={7}
          activeDocumentId=""
          selected={false}
          onPress={() => {}}
        />
      ))}
    </box>,
    { width, height: rows.length + 1 },
  )
  await act(async () => {
    await tui?.renderOnce()
  })
  const lines = tui.captureCharFrame().split("\n")
  for (const [index, item] of items.entries()) {
    const line = lines[index + 2] ?? ""
    expect(line.indexOf(item.request.method)).toBe(5)
    expect(line.indexOf(item.request.name.startsWith("Short") ? "Short" : "Long")).toBe(13)
    expect(line.trimEnd().endsWith("…")).toBe(item.request.name.startsWith("Long"))
  }
})
