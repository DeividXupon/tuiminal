import "./setup"
import { afterEach, expect, test } from "bun:test"
import { EmbeddedTerminalRenderable, OptimizedBuffer, RGBA, TextAttributes } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, createRef, useEffect, useState } from "react"
import { MouseTrailSurface } from "../../apps/cli/src/ui/MouseTrailSurface"
import { paintMouseBlock, paintMouseTrail } from "../../apps/cli/src/ui/mouse-trail-paint"
import { NotificationProvider, useNotifications } from "../../packages/core/src/notifications/index"
import { NOTIFICATION_ANIMATION_TIMING } from "../../packages/core/src/notifications/model"
import { COLORS } from "../../packages/core/src/settings/theme"
import { SelectionClipboard } from "../../packages/core/src/ui/SelectionClipboard"
import { DatabaseConnectionList } from "../../packages/feature-database/src/ui/DatabaseConnectionList"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

async function move(x: number, y: number) {
  await act(async () => tui?.mockMouse.moveTo(x, y))
  await tui?.renderOnce()
}

function backgroundAt(x: number, y: number) {
  const line = tui?.captureSpans().lines[y]
  let column = 0
  for (const span of line?.spans ?? []) {
    column += span.width
    if (x < column) return span.bg.toInts()
  }
  throw new Error("Missing cell")
}

