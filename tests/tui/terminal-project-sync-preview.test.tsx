import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { RemoteProjectSyncPreview } from "../../packages/feature-terminal/src/model/remote-project-sync"
import { RemoteProjectSyncPreviewDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncPreviewDialog"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function manifest(path: string) {
  return {
    fingerprint: "a".repeat(64),
    canonicalPath: path,
    entries: [],
    hasUnsupported: false,
    hasSymlink: false,
  }
}

test("sync preview lists actions and uses one explicit destructive confirmation", async () => {
  let confirms = 0
  let closes = 0
  const preview: RemoteProjectSyncPreview = {
    localPath: "/local/project-sync",
    remote: manifest("/remote/project"),
    local: manifest("/local/project-sync"),
    hasLocalChanges: true,
    legacyLocalChanges: false,
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
      preview={preview}
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
  act(() => dialog.focus())
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("terminal-project-sync-preview")
  const frame = tui.captureCharFrame()
  expect(frame).toContain("ITENS FORA DE SINCRONIA")
  expect(frame).toContain("src/new.ts")
  expect(frame).toContain("Conflito")
  expect(frame).toContain("[Enter] Substituir e sincronizar")
  const confirm = tui.renderer.root.findDescendantById("terminal-project-sync-confirm-changes")
  const cancel = tui.renderer.root.findDescendantById("terminal-project-sync-cancel-changes")
  if (!confirm || !cancel) throw new Error("Sync preview actions did not mount")
  await act(async () => tui?.mockMouse.click(confirm.screenX + 1, confirm.screenY))
  expect(confirms).toBe(1)
  await act(async () => tui?.mockMouse.click(cancel.screenX + 1, cancel.screenY))
  expect(closes).toBe(1)
})
