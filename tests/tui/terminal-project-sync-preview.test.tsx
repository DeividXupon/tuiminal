import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { RemoteProjectSyncReview } from "../../packages/feature-terminal/src/model/remote-project-sync"
import { RemoteProjectSyncPreviewDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncPreviewDialog"
import { RemoteProjectSyncProgressDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncProgressDialog"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

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
  expect(tui.captureCharFrame()).toContain("50%")
  expect(tui.captureCharFrame()).toContain("[A] Sincronização automática OFF")
  expect(tui.captureCharFrame()).toContain("[Esc] Cancelar")
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
  const frame = tui.captureCharFrame()
  expect(frame).toContain("ITENS FORA DE SINCRONIA")
  expect(frame).toContain("src/new.ts")
  expect(frame).toContain("Conflito")
  expect(frame).toContain("[A] Sincronização automática ON")
  expect(frame).toContain("O remoto substituirá alterações locais")
  expect(frame).toContain("[Enter] Substituir e sincronizar")
  const next = tui.renderer.root.findDescendantById("terminal-project-sync-next-page")
  if (!next) throw new Error("Sync preview next-page action did not mount")
  await act(async () => tui?.mockMouse.click(next.screenX + 1, next.screenY))
  expect(requestedPage).toBe(200)
  const confirm = tui.renderer.root.findDescendantById("terminal-project-sync-confirm-changes")
  const cancel = tui.renderer.root.findDescendantById("terminal-project-sync-cancel-changes")
  if (!confirm || !cancel) throw new Error("Sync preview actions did not mount")
  const automatic = tui.renderer.root.findDescendantById("terminal-project-sync-automatic")
  if (!automatic) throw new Error("Automatic sync action did not mount")
  await act(async () => tui?.mockMouse.click(automatic.screenX + 1, automatic.screenY))
  expect(automaticToggles).toBe(1)
  await act(async () => tui?.mockMouse.click(confirm.screenX + 1, confirm.screenY))
  expect(confirms).toBe(1)
  await act(async () => tui?.mockMouse.click(cancel.screenX + 1, cancel.screenY))
  expect(closes).toBe(1)
})
