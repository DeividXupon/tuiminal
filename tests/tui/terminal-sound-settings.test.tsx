import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import { act, useEffect } from "react"
import { useConfigurationLayer } from "../../apps/cli/src/hooks/use-configuration-layer"
import { WorkspaceConfigurationOverlay } from "../../apps/cli/src/ui/WorkspaceConfigurationOverlay"
import * as components from "../../apps/cli/src/features/components"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
let preview: ReturnType<typeof spyOn<typeof components, "previewTerminalAgentSound">> | undefined
const settings = getUiSettings()

function Fixture() {
  const configuration = useConfigurationLayer("terminal")
  useEffect(() => configuration.openSettings(), [configuration.openSettings])
  useKeyboard((key) => {
    if (!key.defaultPrevented) configuration.handleKey(key, () => undefined)
  })
  return (
    <WorkspaceConfigurationOverlay
      configuration={configuration}
      context="terminal"
      tutorialScreen="terminal"
      queryHistoryCount={0}
      onOpenSensitiveTerms={() => undefined}
      onOpenQueryHistory={() => undefined}
      onStartTutorial={() => undefined}
      onOpenFeatures={() => undefined}
      onGitConfigurationChanged={() => undefined}
      onConfigureRemoteServer={() => undefined}
    />
  )
}

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  preview?.mockRestore()
  updateUiSettings(settings)
})

async function key(name: string) {
  await act(async () => {
    tui!.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 70 : 5)
  })
  await tui!.renderOnce()
}

async function click(id: string) {
  const target = tui!.renderer.root.findDescendantById(id)
  expect(target).toBeDefined()
  await act(async () =>
    tui!.mockMouse.click(target!.screenX + Math.floor(target!.width / 2), target!.screenY),
  )
  await tui!.renderOnce()
}

async function mount(width = 120) {
  updateUiSettings({
    language: "en",
    terminalAgentSounds: { question: "question_004", completed: "select_004", error: "error_005" },
  })
  preview = spyOn(components, "previewTerminalAgentSound").mockResolvedValue("played")
  tui = await testRender(<Fixture />, { width, height: 32 })
  await tui.renderOnce()
  await key("j")
}

test("Term Agents settings choose, persist, preview and mute each sound with the keyboard", async () => {
  await mount()
  expect(tui!.captureCharFrame()).toContain("AGENT SOUNDS")
  await key("l")
  expect(getUiSettings().terminalAgentSounds.question).toBe("question_003")
  await key("p")
  expect(preview!.mock.calls.at(-1)?.[0]).toBe("question_003")
  expect(tui!.captureCharFrame()).toContain("Sound played")
  await key("2")
  await key("l")
  expect(getUiSettings().terminalAgentSounds.completed).toBe("select_005")
  await key("p")
  expect(preview!.mock.calls.at(-1)?.[0]).toBe("select_005")
  await key("3")
  await key("h")
  expect(getUiSettings().terminalAgentSounds.error).toBeNull()
  const calls = preview!.mock.calls.length
  await key("p")
  expect(preview!.mock.calls).toHaveLength(calls)
  await key("ESCAPE")
  expect(Boolean(tui!.renderer.root.findDescendantById("configuration-modal"))).toBe(false)
})

test("compact settings support mouse previews, report unavailable audio and cancel on close", async () => {
  await mount(60)
  await click("configuration-sound-completed-next")
  expect(getUiSettings().terminalAgentSounds.completed).toBe("select_005")
  preview!.mockResolvedValueOnce("unavailable")
  await click("configuration-sound-completed-preview")
  expect(tui!.captureCharFrame()).toContain("No audio player is available.")
  let signal: AbortSignal | undefined
  preview!.mockImplementation((_id, value) => {
    signal = value
    return new Promise((resolve) =>
      value!.addEventListener("abort", () => resolve("cancelled"), { once: true }),
    )
  })
  await click("configuration-sound-question-preview")
  expect(signal?.aborted).toBe(false)
  await key("ESCAPE")
  expect(signal?.aborted).toBe(true)
})
