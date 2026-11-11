import "./setup"
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { NotificationProvider } from "../../packages/core/src/notifications/index"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { additionalModalLayoutCases } from "../fixtures/modal-additional-layout"
import { modalLayoutCases } from "../fixtures/modal-layout"

const settings = getUiSettings()
afterEach(() => updateUiSettings(settings))

for (const language of ["en", "pt-BR"] as const) {
  for (const width of [60, 100]) {
    for (const item of [...modalLayoutCases(width, 32), ...additionalModalLayoutCases(width, 32)]) {
      test(`${item.name} stays compact and inside its surface at ${width} columns (${language})`, async () => {
        updateUiSettings({ language })
        const tui = await testRender(<NotificationProvider>{item.view}</NotificationProvider>, {
          width,
          height: 32,
        })
        try {
          await act(async () => {
            await tui.renderOnce()
            await Bun.sleep(0)
          })
          await tui.renderOnce()
          const dialog = tui.renderer.root.findDescendantById(item.id)
          expect(dialog, item.name).toBeDefined()
          if (!dialog) throw new Error(item.name)
          expect(dialog.height, item.name).toBeLessThanOrEqual(item.maxHeight)
          expect(dialog.height, item.name).toBeGreaterThan(2)
          for (const child of dialog.getChildren()) {
            expect(child.screenY, item.name).toBeGreaterThanOrEqual(dialog.screenY + 1)
            expect(child.screenY + child.height, item.name).toBeLessThanOrEqual(
              dialog.screenY + dialog.height - 1,
            )
          }
        } finally {
          act(() => tui.renderer.destroy())
        }
      })
    }
  }
}
