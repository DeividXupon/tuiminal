import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { SensitiveTermsModal } from "../../apps/cli/src/ui/SensitiveTermsModal"
import { InlineButton } from "../../packages/core/src/ui/InlineButton"
import { ModalSurface } from "../../packages/core/src/ui/ModalSurface"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test("shared modal surface centers its dialog and keeps backdrop and actions separate", async () => {
  let closes = 0
  let confirms = 0
  tui = await testRender(
    <ModalSurface
      id="shared-modal-test"
      width={32}
      height={7}
      zIndex={970}
      borderColor="#ff5555"
      onBackdropPress={() => {
        closes += 1
      }}
    >
      <text content="TEST DIALOG" />
      <InlineButton
        id="shared-modal-confirm"
        label="[Y] Confirm"
        onPress={() => {
          confirms += 1
        }}
      />
    </ModalSurface>,
    { width: 80, height: 25 },
  )
  await tui.renderOnce()
  const dialog = tui.renderer.root.findDescendantById("shared-modal-test")
  const backdrop = tui.renderer.root.findDescendantById("shared-modal-test-backdrop")
  const confirm = tui.renderer.root.findDescendantById("shared-modal-confirm")
  expect(dialog).toBeDefined()
  expect(backdrop).toBeDefined()
  expect(dialog?.width).toBe(32)
  expect(dialog?.height).toBe(7)
  expect(dialog?.screenX).toBe(24)
  expect(confirm).toBeDefined()
  if (!confirm) throw new Error("Confirm button was not rendered")
  await act(async () => {
    await tui?.mockMouse.click(confirm.screenX + 1, confirm.screenY)
  })
  expect(confirms).toBe(1)
  expect(closes).toBe(0)
  await act(async () => {
    await tui?.mockMouse.click(0, 0)
  })
  expect(closes).toBe(1)
  expect(confirms).toBe(1)
})

test("shared surface can retain an outer-layer focus owner", async () => {
  let closes = 0
  tui = await testRender(
    <ModalSurface
      id="layer-owned-dialog"
      layerId="layer-owned-modal"
      layerFocusable
      dialogFocusable={false}
      width={34}
      height={8}
      zIndex={930}
      borderColor="#ff5555"
      onBackdropPress={() => {
        closes += 1
      }}
    >
      <text content="FOCUSED LAYER" />
    </ModalSurface>,
    { width: 80, height: 25 },
  )
  await tui.renderOnce()
  const layer = tui.renderer.root.findDescendantById("layer-owned-modal")
  const dialog = tui.renderer.root.findDescendantById("layer-owned-dialog")
  if (!layer || !dialog) throw new Error("Layer-owned dialog did not mount")
  act(() => layer.focus())
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("layer-owned-modal")
  await act(async () => tui?.mockMouse.click(dialog.screenX + 2, dialog.screenY + 1))
  expect(closes).toBe(0)
  await act(async () => tui?.mockMouse.click(0, 0))
  expect(closes).toBe(1)
})

test("sensitive terms keeps its outer focus layer and closes from outside", async () => {
  let closes = 0
  tui = await testRender(
    <SensitiveTermsModal
      open
      terms={["password"]}
      onClose={() => {
        closes += 1
      }}
      onSave={() => undefined}
    />,
    { width: 90, height: 24 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const layer = tui.renderer.root.findDescendantById("database-sensitive-terms-modal")
  const editor = tui.renderer.root.findDescendantById("database-sensitive-terms-editor")
  expect(layer).toBeDefined()
  if (!editor) throw new Error("Sensitive terms editor did not mount")
  await act(async () => tui?.mockMouse.click(editor.screenX + 2, editor.screenY))
  expect(closes).toBe(0)
  await act(async () => tui?.mockMouse.click(0, 0))
  expect(closes).toBe(1)
})
