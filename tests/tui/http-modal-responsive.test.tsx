import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { useTerminalDimensions } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, type ReactNode, useState } from "react"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"
import { createScratchRequest } from "../../packages/feature-http/src/model/workspace"
import { HttpCollectionImportModal } from "../../packages/feature-http/src/ui/HttpCollectionImportModal"
import { HttpCurlModal } from "../../packages/feature-http/src/ui/HttpCurlModal"
import {
  HttpEnvironmentDeleteConfirm,
  HttpEnvironmentManagerShell,
} from "../../packages/feature-http/src/ui/HttpEnvironmentManagerShell"
import { HttpExternalConflictModal } from "../../packages/feature-http/src/ui/HttpExternalConflictModal"
import { HttpRequestFileModal } from "../../packages/feature-http/src/ui/HttpRequestFileModal"

let tui: TestRendererSetup | undefined
const settings = getUiSettings()
const noop = () => {}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(settings)
})
async function mount(view: ReactNode, width: number, height: number) {
  tui = await testRender(view, { width, height })
  await settle(() => true)
}
async function settle(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
function node(id: string) {
  const found = tui?.renderer.root.findDescendantById(id)
  if (!found) throw new Error(`Missing ${id}`)
  return found
}
function inside(id: string, owner: string) {
  const item = node(id)
  const dialog = node(owner)
  expect(item.width, id).toBeGreaterThan(0)
  expect(item.screenX, id).toBeGreaterThan(dialog.screenX)
  expect(item.screenX + item.width, id).toBeLessThan(dialog.screenX + dialog.width)
  expect(item.screenY, id).toBeGreaterThan(dialog.screenY)
  expect(item.screenY + item.height, id).toBeLessThan(dialog.screenY + dialog.height)
}

for (const language of ["pt-BR", "en", "ru", "ja"] as const) {
  for (const [width, height] of [
    [40, 12],
    [52, 16],
    [80, 24],
  ] as const) {
    test(`conflict actions remain usable at ${width}x${height} (${language})`, async () => {
      updateUiSettings({ language })
      let resolution = ""
      await mount(
        <HttpExternalConflictModal
          terminalWidth={width}
          terminalHeight={height}
          conflict={{
            documentId: "fixture",
            requestName: "Users [D] / 日本語",
            path: "api/very-long/".repeat(8),
            canUseExternal: false,
            diff: [
              { kind: "remove", text: "GET https://example.test/old" },
              { kind: "add", text: "GET https://example.test/new" },
            ],
          }}
          busy={false}
          onResolve={(value) => {
            resolution = value
          }}
          onClose={noop}
        />,
        width,
        height,
      )
      for (const action of ["reload", "apply-local", "save-copy", "close"])
        inside(`http-external-conflict-${action}`, "http-external-conflict-modal")
      if (height < 20) {
        const content = node("http-external-conflict-modal-content")
        expect(content.height).toBeGreaterThan(0)
        expect(content.screenY + content.height).toBeLessThanOrEqual(
          node("http-external-conflict-modal-footer").screenY,
        )
      }
      const copy = node("http-external-conflict-save-copy")
      await act(async () => tui?.mockMouse.click(copy.screenX + 1, copy.screenY))
      expect(resolution).toBe("save-copy")
    })

    test(`cURL preview stays above its actions at ${width}x${height} (${language})`, async () => {
      updateUiSettings({ language })
      await mount(
        <HttpCurlModal
          terminalWidth={width}
          terminalHeight={height}
          mode="curl-import"
          command="curl https://example.test/users"
          curl=""
          onCommandChange={noop}
          onApplyImport={noop}
          onCopy={noop}
          onClose={noop}
        />,
        width,
        height,
      )
      inside("http-curl-import-apply", "http-curl-modal")
      const preview = node("http-curl-import-preview")
      expect(preview.screenY + preview.height).toBeLessThanOrEqual(
        node("http-curl-modal-footer").screenY,
      )
      const editor = node("http-curl-import-editor")
      expect(editor.height).toBeGreaterThan(0)
      expect(editor.screenY + editor.height).toBeLessThanOrEqual(preview.screenY)
    })

    test(`long request context keeps the focused destination visible at ${width}x${height} (${language})`, async () => {
      updateUiSettings({ language })
      let value = ""
      await mount(
        <HttpRequestFileModal
          terminalWidth={width}
          terminalHeight={height}
          mode="request-move"
          requestName="Users [D] / 日本語"
          currentPath={`${"api/very-long/".repeat(16)}users.http`}
          targetPath="destination.http"
          onTargetPathChange={(next) => {
            value = next
          }}
          onApply={noop}
          onClose={noop}
        />,
        width,
        height,
      )
      await settle(() => tui?.captureCharFrame().includes("destination.http") ?? false)
      inside("http-request-move-apply", "http-request-file-modal")
      inside("http-request-move-input", "http-request-file-modal")
      expect(tui?.renderer.currentFocusedRenderable?.id).toBe("http-request-move-input")
      expect(tui?.captureCharFrame()).toContain("destination.http")
      await act(async () => tui?.mockInput.typeText("x"))
      expect(value).toContain("x")
    })

    test(`import review wraps translated actions at ${width}x${height} (${language})`, async () => {
      updateUiSettings({ language })
      let applied = 0
      const request = createScratchRequest("fixture")
      await mount(
        <HttpCollectionImportModal
          terminalWidth={width}
          terminalHeight={height}
          sourcePath="/synthetic/collection.json"
          preview={{
            format: "postman",
            sourcePath: "/synthetic/collection.json",
            sourceName: "Collection",
            sourceDigest: "fixture",
            plannedPath: "imported/collection.http",
            conflicts: 1,
            report: {
              format: "postman",
              requests: [request],
              ignored: ["script"],
              warnings: ["warning"],
            },
          }}
          error=""
          busy={false}
          onSourcePathChange={noop}
          onBack={noop}
          onClose={noop}
          onApply={() => {
            applied++
          }}
        />,
        width,
        height,
      )
      for (const action of ["apply", "back", "modal-close"])
        inside(`http-collection-import-${action}`, "http-collection-import-modal")
      const button = node("http-collection-import-apply")
      await act(async () => tui?.mockMouse.click(button.screenX + 1, button.screenY))
      expect(applied).toBe(1)
    })
  }
}

test("resizing a scrollable HTTP form retains its input, draft, focus and listener lifetime", async () => {
  function Form() {
    const terminal = useTerminalDimensions()
    const [path, setPath] = useState("destination.http")
    const [open, setOpen] = useState(true)
    if (!open) return null
    return (
      <HttpRequestFileModal
        terminalWidth={terminal.width}
        terminalHeight={terminal.height}
        mode="request-move"
        requestName="Users"
        currentPath={"api/very-long/".repeat(16)}
        targetPath={path}
        onTargetPathChange={setPath}
        onApply={noop}
        onClose={() => setOpen(false)}
      />
    )
  }
  await mount(<Form />, 80, 24)
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-request-move-input")
  const input = node("http-request-move-input")
  const listeners = tui?.renderer.listenerCount("focused_renderable") ?? 0
  await act(async () => tui?.mockInput.typeText("x"))
  await act(async () => tui?.renderer.resize(40, 12))
  await settle(
    () =>
      node("http-request-file-modal").width === 38 &&
      (tui?.captureCharFrame().includes("destination.httpx") ?? false),
  )
  expect(node("http-request-move-input")).toBe(input)
  expect(tui?.renderer.currentFocusedRenderable).toBe(input)
  inside("http-request-move-input", "http-request-file-modal")
  expect(tui?.renderer.listenerCount("focused_renderable")).toBe(listeners)
  const close = node("http-request-file-modal-close")
  await act(async () => tui?.mockMouse.click(close.screenX + 1, close.screenY))
  expect(tui?.renderer.listenerCount("focused_renderable")).toBe(listeners - 1)
})

test("environment deletion keeps cancellation reachable with a long name and error", async () => {
  let cancelled = false
  await mount(
    <HttpEnvironmentManagerShell
      terminalWidth={40}
      terminalHeight={12}
      width={38}
      height={10}
      closeLabel="[Esc] Voltar"
      onClose={noop}
    >
      <HttpEnvironmentDeleteConfirm
        name={"Production environment ".repeat(5)}
        error={"Synthetic error ".repeat(5)}
        width={34}
        busy={false}
        onCancel={() => {
          cancelled = true
        }}
        onConfirm={noop}
      />
    </HttpEnvironmentManagerShell>,
    40,
    12,
  )
  inside("http-environment-delete-cancel", "http-environment-manager-modal")
  inside("http-environment-delete-confirm", "http-environment-manager-modal")
  const cancel = node("http-environment-delete-cancel")
  await act(async () => tui?.mockMouse.click(cancel.screenX + 1, cancel.screenY))
  expect(cancelled).toBe(true)
})
