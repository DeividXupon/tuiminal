import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { RemoteProjectSyncReview } from "../../packages/feature-terminal/src/model/remote-project-sync"
import { RemoteProjectSyncDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncDialog"
import { RemoteProjectSyncPreviewDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncPreviewDialog"
import { RemoteProjectSyncProgressDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncProgressDialog"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function expectTransparentBackground(id: string) {
  const renderable = tui?.renderer.root.findDescendantById(id) as BoxRenderable | null | undefined
  if (!renderable) throw new Error(`${id} did not mount`)
  expect(renderable.backgroundColor.toInts()).toEqual([0, 0, 0, 0])
}

test("sync progress keeps focus and cancels with Escape", async () => {
  let cancels = 0
  let automaticToggles = 0
  tui = await testRender(
    <RemoteProjectSyncProgressDialog
      localPath="/local/project-sync"
      status={{
        kind: "syncing",
        localPath: "/local/project-sync",
        phase: "transferring",
        progress: 0.5,
      }}
      automatic={false}
      onToggleAutomatic={() => {
        automaticToggles += 1
      }}
      onCancel={() => {
        cancels += 1
      }}
    />,
    { width: 90, height: 18 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const dialog = tui.renderer.root.findDescendantById("terminal-project-sync-progress")
  if (!dialog) throw new Error("Sync progress did not mount")
  await act(async () => {
    dialog.focus()
    await Bun.sleep(10)
  })
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("terminal-project-sync-progress")
  expect({
    width: dialog.width,
    height: dialog.height,
    x: dialog.screenX,
    y: dialog.screenY,
  }).toEqual({ width: 68, height: 12, x: 11, y: 3 })
  expect(tui.captureCharFrame()).toContain("50%")
  expect(tui.captureCharFrame()).toContain("[A] Sincronização automática OFF")
  expect(tui.captureCharFrame()).toContain("[Esc] Cancelar")
  expectTransparentBackground("terminal-project-sync-progress-header")
  expectTransparentBackground("terminal-project-sync-automatic-control")
  expectTransparentBackground("terminal-project-sync-progress-actions")
  const cancel = tui.renderer.root.findDescendantById("terminal-project-sync-cancel-progress")
  if (!cancel) throw new Error("Sync progress cancel action did not mount")
  expect(cancel.screenX).toBeGreaterThan(dialog.screenX + dialog.width / 2)
  act(() => tui?.mockInput.pressKey("a"))
  expect(automaticToggles).toBe(1)
  act(() => tui?.mockInput.pressEscape())
  await act(async () => Bun.sleep(60))
  await tui.renderOnce()
  expect(cancels).toBe(1)
})

test("sync preview lists actions and uses one explicit destructive confirmation", async () => {
  let confirms = 0
  let closes = 0
  let automaticToggles = 0
  let requestedPage = -1
  const review: RemoteProjectSyncReview = {
    jobId: "fixture",
    localPath: "/local/project-sync",
    changeCount: 203,
    counts: { add: 1, update: 1, delete: 1, conflict: 1 },
    hasLocalChanges: true,
    legacyLocalChanges: false,
    difference: "both",
    indicator: { changeCount: 3, difference: "both" },
    offset: 0,
    pageSize: 200,
    changes: [
      {
        path: "src/new.ts",
        action: "add",
        localChanged: false,
        remoteChanged: true,
        transferBytes: 20,
      },
      {
        path: "src/local.ts",
        action: "update",
        localChanged: true,
        remoteChanged: false,
        transferBytes: 10,
      },
      {
        path: "old.txt",
        action: "delete",
        localChanged: false,
        remoteChanged: true,
        transferBytes: 0,
      },
    ],
  }
  tui = await testRender(
    <RemoteProjectSyncPreviewDialog
      review={review}
      automatic
      onToggleAutomatic={() => {
        automaticToggles += 1
      }}
      onPage={(offset) => {
        requestedPage = offset
      }}
      onConfirm={() => {
        confirms += 1
      }}
      onClose={() => {
        closes += 1
      }}
    />,
    { width: 100, height: 24 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const dialog = tui.renderer.root.findDescendantById("terminal-project-sync-preview")
  if (!dialog) throw new Error("Sync preview did not mount")
  await act(async () => {
    dialog.focus()
    await Bun.sleep(10)
  })
  await tui.renderOnce()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("terminal-project-sync-preview")
  expect({
    width: dialog.width,
    height: dialog.height,
    x: dialog.screenX,
    y: dialog.screenY,
  }).toEqual({ width: 88, height: 20, x: 6, y: 2 })
  const frame = tui.captureCharFrame()
  expect(frame).toContain("ITENS FORA DE SINCRONIA")
  expect(frame).toContain("src/new.ts")
  expect(frame).toContain("Conflito")
  expect(frame).toContain("[A] Sincronização automática ON")
  expect(frame).toContain("O remoto substituirá alterações locais")
  expect(frame).toContain("[Enter] Substituir e sincronizar")
  expectTransparentBackground("terminal-project-sync-preview-header")
  expectTransparentBackground("terminal-project-sync-preview-path")
  expectTransparentBackground("terminal-project-sync-preview-warning")
  expectTransparentBackground("terminal-project-sync-automatic-control")
  expectTransparentBackground("terminal-project-sync-preview-actions")
  const next = tui.renderer.root.findDescendantById("terminal-project-sync-next-page")
  if (!next) throw new Error("Sync preview next-page action did not mount")
  await act(async () => tui?.mockMouse.click(next.screenX + 1, next.screenY))
  expect(requestedPage).toBe(200)
  const confirm = tui.renderer.root.findDescendantById("terminal-project-sync-confirm-changes")
  const cancel = tui.renderer.root.findDescendantById("terminal-project-sync-cancel-changes")
  if (!confirm || !cancel) throw new Error("Sync preview actions did not mount")
  const automatic = tui.renderer.root.findDescendantById("terminal-project-sync-automatic")
  if (!automatic) throw new Error("Automatic sync action did not mount")
  expect(next.screenY).toBeLessThan(automatic.screenY)
  expect(automatic.screenY).toBeLessThan(confirm.screenY)
  expect(cancel.screenY).toBe(confirm.screenY)
  expect(cancel.screenX).toBeGreaterThan(confirm.screenX)
  await act(async () => tui?.mockMouse.click(automatic.screenX + 1, automatic.screenY))
  expect(automaticToggles).toBe(1)
  await act(async () => tui?.mockMouse.click(confirm.screenX + 1, confirm.screenY))
  expect(confirms).toBe(1)
  await act(async () => tui?.mockMouse.click(cancel.screenX + 1, cancel.screenY))
  expect(closes).toBe(1)
})

test("sync confirmation keeps primary and cancel actions separated in a compact modal", async () => {
  let confirms = 0
  let closes = 0
  tui = await testRender(
    <RemoteProjectSyncDialog
      kind="replace"
      localPath="/local/project-sync"
      onConfirm={() => {
        confirms += 1
      }}
      onClose={() => {
        closes += 1
      }}
    />,
    { width: 90, height: 18 },
  )
  await act(async () => Bun.sleep(10))
  await tui.renderOnce()
  const dialog = tui.renderer.root.findDescendantById("terminal-project-sync-confirm")
  const confirm = tui.renderer.root.findDescendantById("terminal-project-sync-confirm-action")
  const cancel = tui.renderer.root.findDescendantById("terminal-project-sync-cancel-confirm")
  if (!dialog || !confirm || !cancel) throw new Error("Sync confirmation did not mount")
  expect({
    width: dialog.width,
    height: dialog.height,
    x: dialog.screenX,
    y: dialog.screenY,
  }).toEqual({ width: 68, height: 10, x: 11, y: 4 })
  expectTransparentBackground("terminal-project-sync-confirm-header")
  expectTransparentBackground("terminal-project-sync-confirm-actions")
  expect(confirm.screenY).toBe(cancel.screenY)
  expect(confirm.screenX).toBeLessThan(cancel.screenX)
  await act(async () => tui?.mockMouse.click(confirm.screenX + 1, confirm.screenY))
  await act(async () => tui?.mockMouse.click(cancel.screenX + 1, cancel.screenY))
  expect({ confirms, closes }).toEqual({ confirms: 1, closes: 1 })
})
