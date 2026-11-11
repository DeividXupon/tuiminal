import "./setup"
import { afterEach, expect, test } from "bun:test"
import { RGBA, type TextRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { COLORS, updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpPostmanModal } from "../../packages/feature-http/src/ui/HttpPostmanModal"

let tui: TestRendererSetup | undefined
const originalFetch = globalThis.fetch
const originalSecrets = Bun.secrets
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  globalThis.fetch = originalFetch
  Object.assign(Bun, { secrets: originalSecrets })
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
for (const layout of ["compact", "framed"] as const) {
  test.each([52, 120])(
    `Postman workspace counts align without covering names or footer in ${layout} at %s`,
    async (width) => {
      updateUiSettings({ layout, language: "pt-BR" })
      Object.assign(Bun, {
        secrets: { get: async () => JSON.stringify({ apiKey: "PMAK-fixture", region: "us" }) },
      })
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname === "/workspaces")
          return Response.json({
            workspaces: [
              { id: "one", name: "Workspace with a very long name [X]", visibility: "team" },
              { id: "empty", name: "Empty" },
              { id: "failed", name: "Unavailable" },
            ],
          })
        if (url.pathname === "/environments") return Response.json({ environments: [] })
        if (url.pathname === "/collections") {
          if (url.searchParams.get("workspace") === "failed")
            return new Response(null, { status: 403 })
          return Response.json({
            collections:
              url.searchParams.get("workspace") === "empty"
                ? []
                : [{ id: "c1", name: "Collection" }],
          })
        }
        if (url.pathname === "/collections/c1")
          return Response.json({
            collection: { item: [{ request: {} }, { item: [{ request: {} }] }] },
          })
        throw new Error(`Unexpected fake API path ${url.pathname}`)
      }) as typeof fetch
      let closed = false
      tui = await testRender(
        <HttpPostmanModal
          terminalWidth={width}
          terminalHeight={18}
          onClose={() => {
            closed = true
          }}
          onWorkspaceSelected={async () => {}}
        />,
        { width, height: 18 },
      )
      await settle(() => tui?.captureCharFrame().includes("Chamadas: —") ?? false)
      const frame = tui.captureCharFrame()
      expect(frame).toContain("Chamadas: 2")
      expect(frame).toContain("Chamadas: 0")
      expect(frame).toContain("[↑/↓] Navegar")
      const positions = ["one", "empty", "failed"].map(
        (id) => tui?.renderer.root.findDescendantById(`http-postman-count-${id}`)?.screenX,
      )
      expect(new Set(positions).size).toBe(1)
      const title = tui.renderer.root.findDescendantById(
        "http-postman-modal-title",
      ) as TextRenderable
      expect(title.bg.equals(RGBA.fromHex(COLORS.panel))).toBe(true)
      await act(async () => {
        tui?.mockInput.pressKey("ESCAPE")
        await Bun.sleep(60)
      })
      expect(closed).toBe(true)
    },
  )
}
