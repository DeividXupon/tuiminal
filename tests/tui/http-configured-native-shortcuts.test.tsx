import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TextareaRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
} from "../../packages/core/src/keyboard/bindings"
import { ShortcutScope } from "../../packages/core/src/keyboard/react"
import { createScratchRequest } from "../../packages/feature-http/src/model/workspace"
import { HttpRequestDocs } from "../../packages/feature-http/src/ui/HttpRequestDocs"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  setToolShortcuts("http", getDefaultShortcuts("http"))
})

function Documentation() {
  const [description, setDescription] = useState("")
  return (
    <ShortcutScope tool="http" context="request">
      <HttpRequestDocs
        request={{ ...createScratchRequest("configured-docs"), description }}
        visible
        focused
        onFocus={() => undefined}
        onChange={setDescription}
      />
    </ShortcutScope>
  )
}

async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    if (name === "ESCAPE") await Bun.sleep(60)
  })
  await tui?.renderOnce()
}

test("HTTP native docs callbacks follow configured Enter and Escape while preserving literal typing", async () => {
  setToolShortcuts("http", validateShortcuts("http", { request: { Enter: "F6", Esc: "F7" } }))
  tui = await testRender(<Documentation />, { width: 100, height: 25 })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("[F6]")
  await key("RETURN")
  expect(tui.renderer.root.findDescendantById("http-docs-editor-configured-docs")).toBeUndefined()
  await key("F6")
  const editor = tui.renderer.root.findDescendantById(
    "http-docs-editor-configured-docs",
  ) as TextareaRenderable
  expect(editor).toBeDefined()
  expect(tui.captureCharFrame()).toContain("[F7]")
  await act(async () => tui?.mockInput.typeText("qmn"))
  expect(editor.plainText).toBe("qmn")
  await key("ESCAPE")
  expect(tui.renderer.root.findDescendantById("http-docs-editor-configured-docs")).toBe(editor)
  await key("F7")
  expect(tui.renderer.root.findDescendantById("http-docs-editor-configured-docs")).toBeUndefined()
})
