import "./setup"
import { afterEach, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { ACTION_KEY_COLOR } from "../../packages/core/src/ui/brand"
import {
  TerminalInlineButton,
  TerminalShortcutAnimation,
  TerminalShortcutText,
} from "../../packages/feature-terminal/src/ui/TerminalShortcut"

let tui: TestRendererSetup | undefined
const originalStaticLoaders = process.env.TUIMINAL_TEST_STATIC_LOADERS

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (originalStaticLoaders === undefined) delete process.env.TUIMINAL_TEST_STATIC_LOADERS
  else process.env.TUIMINAL_TEST_STATIC_LOADERS = originalStaticLoaders
})

test("Terminal hints and buttons shimmer, pause when inactive and resume", async () => {
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "0"
  let setActive!: (active: boolean) => void
  function Fixture() {
    const [active, updateActive] = useState(true)
    setActive = updateActive
    return (
      <TerminalShortcutAnimation active={active}>
        <TerminalShortcutText content="[Ctrl+B]" actionKeys={["[Ctrl+B]"]} />
        <TerminalInlineButton
          label="[Ctrl+B]"
          actionKeys={["[Ctrl+B]"]}
          onPress={() => undefined}
        />
        <TerminalShortcutText highlight={false} content="log [Ctrl+B]" />
      </TerminalShortcutAnimation>
    )
  }
  const rendered = await testRender(<Fixture />, { width: 50, height: 6 })
  tui = rendered
  const colors = (row: number) => {
    const line = rendered.captureSpans().lines[row]
    if (!line) throw new Error(`Missing shortcut row ${row}`)
    return line.spans
      .filter((span) => span.text.trim())
      .map((span) => span.fg.toInts().join(","))
      .join("|")
  }
  const expectAnimation = async () => {
    await rendered.renderOnce()
    const first = [colors(0), colors(1)]
    const log = colors(2)
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      await act(async () => Bun.sleep(60))
      await rendered.renderOnce()
      if (colors(0) !== first[0] && colors(1) !== first[1]) break
    }
    expect(colors(0)).not.toBe(first[0])
    expect(colors(1)).not.toBe(first[1])
    expect(colors(2)).toBe(log)
    expect(rendered.captureCharFrame()).toContain("log [Ctrl+B]")
  }
  await expectAnimation()
  await act(async () => setActive(false))
  await tui.renderOnce()
  const purple = RGBA.fromHex(ACTION_KEY_COLOR).toInts().join(",")
  expect(colors(0)).toBe(purple)
  expect(colors(1)).toBe(purple)
  await act(async () => setActive(true))
  await expectAnimation()
})
