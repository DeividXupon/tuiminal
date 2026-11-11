import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { BoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { ConfirmationNotification } from "../../packages/core/src/notifications/index"
import { InlineButton } from "../../packages/core/src/ui/InlineButton"

let tui: TestRendererSetup | undefined
let show: (() => void) | undefined
let removeOrigin: (() => void) | undefined
let confirmAction: (() => Promise<boolean>) | undefined
const decisions: boolean[] = []
const mocks: { mockRestore: () => void }[] = []
function Harness() {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(true)
  show = () => setOpen(true)
  removeOrigin = () => setOrigin(false)
  const decide = (confirmed: boolean) => {
    decisions.push(confirmed)
    setOpen(false)
  }
  return (
    <box flexGrow={1}>
      {origin ? <input id="origin" value="My [A] request" /> : null}
      <InlineButton id="fallback" label="Voltar" onPress={() => {}} />
      {open ? (
        <ConfirmationNotification
          id="decision"
          title="EXCLUIR"
          target="store visi [X] / 名前 / coleção com nome longo para revisão"
          message="Confirme a exclusão deste item e de seu conteúdo."
          confirmLabel="[Enter] Excluir"
          returnFocusId="fallback"
          onConfirm={async () => {
            if (confirmAction && !(await confirmAction())) return
            decide(true)
          }}
          onCancel={() => decide(false)}
        />
      ) : null}
    </box>
  )
}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const mock of mocks.splice(0)) mock.mockRestore()
  decisions.length = 0
  confirmAction = undefined
})
function node(id: string) {
  const found = tui?.renderer.root.findDescendantById(id)
  if (!found) throw new Error(`Missing ${id}:\n${tui?.captureCharFrame()}`)
  return found
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 80; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    await Bun.sleep(name === "ESCAPE" ? 70 : 10)
  })
  await tui?.renderOnce()
}
async function open() {
  act(() => {
    node("origin").focus()
    show?.()
  })
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "decision")
}

for (const width of [32, 52, 120])
  test(`decision notification traps input, remains open and restores focus at ${width} columns`, async () => {
    tui = await testRender(<Harness />, { width, height: 24 })
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("origin")))
    await open()
    const card = node("decision")
    expect(card.screenX).toBeGreaterThanOrEqual(0)
    expect(card.screenX + card.width).toBeLessThanOrEqual(width)
    for (const id of ["decision-confirm", "decision-cancel"]) {
      const button = node(id)
      expect(button.screenX + button.width).toBeLessThanOrEqual(card.screenX + card.width)
      expect(button.screenY + button.height).toBeLessThanOrEqual(card.screenY + card.height)
    }
    await act(async () => {
      await tui?.mockMouse.click(0, 20)
      tui?.mockInput.typeText("n?d")
    })
    await key("F10")
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("decision")
    expect(decisions).toEqual([])
    // Advancing wall time beyond ordinary notification lifetimes cannot dismiss a decision.
    const now = Date.now() + 90_000
    mocks.push(spyOn(Date, "now").mockReturnValue(now))
    await act(async () => Bun.sleep(80))
    expect(node("decision")).toBe(card)
    await key("ESCAPE")
    expect(decisions).toEqual([false])
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("origin")
    await open()
    await act(async () => {
      tui?.mockInput.pressEnter()
      tui?.mockInput.pressEnter()
    })
    await settle(() => !tui?.renderer.root.findDescendantById("decision"))
    expect(decisions).toEqual([false, true])
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("origin")
  })

test("decision glow animates only while mounted, and a removed origin uses the fallback", async () => {
  const interval = spyOn(globalThis, "setInterval")
  const clear = spyOn(globalThis, "clearInterval")
  mocks.push(interval, clear)
  tui = await testRender(<Harness />, { width: 100, height: 24 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("origin")))
  await open()
  const animationIndex = interval.mock.calls.findIndex((call) => call[1] === 50)
  expect(animationIndex).toBeGreaterThanOrEqual(0)
  const animationHandle = interval.mock.results[animationIndex]?.value
  const color = (node("decision") as BoxRenderable).borderColor
  await act(async () => Bun.sleep(150))
  expect((node("decision") as BoxRenderable).borderColor).not.toEqual(color)
  act(() => removeOrigin?.())
  await key("ESCAPE")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("fallback")
  expect(clear.mock.calls.some((call) => call[0] === animationHandle)).toBe(true)
})

test("decision buttons work by mouse and Tab can select refusal", async () => {
  tui = await testRender(<Harness />, { width: 100, height: 24 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("origin")))
  for (const id of ["decision-cancel", "decision-confirm"]) {
    await open()
    const button = node(id)
    await act(async () => {
      await tui?.mockMouse.click(button.screenX + 1, button.screenY)
    })
    await settle(() => !tui?.renderer.root.findDescendantById("decision"))
    expect(tui.renderer.currentFocusedRenderable?.id).toBe("origin")
  }
  await open()
  await key("TAB")
  await key("RETURN")
  expect(decisions).toEqual([false, true, false])
})

test("a pending action cannot submit twice and a failed action leaves a usable decision", async () => {
  let attempts = 0
  let finish: ((success: boolean) => void) | undefined
  confirmAction = () => {
    attempts++
    return new Promise((resolve) => {
      finish = resolve
    })
  }
  tui = await testRender(<Harness />, { width: 100, height: 24 })
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("origin")))
  await open()
  await key("RETURN")
  await key("RETURN")
  await key("ESCAPE")
  expect(attempts).toBe(1)
  expect(decisions).toEqual([])
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("decision")
  await act(async () => finish?.(false))
  expect(node("decision")).toBeDefined()
  await key("ESCAPE")
  expect(decisions).toEqual([false])
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("origin")
})
