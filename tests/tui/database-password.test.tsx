import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { PasswordInputRenderable } from "../../src/shared/ui/PasswordInput"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test.each(["中文secret", "🧪token", "abc"])(
  "password masking covers every occupied terminal cell for %s",
  async (value) => {
    tui = await testRender(<password-input id="password" value={value} width={12} />, {
      width: 12,
      height: 1,
    })
    await tui.renderOnce()
    expect(tui.captureCharFrame().trim()).toBe("*".repeat([...value].length))
    const input = tui.renderer.root.findDescendantById("password")
    if (!(input instanceof PasswordInputRenderable)) throw new Error("Missing password input")
    act(() => {
      input.focus()
      input.value = "界x"
    })
    await tui.renderOnce()
    expect(tui.captureCharFrame().trim()).toBe("**")
  },
)

test("password stays masked through keyboard edits, horizontal movement and resize", async () => {
  tui = await testRender(<password-input id="password" width="100%" />, { width: 8, height: 1 })
  const input = tui.renderer.root.findDescendantById("password")
  if (!(input instanceof PasswordInputRenderable)) throw new Error("Missing password input")
  act(() => input.focus())
  await act(async () => tui?.mockInput.typeText("中文long-fixture"))
  await tui.renderOnce()
  expect(input.plainText).toBe("中文long-fixture")
  expect(tui.captureCharFrame().trim()).toBe("********")
  await act(async () => tui?.mockInput.pressKey("HOME"))
  await tui.renderOnce()
  expect(tui.captureCharFrame().trim()).toBe("********")
  act(() => tui?.resize(20, 1))
  await tui.renderOnce()
  expect(tui.captureCharFrame().trim()).toBe("*".repeat([...input.plainText].length))
  act(() => {
    input.value = ""
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame().trim()).toBe("")
})
