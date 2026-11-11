import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { LANGUAGE_OPTIONS, translateUi } from "../../packages/core/src/i18n"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import type { RemoteProjectSyncReview } from "../../packages/feature-terminal/src/model/remote-project-sync"
import { RemoteProjectSyncDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncDialog"
import { RemoteProjectSyncPreviewDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncPreviewDialog"
import { RemoteProjectSyncProgressDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncProgressDialog"

const settings = getUiSettings()
let tui: TestRendererSetup | undefined
const remote = {
  profile: { id: "fixture", name: "Fixture", host: "fixture-host" },
  workingDirectory: "/srv/[project]/store",
}
const localPath = "/local/[copy]/store-sync"
const review: RemoteProjectSyncReview = {
  jobId: "fixture",
  localPath,
  changeCount: 30,
  counts: { add: 10, update: 10, delete: 10, conflict: 2 },
  hasLocalChanges: true,
  legacyLocalChanges: false,
  difference: "both",
  indicator: { changeCount: 30, difference: "both" },
  offset: 0,
  pageSize: 10,
  changes: Array.from({ length: 10 }, (_, index) => ({
    path: `src/file-${index}.ts`,
    action: "update",
    localChanged: index === 0,
    remoteChanged: true,
    transferBytes: 10,
  })),
}
const noop = () => {}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})
function item(id: string) {
  const node = tui?.renderer.root.findDescendantById(`terminal-project-sync-${id}`)
  if (!node) throw new Error(`Missing sync control: ${id}`)
  return node
}
function inside(childId: string, parentId: string) {
  const child = item(childId)
  const parent = item(parentId)
  expect(child.screenX).toBeGreaterThan(parent.screenX)
  expect(child.screenX + child.width).toBeLessThan(parent.screenX + parent.width)
  expect(child.screenY).toBeGreaterThan(parent.screenY)
  expect(child.screenY + child.height).toBeLessThan(parent.screenY + parent.height)
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
  })
  await tui?.renderOnce()
}

for (const language of LANGUAGE_OPTIONS) {
  for (const [width, height] of [
    [40, 12],
    [60, 24],
  ] as const) {
    for (const kind of ["confirm", "preview", "progress"] as const) {
      test(`sync ${kind} keeps actions visible at ${width}x${height} (${language.id})`, async () => {
        updateUiSettings({ language: language.id })
        const view =
          kind === "confirm" ? (
            <RemoteProjectSyncDialog
              kind="replace"
              remote={remote}
              localPath={localPath}
              onConfirm={noop}
              onClose={noop}
            />
          ) : kind === "preview" ? (
            <RemoteProjectSyncPreviewDialog
              remote={remote}
              review={review}
              automatic
              onToggleAutomatic={noop}
              onConfirm={noop}
              onClose={noop}
              onPage={noop}
            />
          ) : (
            <RemoteProjectSyncProgressDialog
              remote={remote}
              localPath={localPath}
              automatic
              onToggleAutomatic={noop}
              onCancel={noop}
              status={{ kind: "syncing", localPath, phase: "transferring", progress: 0.64 }}
            />
          )
        await act(async () => {
          tui = await testRender(view, { width, height, kittyKeyboard: true })
        })
        await tui?.renderOnce()
        const modal = item(kind)
        expect(modal.width).toBeLessThanOrEqual(width - 2)
        expect(modal.height).toBeLessThanOrEqual(height - 2)
        inside(kind === "preview" ? "cancel-changes" : `cancel-${kind}`, kind)
        if (kind !== "progress")
          inside(kind === "preview" ? "confirm-changes" : "confirm-action", kind)
        if (kind !== "confirm") inside("automatic", kind)
        expect(tui?.captureCharFrame()).toContain(translateUi("[Esc] Cancelar"))
        if (kind === "progress") expect(tui?.captureCharFrame()).toContain("64%")
      })
    }
  }
}

test("compact review scrolls, pages from the top and toggles without confirming", async () => {
  let confirms = 0
  let closes = 0
  function Fixture() {
    const [offset, setOffset] = useState(0)
    const [automatic, setAutomatic] = useState(false)
    return (
      <RemoteProjectSyncPreviewDialog
        remote={remote}
        review={{
          ...review,
          offset,
          changes: review.changes.map((change) => ({
            ...change,
            path: `${offset}/${change.path}`,
          })),
        }}
        automatic={automatic}
        onToggleAutomatic={() => setAutomatic((value) => !value)}
        onPage={setOffset}
        onConfirm={() => {
          confirms++
        }}
        onClose={() => {
          closes++
        }}
      />
    )
  }
  await act(async () => {
    tui = await testRender(<Fixture />, { width: 48, height: 16, kittyKeyboard: true })
  })
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("fixture-host")
  for (let index = 0; index < 10; index++) await key("ARROW_DOWN")
  expect(tui?.captureCharFrame()).toContain("0/src/file-9.ts")
  await key("ARROW_RIGHT")
  expect(tui?.captureCharFrame()).toContain("fixture-host")
  const automatic = item("automatic")
  await act(async () => {
    await tui?.mockMouse.click(automatic.screenX + 1, automatic.screenY)
  })
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("automática ON")
  expect(confirms).toBe(0)
  await key("RETURN")
  expect(confirms).toBe(1)
  await key("ESCAPE")
  expect(closes).toBe(1)
})

test("cancelling preserves the restoration status and blocks repeated cancel input", async () => {
  let cancels = 0
  await act(async () => {
    tui = await testRender(
      <RemoteProjectSyncProgressDialog
        remote={remote}
        localPath={localPath}
        automatic={false}
        onToggleAutomatic={noop}
        onCancel={() => {
          cancels++
        }}
        status={{ kind: "cancelling", localPath }}
      />,
      { width: 40, height: 12, kittyKeyboard: true },
    )
  })
  await tui?.renderOnce()
  expect(tui?.captureCharFrame()).toContain("Cancelando e restaurando")
  expect(tui?.captureCharFrame()).toContain("cópia")
  expect(tui?.captureCharFrame()).toContain("local…")
  const button = item("cancel-progress")
  await act(async () => {
    await tui?.mockMouse.click(button.screenX + 1, button.screenY)
  })
  await key("ESCAPE")
  expect(cancels).toBe(0)
})
