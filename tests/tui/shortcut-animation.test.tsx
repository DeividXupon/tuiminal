import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { COLORS } from "../../packages/core/src/settings/theme"
import { DirectionalButton } from "../../packages/core/src/ui/DirectionalButton"
import { InlineButton } from "../../packages/core/src/ui/InlineButton"
import { ShortcutText } from "../../packages/core/src/ui/ShortcutText"
import { TEXT_SHIMMER_FRAME_MS } from "../../packages/core/src/ui/text-shimmer"
import { WorkspaceRepaintBoundary } from "../../packages/core/src/ui/workspace-repaint"

let tui: TestRendererSetup | undefined
const originalStaticLoaders = process.env.TUIMINAL_TEST_STATIC_LOADERS

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  if (originalStaticLoaders === undefined) delete process.env.TUIMINAL_TEST_STATIC_LOADERS
  else process.env.TUIMINAL_TEST_STATIC_LOADERS = originalStaticLoaders
})

test("shared hints animate on one clock, pause while hidden and retire on unmount", async () => {
  process.env.TUIMINAL_TEST_STATIC_LOADERS = "0"
  const intervals = spyOn(globalThis, "setInterval")
  const clears = spyOn(globalThis, "clearInterval")
  let setVisible!: (visible: boolean) => void
  function Fixture() {
    const [visible, updateVisible] = useState(true)
    setVisible = updateVisible
    return (
      <WorkspaceRepaintBoundary transitionKey="shortcuts" visible={visible}>
        <ShortcutText content="[Enter]" />
        <InlineButton label="[Ctrl+S]" onPress={() => undefined} />
        <DirectionalButton direction={1} onPress={() => undefined} />
        <InlineButton label="[X]" shortcutBaseColor={COLORS.danger} onPress={() => undefined} />
        <ShortcutText content="log [Enter]" highlight={false} />
        <ShortcutText content="Plain label" />
        <ShortcutText content="[N]" shortcutsMuted />
      </WorkspaceRepaintBoundary>
    )
  }
  try {
    tui = await testRender(<Fixture />, { width: 40, height: 10 })
    const rendered = tui
    const colors = () =>
      rendered
        .captureSpans()
        .lines.slice(0, 7)
        .map((line) =>
          line.spans
            .filter((span) => span.text.trim())
            .map((span) => span.fg.toInts().join(","))
            .join("|"),
        )
    const clocks = () =>
      intervals.mock.calls.flatMap((call, index) =>
        call[1] === TEXT_SHIMMER_FRAME_MS ? [intervals.mock.results[index]?.value] : [],
      )
    const expectAnimation = async () => {
      await rendered.renderOnce()
      const first = colors()
      const text = rendered.captureCharFrame()
      const deadline = Date.now() + 3_000
      while (Date.now() < deadline) {
        await act(async () => Bun.sleep(TEXT_SHIMMER_FRAME_MS))
        await rendered.renderOnce()
        if (
          colors()
            .slice(0, 4)
            .every((color, index) => color !== first[index])
        )
          break
      }
      expect(
        colors()
          .slice(0, 4)
          .every((color, index) => color !== first[index]),
      ).toBe(true)
      expect(colors().slice(4)).toEqual(first.slice(4))
      expect(rendered.captureCharFrame()).toBe(text)
    }
    await expectAnimation()
    expect(clocks()).toHaveLength(1)
    const firstTimer = clocks()[0]
    await act(async () => setVisible(false))
    await rendered.renderOnce()
    expect(clears).toHaveBeenCalledWith(firstTimer)
    const paused = colors()
    await act(async () => Bun.sleep(TEXT_SHIMMER_FRAME_MS * 2))
    await rendered.renderOnce()
    expect(colors()).toEqual(paused)
    await act(async () => setVisible(true))
    await expectAnimation()
    expect(clocks()).toHaveLength(2)
    const resumedTimer = clocks()[1]
    act(() => rendered.renderer.destroy())
    tui = undefined
    expect(clears).toHaveBeenCalledWith(resumedTimer)
  } finally {
    act(() => tui?.renderer.destroy())
    tui = undefined
    intervals.mockRestore()
    clears.mockRestore()
  }
})
