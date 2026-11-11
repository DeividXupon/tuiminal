import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { LANGUAGE_OPTIONS, translateUi } from "../../packages/core/src/i18n"
import { TERMINAL_PROJECT_MESSAGES } from "../../packages/core/src/i18n/terminal-project-catalog"
import russian from "../../packages/core/src/i18n/ru.json"
import { AgentProjectEnvironmentDialog } from "../../packages/feature-terminal/src/ui/AgentProjectEnvironmentDialog"
import type { AgentProjectTarget } from "../../packages/feature-terminal/src/model/agent-project"

let tui: TestRendererSetup | undefined
const selected: AgentProjectTarget[] = []
let closed = 0
const profiles = Array.from({ length: 12 }, (_, index) => ({
  id: `fixture-${index}`,
  name: `Servidor ${index + 1}`,
  host: `fixture-${index + 1}`,
}))
function profileAt(index: number) {
  const profile = profiles[index]
  if (!profile) throw new Error(`Missing profile ${index}`)
  return profile
}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  selected.length = 0
  closed = 0
})
async function mount(
  width = 80,
  height = 26,
  options: Partial<Parameters<typeof AgentProjectEnvironmentDialog>[0]> = {},
) {
  await act(async () => {
    tui = await testRender(
      <AgentProjectEnvironmentDialog
        profiles={profiles}
        loading={false}
        error=""
        onSelect={(target) => selected.push(target)}
        onClose={() => {
          closed++
        }}
        {...options}
      />,
      { width, height, kittyKeyboard: true },
    )
  })
  await tui?.renderOnce()
}
function item(id: string) {
  const result = tui?.renderer.root.findDescendantById(`terminal-dialog-project-environment${id}`)
  if (!result) throw new Error(`Missing environment control: ${id}`)
  return result
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await tui?.renderOnce()
  })
}
async function click(id: string) {
  const target = item(id)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
    await tui?.renderOnce()
  })
}

test("environment labels have translations in every supported language", () => {
  for (const message of TERMINAL_PROJECT_MESSAGES.slice(0, 5)) {
    for (const [index, language] of LANGUAGE_OPTIONS.entries()) {
      const expected =
        language.id === "ru" ? russian[message[1] as keyof typeof russian] : message[index]
      if (expected === undefined) throw new Error(`Missing translation: ${language.id}`)
      expect(translateUi(message[0], language.id)).toBe(expected)
    }
  }
})

test.each([
  [80, 26],
  [48, 16],
  [40, 12],
])(
  "environment choices and actions fit at %sx%s and scroll to the selected alias",
  async (width, height) => {
    await mount(width, height)
    const modal = item("s")
    const local = item("-0")
    const footer = item("-footer")
    expect(local.screenY + local.height).toBeLessThan(footer.screenY)
    expect(footer.screenY + footer.height).toBeLessThan(modal.screenY + modal.height)
    for (const suffix of ["-cancel", "-select"]) {
      const button = item(suffix)
      expect(button.screenX).toBeGreaterThan(modal.screenX)
      expect(button.screenX + button.width).toBeLessThan(modal.screenX + modal.width)
    }
    await key("ARROW_UP")
    await tui?.renderOnce()
    expect(tui?.captureCharFrame()).toContain("Servidor 12")
    expect(item("-12").screenY + item("-12").height).toBeLessThanOrEqual(footer.screenY)
    await key("RETURN")
    expect(selected).toEqual([{ kind: "remote", profile: profileAt(11) }])
    await key("ESCAPE")
    expect(closed).toBe(1)
  },
)

test("reopening selects the current environment and a row click chooses its exact alias once", async () => {
  const profile = profiles[1]
  if (!profile) throw new Error("Missing profile")
  await mount(80, 26, { target: { kind: "remote", profile } })
  expect(tui?.captureCharFrame()).toContain("Em uso")
  expect(tui?.captureCharFrame()).toContain("ssh fixture-2")
  await click("-select")
  expect(selected).toEqual([{ kind: "remote", profile }])
  await click("-1")
  expect(selected).toEqual([
    { kind: "remote", profile },
    { kind: "remote", profile: profileAt(0) },
  ])
})

test.each(["", "Não foi possível ler ~/.ssh/config."])(
  "empty or failed discovery keeps Local available (%s)",
  async (error) => {
    await mount(48, 16, { profiles: [], error })
    expect(tui?.captureCharFrame()).toContain(error || "Nenhum alias SSH encontrado.")
    await click("-0")
    expect(selected).toEqual([{ kind: "local" }])
    await click("-cancel")
    expect(closed).toBe(1)
  },
)

test.each([false, true])(
  "loading and inactive views cannot select environments (inactive: %s)",
  async (inactive) => {
    await mount(48, 16, { loading: !inactive, inactive })
    await key("RETURN")
    await click("-0")
    expect(selected).toEqual([])
    await key("ESCAPE")
    expect(closed).toBe(inactive ? 0 : 1)
  },
)
