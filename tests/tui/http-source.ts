import type { Renderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { act } from "react"

async function clickReady(tui: TestRendererSetup, id: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui.renderOnce()
    })
    const target = tui.renderer.root.findDescendantById(id)
    if (!target?.width || !target.height) continue
    await act(async () => {
      await tui.mockMouse.click(
        target.screenX + Math.floor(target.width / 2),
        target.screenY + Math.floor(target.height / 2),
      )
      await tui.renderOnce()
    })
    return
  }
  throw new Error(`Missing ${id}:\n${tui.captureCharFrame()}`)
}

/** Editor tests enter Local and explicitly create a request through the real controls. */
export async function openLocalHttp(tui: TestRendererSetup) {
  await clickReady(tui, "http-source-local-card")
  if (!tui.renderer.root.findDescendantById("http-url-input"))
    await clickReady(tui, "http-document-new")
}

/** Source selection now opens Postman directly; tests of the chooser open it explicitly. */
export async function openHttpWorkspaceChooser(tui: TestRendererSetup) {
  // Source selection loads the synthetic account asynchronously. Wait for the
  // workspace before sending C; the source picker owns keys until then.
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui.renderOnce()
    })
    if (tui.renderer.root.findDescendantById("http-collection-workspace-heading")) break
  }
  let heading: Renderable | null =
    tui.renderer.root.findDescendantById("http-collection-workspace-heading") ?? null
  while (heading?.visible) heading = heading.parent
  if (heading) await act(async () => tui.mockInput.pressKey("c"))
  await clickReady(tui, "http-collection-workspace-heading")
  await clickReady(tui, "http-collection-actions-workspace:postman")
  await clickReady(tui, "http-collection-menu-select-workspace")
}