test("native mouse movement paints a subtle wake without altering text or hit targets, then idles", async () => {
  tui = await testRender(
    <MouseTrailSurface>
      <box id="trail-target" width={40} height={8} backgroundColor="#101820">
        <text content="café 中文 👩‍💻" />
      </box>
    </MouseTrailSurface>,
    { width: 40, height: 8 },
  )
  await tui.renderOnce()
  const baseline = tui.captureCharFrame()
  const hit = tui.renderer.hitTest(6, 3)
  const live = tui.renderer.liveRequestCount
  await move(5, 3)
  expect(backgroundAt(5, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  expect(tui.renderer.liveRequestCount).toBe(live)
  await move(11, 3)
  expect(backgroundAt(5, 3)).toEqual(RGBA.fromHex("#101820").toInts())
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  expect(tui.captureCharFrame()).toContain("café 中文 👩‍💻")
  expect(tui.captureCharFrame().split("\n")[3]).toMatch(/[+:.]/)
  expect(tui.renderer.hitTest(6, 3)).toBe(hit)
  expect(tui.renderer.liveRequestCount).toBe(live + 1)
  await act(async () => Bun.sleep(750))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toBe(baseline)
  expect(tui.renderer.liveRequestCount).toBe(live)
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  tui.renderer.emit("blur")
  await tui.renderOnce()
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex("#101820").toInts())
})

test("the block preserves Unicode, continuation cells and text attributes", () => {
  const buffer = OptimizedBuffer.create(12, 2, "wcwidth")
  try {
    const background = RGBA.fromHex("#172335")
    const foreground = RGBA.fromHex("#dddddd")
    const block = RGBA.fromHex("#eeeeee")
    for (const x of [0, 1, 2, 3, 4, 8]) {
      buffer.clear(background)
      buffer.drawText("A中👩‍💻Z", 0, 0, foreground, background, TextAttributes.BOLD)
      const text = buffer.getRealCharBytes(false)
      paintMouseBlock(buffer, { x, y: 0 }, block)
      expect(buffer.getRealCharBytes(false)).toEqual(text)
      expect(RGBA.fromArray(buffer.buffers.bg.subarray(x * 4, x * 4 + 4)).equals(block)).toBe(true)
      if (x < 5) expect(buffer.buffers.attributes[x]).toBe(TextAttributes.BOLD)
      if (x === 2 || x === 4) {
        const leading = (x - 1) * 4
        expect(RGBA.fromArray(buffer.buffers.bg.subarray(leading, leading + 4)).equals(block)).toBe(
          true,
        )
      }
    }
    buffer.drawText("R", 0, 1, foreground, background, TextAttributes.INVERSE)
    paintMouseBlock(buffer, { x: 0, y: 1 }, block)
    expect(
      RGBA.fromArray(buffer.buffers.fg.subarray(48, 52)).equals(RGBA.fromValues(0, 0, 0)),
    ).toBe(true)
    paintMouseBlock(buffer, { x: 0, y: 1 }, RGBA.fromHex("#182030"))
    expect(
      RGBA.fromArray(buffer.buffers.fg.subarray(48, 52)).equals(RGBA.fromValues(1, 1, 1)),
    ).toBe(true)
    const before = buffer.getRealCharBytes(false)
    paintMouseBlock(buffer, { x: -1, y: 0 }, block)
    paintMouseBlock(buffer, { x: 12, y: 0 }, block)
    expect(buffer.getRealCharBytes(false)).toEqual(before)
  } finally {
    buffer.destroy()
  }
})

test("compositing preserves occupied cells, wide characters and exact background colors", () => {
  const buffer = OptimizedBuffer.create(12, 2, "wcwidth")
  try {
    const background = RGBA.fromHex("#172335")
    const foreground = RGBA.fromHex("#dddddd")
    buffer.clear(background)
    buffer.drawText("A中", 0, 0, foreground)
    const before = buffer.getRealCharBytes(false)
    const originalBackground = Array.from(buffer.buffers.bg)
    paintMouseTrail(
      buffer,
      [-1, 0, 1, 2, 5, 12].map((x) => ({ x, y: 0, glyph: "+", strength: 0.3 })),
      foreground,
    )
    expect(new TextDecoder().decode(buffer.getRealCharBytes(false))).toContain("A中  +")
    expect(buffer.getRealCharBytes(false).slice(0, 4)).toEqual(before.slice(0, 4))
    expect(Array.from(buffer.buffers.bg)).toEqual(originalBackground)
    const painted = RGBA.fromArray(buffer.buffers.fg.subarray(20, 24))
    expect(painted.r).toBeGreaterThan(background.r)
    expect(painted.r).toBeLessThan(foreground.r * 0.5)
  } finally {
    buffer.destroy()
  }
})

test("selection preserves input ownership and does not disable subsequent movement", async () => {
  tui = await testRender(
    <MouseTrailSurface>
      <SelectionClipboard>
        <text content="select this café 中文" />
        <input id="trail-input" width={30} />
        <box flexGrow={1} />
      </SelectionClipboard>
    </MouseTrailSurface>,
    { width: 40, height: 8 },
  )
  await tui.renderOnce()
  const input = tui.renderer.root.findDescendantById("trail-input")
  if (!input) throw new Error("Missing input")
  act(() => input.focus())
  const restingBackground = backgroundAt(11, 4)
  await move(5, 4)
  await move(11, 4)
  expect(tui.captureCharFrame()).toMatch(/[+:.]/)
  await act(async () => tui?.mockInput.pressKey("a"))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toMatch(/[+:.]/)
  expect(backgroundAt(11, 4)).toEqual(restingBackground)
  expect(tui.renderer.currentFocusedRenderable).toBe(input)
  expect(tui.captureCharFrame()).toContain("a")
  await move(5, 4)
  await move(11, 4)
  await act(async () => tui?.mockMouse.drag(0, 0, 5, 0))
  await tui.renderOnce()
  expect(tui.renderer.getSelection()?.getSelectedText()).toBe("select")
  await move(16, 4)
  expect(backgroundAt(16, 4)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await move(20, 4)
  expect(tui.captureCharFrame()).toMatch(/[+:.]/)
  expect(tui.renderer.getSelection()?.getSelectedText()).toBe("select")
  tui.renderer.clearSelection()
  await move(5, 4)
  await move(11, 4)
  tui.resize(30, 6)
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toMatch(/[+:.]/)
  expect(backgroundAt(11, 4)).toEqual(restingBackground)
  await move(5, 4)
  await move(11, 4)
  tui.renderer.emit("blur")
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toMatch(/[+:.]/)
  expect(backgroundAt(11, 4)).toEqual(restingBackground)
})

test("the effect overlays mouse-reporting applications while preserving their input", async () => {
  const reports: string[] = []
  tui = await testRender(
    <MouseTrailSurface>
      <embedded-terminal
        id="trail-terminal"
        width={40}
        height={6}
        onData={(data) => reports.push(new TextDecoder().decode(data))}
      />
      <box height={2} />
    </MouseTrailSurface>,
    { width: 40, height: 8 },
  )
  const terminal = tui.renderer.root.findDescendantById("trail-terminal")
  if (!(terminal instanceof EmbeddedTerminalRenderable)) throw new Error("Missing terminal")
  terminal.write("\x1b[?1003h\x1b[?1006h")
  await tui.renderOnce()
  const restingBackground = backgroundAt(5, 7)
  await move(5, 7)
  expect(backgroundAt(5, 7)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await move(5, 3)
  expect(backgroundAt(5, 7)).toEqual(restingBackground)
  await move(11, 3)
  expect(reports).toContain("\x1b[<35;12;4M")
  expect(tui.captureCharFrame()).toMatch(/[+:.]/)
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await act(async () => tui?.mockMouse.click(11, 3))
  await tui.renderOnce()
  expect(reports).toContain("\x1b[<0;12;4M")
  expect(reports).toContain("\x1b[<0;12;4m")
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await act(async () => tui?.mockMouse.scroll(11, 3, "down"))
  await tui.renderOnce()
  expect(reports).toContain("\x1b[<65;12;4M")
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await move(16, 3)
  expect(backgroundAt(16, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await act(async () => tui?.mockInput.pressKey("a"))
  expect(reports).toContain("a")
})

test("unmount removes rendering and input subscriptions and releases its live request", async () => {
  let toggle = (_enabled: boolean) => {}
  function Harness() {
    const [enabled, setEnabled] = useState(false)
    toggle = setEnabled
    return enabled ? (
      <MouseTrailSurface>
        <box flexGrow={1} />
      </MouseTrailSurface>
    ) : (
      <box />
    )
  }
  tui = await testRender(<Harness />, { width: 40, height: 8 })
  const renderer = tui.renderer
  const events = ["resize", "blur", "selection"]
  const counts = events.map((event) => renderer.listenerCount(event))
  const keys = renderer.keyInput.listenerCount("keypress")
  const data = renderer.stdin.listenerCount("data")
  const live = renderer.liveRequestCount
  for (let attempt = 0; attempt < 3; attempt++) {
    act(() => toggle(true))
    await tui.renderOnce()
    await move(5, 3)
    if (attempt < 2) await move(11, 3)
    expect(renderer.liveRequestCount).toBe(live + (attempt < 2 ? 1 : 0))
    act(() => toggle(false))
    await tui.renderOnce()
    expect(events.map((event) => renderer.listenerCount(event))).toEqual(counts)
    expect(renderer.keyInput.listenerCount("keypress")).toBe(keys)
    expect(renderer.stdin.listenerCount("data")).toBe(data)
    expect(renderer.liveRequestCount).toBe(live)
    expect(tui.captureCharFrame()).not.toMatch(/[+:.]/)
  }
})

test("database refresh and notification dismissal never disable the global overlay", async () => {
  let refreshes = 0
  let publish = () => {}
  function Controls() {
    const { notify } = useNotifications()
    useEffect(() => {
      publish = () => {
        notify({ source: "Test", kind: "info", message: "Overlay notice", durationMs: 60_000 })
      }
    }, [notify])
    return (
      <DatabaseConnectionList
        items={[]}
        selectedIndex={0}
        deleteConfirmationId={null}
        busy={false}
        notice=""
        discoveringExternal={false}
        listRef={createRef()}
        onCreate={() => {}}
        onRefresh={() => refreshes++}
        onActivate={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    )
  }
  // Keep the real notification viewport outside the trail's subtree, as in App.
  tui = await testRender(
    <NotificationProvider>
      <MouseTrailSurface>
        <Controls />
      </MouseTrailSurface>
    </NotificationProvider>,
    { width: 90, height: 24 },
  )
  await tui.renderOnce()
  const lines = tui.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes("[R]"))
  const x = lines[y]?.indexOf("[R]") ?? -1
  expect(tui.captureCharFrame()).toContain("[R]")
  expect(x).toBeGreaterThanOrEqual(0)
  await act(async () => tui?.mockMouse.click(x + 1, y))
  await tui.renderOnce()
  expect(refreshes).toBe(1)
  expect(backgroundAt(x + 1, y)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await move(5, 5)
  await move(11, 5)
  expect(tui.captureCharFrame().split("\n")[5]).toMatch(/[+:.]/)
  await act(async () => publish())
  await tui.renderOnce()
  await act(async () => Bun.sleep(NOTIFICATION_ANIMATION_TIMING.enterMs + 40))
  await tui.renderOnce()
  const card = tui.renderer.root.findDescendantById("app-notification-0")
  const close = tui.renderer.root.findDescendantById("app-notification-dismiss-0")
  if (!card || !close) throw new Error("Missing notification")
  await move(card.screenX + 5, card.screenY + 2)
  await move(card.screenX + 11, card.screenY + 2)
  expect(backgroundAt(card.screenX + 11, card.screenY + 2)).toEqual(
    RGBA.fromHex(COLORS.text).toInts(),
  )
  expect(
    tui
      .captureCharFrame()
      .split("\n")
      [card.screenY + 2]?.slice(card.screenX + 5, card.screenX + 11),
  ).toMatch(/[+:.]/)
  const closeX = close.screenX + 1
  const closeY = close.screenY
  await move(closeX, closeY)
  expect(backgroundAt(closeX, closeY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await act(async () => tui?.mockMouse.click(closeX, closeY))
  await tui.renderOnce()
  expect(backgroundAt(closeX, closeY)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await act(async () => Bun.sleep(NOTIFICATION_ANIMATION_TIMING.exitMs + 40))
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toContain("Overlay notice")
  await move(5, 5)
  await move(11, 5)
  expect(backgroundAt(11, 5)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  expect(tui.captureCharFrame().split("\n")[5]).toMatch(/[+:.]/)
})

test("fragmented mouse packets work and bracketed paste cannot produce a fake pointer", async () => {
  tui = await testRender(
    <MouseTrailSurface>
      <box flexGrow={1} />
    </MouseTrailSurface>,
    { width: 40, height: 8 },
  )
  await tui.renderOnce()
  const restingBackground = backgroundAt(11, 3)
  async function send(data: string) {
    await act(async () => {
      tui?.renderer.stdin.emit("data", Buffer.from(data))
    })
    await tui?.renderOnce()
  }
  await send("\x1b[<35;12;")
  expect(backgroundAt(11, 3)).toEqual(restingBackground)
  await send("4M")
  expect(backgroundAt(11, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
  await send("\x1b[200~\x1b[<35;6;")
  await send("4M\x1b[201~")
  expect(backgroundAt(5, 3)).toEqual(restingBackground)
  expect(backgroundAt(11, 3)).toEqual(restingBackground)
  await move(5, 3)
  expect(backgroundAt(5, 3)).toEqual(RGBA.fromHex(COLORS.text).toInts())
})
