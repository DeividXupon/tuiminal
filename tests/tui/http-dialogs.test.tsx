import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { ReactNode } from "react"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import { writeFileSync } from "node:fs"
import { InlineButton } from "../../packages/core/src/ui/InlineButton"
import { updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpCurlModal } from "../../packages/feature-http/src/ui/HttpCurlModal"
import { HttpRequestFileModal } from "../../packages/feature-http/src/ui/HttpRequestFileModal"
import { HttpCollectionImportModal } from "../../packages/feature-http/src/ui/HttpCollectionImportModal"
import { HttpCollectionRunnerModal } from "../../packages/feature-http/src/ui/HttpCollectionRunnerModal"
import { HttpEnvironmentManagerModal } from "../../packages/feature-http/src/ui/HttpEnvironmentManagerModal"
import { HttpPostmanSaveModal } from "../../packages/feature-http/src/ui/HttpPostmanSaveModal"

let tui: TestRendererSetup | undefined
const noop = () => {}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function mount(view: ReactNode, width = 52, height = 16) {
  tui = await testRender(<box style={{ flexGrow: 1 }}>{view}</box>, { width, height })
  await settle(() => true)
}
function node(id: string) {
  const value = tui?.renderer.root.findDescendantById(id)
  if (!value) throw new Error(`Missing ${id}`)
  return value
}
async function click(id: string) {
  await settle(() => true)
  const target = node(id)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}
function inside(id: string, owner: string) {
  const target = node(id),
    dialog = node(owner)
  expect(target.screenX).toBeGreaterThan(dialog.screenX)
  expect(target.screenX + target.width).toBeLessThan(dialog.screenX + dialog.width)
  expect(target.screenY + target.height).toBeLessThan(dialog.screenY + dialog.height)
}
const dimensions = { terminalWidth: 52, terminalHeight: 16 }

for (const layout of ["framed", "compact"] as const) {
  test(`HTTP dialogs keep primary actions inside their border in ${layout}`, async () => {
    updateUiSettings({ layout, language: "pt-BR" })
    const cases: [string, string, ReactNode][] = [
      [
        "http-curl-modal",
        "http-curl-import-apply",
        <HttpCurlModal
          key="HttpCurlModal"
          {...dimensions}
          mode="curl-import"
          curl=""
          command="curl https://example.test/users"
          onCommandChange={noop}
          onApplyImport={noop}
          onCopy={noop}
          onClose={noop}
        />,
      ],
      [
        "http-request-file-modal",
        "http-request-move-apply",
        <HttpRequestFileModal
          key="HttpRequestFileModal"
          {...dimensions}
          mode="request-move"
          requestName="Users"
          currentPath="api/users.http"
          targetPath="api/new.http"
          onTargetPathChange={noop}
          onApply={noop}
          onClose={noop}
        />,
      ],
      [
        "http-collection-import-modal",
        "http-collection-import-apply",
        <HttpCollectionImportModal
          key="HttpCollectionImportModal"
          {...dimensions}
          sourcePath=""
          preview={null}
          busy={false}
          error=""
          onSourcePathChange={noop}
          onApply={noop}
          onBack={noop}
          onClose={noop}
        />,
      ],
      [
        "http-collection-runner-modal",
        "http-collection-runner-run",
        <HttpCollectionRunnerModal
          key="HttpCollectionRunnerModal"
          {...dimensions}
          targetName="A long collection name that must fit"
          datasetPath=""
          concurrency={2}
          status="idle"
          cases={[]}
          error=""
          pendingTlsApproval={null}
          onDatasetPathChange={noop}
          onCycleTarget={noop}
          onCycleConcurrency={noop}
          onRun={noop}
          onApproveInsecureTls={noop}
          onClose={noop}
        />,
      ],
    ]
    for (const [dialog, action, view] of cases) {
      await mount(view)
      inside(action, dialog)
      expect(Boolean(node(`${dialog}-backdrop`))).toBe(true)
      if (process.env.HTTP_DIALOG_CAPTURE)
        writeFileSync(
          `${process.env.HTTP_DIALOG_CAPTURE}/${layout}-${dialog}.json`,
          JSON.stringify(tui?.captureSpans()),
        )
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
  })
}

test("environment creation starts typing immediately and Tab reaches variable cells", async () => {
  let saved: unknown
  await mount(
    <HttpEnvironmentManagerModal
      {...dimensions}
      environments={[]}
      globals={undefined}
      activeName={null}
      onSelect={noop}
      onClose={noop}
      onCreate={async (input) => {
        saved = input
        return { environmentName: input.environmentName }
      }}
      onReplace={async () => ({ environmentName: "unused" })}
      onDelete={async () => ({ environmentName: "unused" })}
      onSaveGlobals={async () => ({ environmentName: "Globals" })}
    />,
  )
  await click("http-environment-new")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-name")
  await act(async () => tui?.mockInput.typeText("Local"))
  await act(async () => tui?.mockInput.pressKey("TAB"))
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-variable-0",
  )
  await act(async () => tui?.mockInput.typeText("baseUrl"))
  await act(async () => tui?.mockInput.pressKey("TAB"))
  await settle(
    () => tui?.renderer.currentFocusedRenderable?.id === "http-environment-create-value-0",
  )
  await act(async () => tui?.mockInput.typeText("https://example.test"))
  await click("http-environment-create-save")
  expect(saved).toEqual({
    environmentName: "Local",
    variables: [{ name: "baseUrl", value: "https://example.test" }],
  })
  await click("http-environment-close")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-environment-new")))
})

test("Postman save keeps the keyboard-selected destination visible", async () => {
  let selected = ""
  await mount(
    <HttpPostmanSaveModal
      {...dimensions}
      files={Array.from({ length: 25 }, (_, i) => ({ path: `postman/collection-${i}.http` }))}
      folders={[]}
      requestName="Users"
      onSelect={(path) => {
        selected = path
      }}
      onClose={noop}
    />,
  )
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-postman-save-modal")
  await act(async () => {
    for (let i = 0; i < 24; i++) tui?.mockInput.pressKey("ARROW_DOWN")
  })
  await settle(() => tui?.captureCharFrame().includes("collection-24") ?? false)
  await act(async () => tui?.mockInput.pressEnter())
  expect(selected).toBe("postman/collection-24.http")
})

test("cURL dialog blocks the workspace and exposes working import and close actions", async () => {
  let backgroundPresses = 0
  let imported = ""
  let closed = false
  await mount(
    <>
      <InlineButton
        id="http-modal-background-action"
        label="Background"
        onPress={() => {
          backgroundPresses++
        }}
      />
      <HttpCurlModal
        {...dimensions}
        mode="curl-import"
        curl=""
        command="curl https://example.test/users"
        onCommandChange={noop}
        onApplyImport={(command) => {
          imported = command
        }}
        onCopy={noop}
        onClose={() => {
          closed = true
        }}
      />
    </>,
  )
  await act(async () => tui?.mockMouse.click(1, 0))
  expect(backgroundPresses).toBe(0)
  expect(closed).toBe(false)
  await click("http-curl-import-apply")
  expect(imported).toBe("curl https://example.test/users")
  await click("http-curl-modal-close")
  expect(closed).toBe(true)
})
