import "./setup"
import { afterEach, expect, mock, test } from "bun:test"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
} from "../../packages/core/src/keyboard/bindings"
import { ShortcutScope } from "../../packages/core/src/keyboard/react"
import { HttpClient } from "../../packages/feature-http/src/HttpClient"
import { HttpSourcePicker } from "../../packages/feature-http/src/ui/HttpSourcePicker"
import { openLocalHttp } from "./http-source"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  setToolShortcuts("http", getDefaultShortcuts("http"))
})
async function key(name: string, shift = false) {
  await act(async () => {
    tui!.mockInput.pressKey(name, { shift })
    if (name === "ESCAPE") await Bun.sleep(60)
  })
  await tui!.renderOnce()
}

test("HTTP source chooser uses its actual configurable L/P actions and matching hints", async () => {
  setToolShortcuts("http", validateShortcuts("http", { "source-picker": { l: "F6", p: "F7" } }))
  const select = mock((_mode: "local" | "postman") => undefined)
  tui = await testRender(<HttpSourcePicker active onSelect={select} />, { width: 100, height: 30 })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("[F6]")
  expect(tui.captureCharFrame()).toContain("[F7]")
  await key("l")
  await key("p")
  expect(select).not.toHaveBeenCalled()
  await key("F6")
  await key("F7")
  expect(select.mock.calls).toEqual([["local"], ["postman"]])
})

test("HTTP request remaps its method command without intercepting URL typing", async () => {
  setToolShortcuts(
    "http",
    validateShortcuts("http", {
      url: { "Shift+m": "F6" },
      request: { "Shift+m": "F6" },
      response: { "Shift+m": "F7" },
    }),
  )
  tui = await testRender(<HttpClient active />, { width: 120, height: 38 })
  await openLocalHttp(tui)
  const input = tui.renderer.root.findDescendantById("http-url-input") as InputRenderable
  expect(input).toBeDefined()
  const original = input.value
  await key("END")
  await key("m", true)
  expect(input.value).toBe(`${original}M`)
  await key("ESCAPE")
  await key("r")
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toMatch(/GET\s+\[F6\]/)
  await key("m", true)
  expect(tui.captureCharFrame()).toMatch(/GET\s+\[F6\]/)
  await key("F6")
  expect(tui.captureCharFrame()).toMatch(/POST\s+\[F6\]/)
})

test("a scoped native response viewport remaps scroll keys after direct handlers", async () => {
  setToolShortcuts("http", validateShortcuts("http", { response: { Down: "F6" } }))
  const direct = mock((name: string) => name)
  tui = await testRender(
    <ShortcutScope tool="http" context="response" rootId="response-scroll">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Native focused scrollbox exercises keyboard dispatch. */}
      <scrollbox
        id="response-scroll"
        focused
        height={6}
        scrollY
        onKeyDown={(event) => {
          direct(event.name)
        }}
      >
        {Array.from({ length: 30 }, (_, index) => `row ${index}`).map((row) => (
          <text key={row} content={row} height={1} />
        ))}
      </scrollbox>
    </ShortcutScope>,
    { width: 60, height: 10 },
  )
  await tui.renderOnce()
  const scroll = tui.renderer.root.findDescendantById("response-scroll") as ScrollBoxRenderable
  const start = scroll.scrollTop
  await key("DOWN")
  expect(scroll.scrollTop).toBe(start)
  await key("F6")
  expect(direct).toHaveBeenLastCalledWith("down")
  expect(scroll.scrollTop).toBeGreaterThan(start)
})
