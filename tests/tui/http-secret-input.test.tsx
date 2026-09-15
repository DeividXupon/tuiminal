import "./setup"
import { afterEach, expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { HttpPrivateEnvironmentForm } from "../../packages/feature-http/src/ui/HttpEnvironmentManagerContent"
import { translateUi } from "../../packages/core/src/i18n/index"

let tui: TestRendererSetup | undefined
const noop = () => {}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

function SecretForm({ initialSecret = "" }: { initialSecret?: string }) {
  const [secret, setSecret] = useState(initialSecret)
  return (
    <HttpPrivateEnvironmentForm
      environmentName="fixture"
      variableName="fakeToken"
      secret={secret}
      addToGitignore
      storeInKeychain={false}
      busy={false}
      error=""
      privateEnvironmentPath="fixture/http-client.private.env.json"
      onEnvironmentNameChange={noop}
      onVariableNameChange={noop}
      onSecretChange={setSecret}
      onToggleGitignore={noop}
      onToggleKeychain={noop}
      onBack={noop}
      onSave={noop}
    />
  )
}

function secretInput() {
  const input = tui?.renderer.root.findDescendantById("http-environment-create-secret")
  if (!(input instanceof InputRenderable)) throw new Error("Missing HTTP secret input")
  return input
}

function renderedSecret(input: InputRenderable) {
  return tui?.captureCharFrame().split("\n")[input.screenY]?.slice(input.screenX).trimEnd()
}

test.each(["中文fixture", "🧪fake-token", "abc"])(
  "HTTP private environment masks every occupied cell for %s",
  async (value) => {
    tui = await testRender(<SecretForm initialSecret={value} />, { width: 64, height: 22 })
    await tui.renderOnce()
    const input = secretInput()
    expect(input.plainText).toBe(value)
    expect(renderedSecret(input)).toBe("*".repeat([...value].length))
    act(() => input.focus())
    await tui.renderOnce()
    expect(renderedSecret(input)).toBe("*".repeat([...value].length))
  },
)

test("HTTP secret stays masked through typing, horizontal movement, resize and clearing", async () => {
  tui = await testRender(<SecretForm />, { width: 64, height: 22 })
  const input = secretInput()
  act(() => input.focus())
  const value = `中文${"long-fake-fixture".repeat(4)}`
  await act(async () => tui?.mockInput.typeText(value))
  await tui.renderOnce()
  expect(input.plainText).toBe(value)
  // The native input may extend past the clipped form; cover every visible cell.
  expect(renderedSecret(input)).toBe("*".repeat(64 - input.screenX))
  await act(async () => tui?.mockInput.pressKey("HOME"))
  await tui.renderOnce()
  expect(renderedSecret(input)).toBe("*".repeat(64 - input.screenX))
  act(() => tui?.resize(120, 22))
  await tui.renderOnce()
  expect(renderedSecret(input)).toBe("*".repeat([...input.plainText].length))
  act(() => {
    input.value = ""
  })
  await tui.renderOnce()
  expect(input.plainText).toBe("")
  expect(renderedSecret(input)).toBe(translateUi("não será exibido"))
})
