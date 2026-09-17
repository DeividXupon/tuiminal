import "./setup"
import { afterEach, expect, test } from "bun:test"
import { InputRenderable, RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { HttpEnvironmentCreateForm } from "../../packages/feature-http/src/ui/HttpEnvironmentManagerContent"
import { COLORS } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
const noop = () => {}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function SecretForm({
  initialSecret = "",
  mode = "cell",
}: {
  initialSecret?: string
  mode?: "cell" | "table"
}) {
  const [secret, setSecret] = useState(initialSecret)
  return (
    <HttpEnvironmentCreateForm
      formKind="create"
      name="fixture"
      rows={[{ id: "fixture", name: "fakeToken", value: secret }]}
      mode={mode}
      target="table"
      rowIndex={0}
      column={1}
      busy={false}
      error=""
      onNameChange={noop}
      onRowChange={(_index, _column, value) => setSecret(value)}
      onChooseName={noop}
      onChooseTable={noop}
      onSave={noop}
      onFocusName={noop}
      onFocusCell={noop}
    />
  )
}

function secretInput() {
  const input = tui?.renderer.root.findDescendantById("http-environment-create-value-0")
  if (!(input instanceof InputRenderable)) throw new Error("Missing HTTP secret input")
  return input
}

function renderedSecret(input: InputRenderable) {
  return tui
    ?.captureCharFrame()
    .split("\n")
    [input.screenY]?.slice(input.screenX, input.screenX + input.width)
    .trimEnd()
}

test.each(["中文fixture", "🧪fake-token", "abc"])(
  "HTTP environment value is visible while editing %s",
  async (value) => {
    tui = await testRender(<SecretForm initialSecret={value} />, { width: 64, height: 22 })
    await tui.renderOnce()
    const input = secretInput()
    expect(input.plainText).toBe(value)
    expect(tui.captureCharFrame()).toContain(value)
    act(() => input.focus())
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain(value)
    expect(renderedSecret(input)).not.toContain("***")
  },
)

test("HTTP environment value stays readable while its navigation cell is highlighted", async () => {
  tui = await testRender(<SecretForm initialSecret="中文fixture" mode="table" />, {
    width: 64,
    height: 22,
  })
  await tui.renderOnce()
  const input = secretInput()
  expect(input.backgroundColor.equals(RGBA.fromHex(COLORS.http))).toBe(true)
  expect(tui.captureCharFrame()).toContain("中文fixture")
})

test("HTTP environment value stays visible through editing and resizing", async () => {
  tui = await testRender(<SecretForm />, { width: 64, height: 22 })
  const input = secretInput()
  act(() => input.focus())
  const value = `中文${"long-fake-fixture".repeat(4)}`
  await act(async () => tui?.mockInput.typeText(value))
  await tui.renderOnce()
  expect(input.plainText).toBe(value)
  expect(renderedSecret(input)).toContain("long-fake-fixture")
  await act(async () => tui?.mockInput.pressKey("HOME"))
  await tui.renderOnce()
  expect(renderedSecret(input)).toContain("中文")
  act(() => tui?.resize(120, 22))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("中文long-fake-fixture")
  act(() => {
    input.value = ""
  })
  await tui.renderOnce()
  expect(input.plainText).toBe("")
  expect(renderedSecret(input)).toContain("valor privado")
})
