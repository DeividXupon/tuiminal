import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { ModalSurface } from "../../packages/core/src/ui/ModalSurface"
import { PlasmaLoadingOverlay } from "../../packages/core/src/ui/PlasmaLoadingOverlay"
import {
  useWorkspaceRepaint,
  WorkspaceRepaintBoundary,
} from "../../packages/core/src/ui/workspace-repaint"
import { outputScreen } from "./output-screen"

let tui: TestRendererSetup | undefined
let screen: ReturnType<typeof outputScreen> | undefined
afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  screen?.destroy()
  screen = undefined
})

async function idle() {
  await act(async () => tui?.waitForVisualIdle())
}

test("nested transitions coalesce, hidden work stays incremental, and recovery preserves native editors", async () => {
  let changeView!: (value: string) => void
  let changeHiddenView!: (value: string) => void
  let showHidden!: (value: boolean) => void
  let openModal!: (value: boolean) => void
  function HiddenView({ revision }: { revision: string }) {
    useWorkspaceRepaint(revision)
    return <text content={`HIDDEN ${revision}`} />
  }
  function Harness() {
    const [view, setView] = useState("first")
    const [revision, setRevision] = useState("initial")
    const [visible, setVisible] = useState(false)
    const [modal, setModal] = useState(false)
    changeView = setView
    changeHiddenView = setRevision
    showHidden = setVisible
    openModal = setModal
    return (
      <box backgroundColor="#123456" flexGrow={1}>
        <text content="HEADER café 中 🧪" fg="#ddee44" attributes={1} height={1} />
        <WorkspaceRepaintBoundary transitionKey={view}>
          <input id="retained-editor" focused width={30} />
          <text content={`VIEW ${view}`} />
          <WorkspaceRepaintBoundary transitionKey={view}>
            <text content="Nested surface" />
          </WorkspaceRepaintBoundary>
        </WorkspaceRepaintBoundary>
        <box visible={visible}>
          <WorkspaceRepaintBoundary transitionKey="retained" visible={visible}>
            <HiddenView revision={revision} />
          </WorkspaceRepaintBoundary>
        </box>
        {modal && (
          <ModalSurface
            id="repaint-modal"
            width={30}
            height={6}
            zIndex={10}
            borderColor="#abcdef"
            onBackdropPress={() => setModal(false)}
          >
            <text content="Modal" />
          </ModalSurface>
        )}
      </box>
    )
  }
  screen = outputScreen(120, 30)
  tui = await testRender(<Harness />, {
    width: 120,
    height: 30,
    stdout: screen.stdout,
    bufferedOutput: "stdout",
    useThread: false,
  })
  await idle()
  const renderer = tui.renderer
  const editor = renderer.root.findDescendantById("retained-editor")
  if (!editor) throw new Error("Missing retained editor")
  await act(async () => tui?.mockInput.typeText("kept input"))
  await idle()
  const cursor = renderer.getCursorState()
  const listeners = renderer.listenerCount("frame")
  const fullFrames: number[] = []
  const count = () => {
    // Native stats count glyph leaders; the dimmer may replace wide glyphs.
    if ((tui?.getNativeStats().cellsUpdated ?? 0) >= 120 * 30 - 2) fullFrames.push(renderer.frameId)
  }
  renderer.on("frame", count)
  try {
    renderer.once("frame", () => screen?.leaveStaleCells())
    await act(async () => {
      changeView("intermediate")
      changeView("latest")
      changeHiddenView("updated offscreen")
    })
    await idle()
    expect(fullFrames).toHaveLength(1)
    expect(screen.read()).toBe(tui.captureCharFrame())
    expect(screen.read()).toContain("VIEW latest")
    expect(screen.read()).toContain("kept input")
    expect(renderer.root.findDescendantById("retained-editor")).toBe(editor)
    expect(renderer.currentFocusedRenderable).toBe(editor)
    expect(renderer.getCursorState()).toEqual(cursor)
    expect(renderer.listenerCount("frame")).toBe(listeners + 1)
    const expectedHeader = tui.captureSpans().lines[0]?.spans.map((span) => ({
      text: span.text,
      width: span.width,
      fg: span.fg.toInts(),
      bg: span.bg.toInts(),
      attributes: span.attributes,
    }))
    expect(
      screen.spans()[0]?.spans.map((span) => ({
        text: span.text,
        width: span.width,
        fg: span.fg.toInts(),
        bg: span.bg.toInts(),
        attributes: span.attributes,
      })),
    ).toEqual(expectedHeader)

    fullFrames.length = 0
    await act(async () => changeHiddenView("still hidden"))
    await idle()
    await tui.renderOnce()
    expect(fullFrames).toHaveLength(0)
    expect(tui.getNativeStats().cellsUpdated).toBe(0)

    for (const [update, expectedFullFrames] of [
      [() => showHidden(true), 1],
      [() => showHidden(false), 1],
      // The dimmer naturally changes every cell, followed by one recovery frame.
      [() => openModal(true), 2],
      [() => openModal(false), 2],
    ] as const) {
      fullFrames.length = 0
      renderer.once("frame", () => screen?.leaveStaleCells())
      await act(async () => update())
      await idle()
      expect(fullFrames).toHaveLength(expectedFullFrames)
      expect(screen.read()).toBe(tui.captureCharFrame())
    }
  } finally {
    renderer.off("frame", count)
  }
})

test("loading animation frames remain incremental and recover when their surface leaves", async () => {
  let setLoading!: (value: boolean) => void
  function Harness() {
    const [loading, update] = useState(false)
    setLoading = update
    return (
      <box backgroundColor="#123456" flexGrow={1}>
        <text content="HEADER" />
        <box flexGrow={1}>
          <text content="Retained content" />
          <PlasmaLoadingOverlay id="repaint-loader" active={loading} label="Loading" animate />
        </box>
      </box>
    )
  }
  tui = await testRender(<Harness />, { width: 80, height: 24 })
  await idle()
  const updates: number[] = []
  const count = () => updates.push(tui?.getNativeStats().cellsUpdated ?? 0)
  tui.renderer.on("frame", count)
  try {
    await act(async () => setLoading(true))
    await act(async () => Bun.sleep(300))
    expect(tui.renderer.root.findDescendantById("repaint-loader")).toBeDefined()
    expect(updates.filter((value) => value === 80 * 24)).toHaveLength(1)
    expect(updates.filter((value) => value > 0 && value < 80 * 24).length).toBeGreaterThan(1)
    updates.length = 0
    await act(async () => setLoading(false))
    for (let attempt = 0; attempt < 100; attempt++) {
      await act(async () => Bun.sleep(10))
      if (!tui.renderer.root.findDescendantById("repaint-loader")) break
    }
    await idle()
    expect(tui.renderer.root.findDescendantById("repaint-loader")).toBeUndefined()
    expect(updates.filter((value) => value === 80 * 24)).toHaveLength(1)
    await tui.renderOnce()
    expect(tui.getNativeStats().cellsUpdated).toBe(0)
  } finally {
    tui.renderer.off("frame", count)
  }
})

test("destroying a renderer with pending recovery releases its callbacks", async () => {
  function Harness() {
    useWorkspaceRepaint("pending")
    return <text content="Owned surface" />
  }
  tui = await testRender(<Harness />, { width: 40, height: 12 })
  const renderer = tui.renderer
  await act(async () => renderer.destroy())
  expect(renderer.listenerCount("frame")).toBe(0)
  expect(renderer.listenerCount("destroy")).toBe(0)
  expect(renderer.getSchedulerState().hasScheduledRender).toBe(false)
  tui = undefined
})
